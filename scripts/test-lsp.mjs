// The language server (src/selfhost/lsp.js) on a two-file program: what each
// request answers, diagnostics as the text changes, and the same exchange
// through `utu lsp` on stdin and stdout.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadNodeCompiler, nodeHost } from '../src/selfhost/node.js';
import { createLanguageServer } from '../src/selfhost/lsp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SHAPES = `mod shapes {
    /// A point in the plane.
    struct &:
        | x : I32
        | y : I32

    /// Makes a point.
    fn &.new(x: I32, y: I32) & {
        &{ x: x, y: y };
    }

    fn &.sum |self| () I32 {
        self.x + self.y;
    }
}
`;
const MAIN = `using shapes |Point| from "./_shapes.utu";

/// Twice the *sum*
/// of a point's coordinates.
fn twice(p: Point) I32 {
    let total = p.sum();
    total * 2;
}

export lib {
    fn run() I32 { twice(Point.new(1, 2)); }
}

test "twice" {
    assert twice(Point.new(1, 2)) == 6;
}
`;

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-lsp-'));
try {
  await fs.writeFile(path.join(dir, '_shapes.utu'), SHAPES);
  await fs.writeFile(path.join(dir, 'main.utu'), MAIN);
  const main = pathToFileURL(path.join(dir, 'main.utu')).href;
  const shapes = pathToFileURL(path.join(dir, '_shapes.utu')).href;

  const sent = [];
  const host = nodeHost({ root: dir });
  const server = createLanguageServer({
    utu: await loadNodeCompiler(), hostFor: () => host, send: message => sent.push(message),
    toKey: uri => fileURLToPath(uri), toUri: key => key.startsWith('std:') ? null : pathToFileURL(key).href,
  });
  let id = 0;
  const ask = async (method, params) => {
    const n = sent.length;
    await server.handle({ jsonrpc: '2.0', id: ++id, method, params });
    const answer = sent.slice(n).find(m => m.id === id);
    assert.ok(!answer.error, `${method}: ${answer.error?.message}`);
    return answer.result;
  };
  const tell = async (method, params) => { await server.handle({ jsonrpc: '2.0', method, params }); await server.idle(); };
  const diagnostics = () => sent.filter(m => m.method === 'textDocument/publishDiagnostics').at(-1)?.params.diagnostics;
  // The position of `marker`'s first character (after `skip` of them) in `text`.
  const at = (text, marker, skip = 0, uri = main) => {
    let i = -1;
    for (let k = 0; k <= skip; k++) i = text.indexOf(marker, i + 1);
    const before = text.slice(0, i).split('\n');
    return { textDocument: { uri }, position: { line: before.length - 1, character: before.at(-1).length } };
  };

  const capabilities = (await ask('initialize', { capabilities: {} })).capabilities;
  for (const c of ['definitionProvider', 'referencesProvider', 'hoverProvider', 'renameProvider', 'completionProvider', 'documentSymbolProvider', 'semanticTokensProvider']) {
    assert.ok(capabilities[c], c);
  }
  await tell('textDocument/didOpen', { textDocument: { uri: main, languageId: 'utu', version: 1, text: MAIN } });
  assert.equal(diagnostics(), undefined, 'a program without errors has none published');

  // Hover: a local's type, a function's signature and doc comment.
  const local = await ask('textDocument/hover', at(MAIN, 'total * 2'));
  assert.match(local.contents.value, /total: I32/);
  const fn = await ask('textDocument/hover', at(MAIN, 'twice(Point'));
  assert.match(fn.contents.value, /fn twice\(p: Point\) I32/);
  assert.match(fn.contents.value, /Twice the \*\*sum\*\*\nof a point's coordinates\./);
  const param = await ask('textDocument/hover', at(MAIN, 'p.sum'));
  assert.doesNotMatch(param.contents.value, /Twice/, 'a parameter has no doc comment of its function');

  // Definitions: a function, and a method resolved by its receiver's type.
  const twiceDef = await ask('textDocument/definition', at(MAIN, 'twice(Point'));
  assert.deepEqual(twiceDef, { uri: main, range: { start: { line: 4, character: 3 }, end: { line: 4, character: 8 } } });
  const sumDef = await ask('textDocument/definition', at(MAIN, 'sum()'));
  assert.equal(sumDef.uri, shapes);
  assert.deepEqual(sumDef.range.start, { line: 11, character: 9 });

  // References, highlights, rename.
  const refs = await ask('textDocument/references', { ...at(MAIN, 'twice', 1), context: { includeDeclaration: true } });
  assert.equal(refs.length, 3, 'declared, and called in run and in the test');
  const noDecl = await ask('textDocument/references', { ...at(MAIN, 'twice', 1), context: { includeDeclaration: false } });
  assert.equal(noDecl.length, 2);
  const highlights = await ask('textDocument/documentHighlight', at(MAIN, 'total'));
  assert.deepEqual(highlights.map(h => h.kind), [3, 2], 'written where declared, read after');
  const prepared = await ask('textDocument/prepareRename', at(MAIN, 'total'));
  assert.equal(prepared.placeholder, 'total');
  const rename = await ask('textDocument/rename', { ...at(MAIN, 'total'), newName: 'sum2' });
  assert.equal(rename.changes[main].length, 2);
  assert.equal(await ask('textDocument/prepareRename', at(MAIN, 'I32')), null, 'the standard library is not renamed');
  // An import's alias is renamed where this file spells it: the alias, a
  // type written with it, a call through it (not the module's own \`&\`).
  const alias = await ask('textDocument/rename', { ...at(MAIN, 'Point) I32'), newName: 'Spot' });
  assert.deepEqual(Object.keys(alias.changes), [main]);
  assert.deepEqual(alias.changes[main].map(e => e.range.start.line), [0, 4, 10, 14]);
  // A rename the editor may not make is an error, with its reason.
  const refused = async (position, newName) => {
    const n = sent.length;
    await server.handle({ jsonrpc: '2.0', id: ++id, method: 'textDocument/rename', params: { ...position, newName } });
    return sent.slice(n).find(m => m.id === id).error;
  };
  assert.deepEqual(await refused(at(MAIN, 'total'), 'let'), { code: -32602, message: "'let' is not a name" });
  assert.equal((await refused(at(MAIN, 'I32'), 'Int')).code, -32602, 'the standard library is not renamed');

  // A position past its line's end is its end, not the next line's start.
  assert.equal(await ask('textDocument/hover', { textDocument: { uri: main }, position: { line: 2, character: 99 } }), null);

  // The outline, and semantic tokens (five numbers each).
  const symbols = await ask('textDocument/documentSymbol', { textDocument: { uri: main } });
  assert.deepEqual(symbols.map(s => s.name), ['twice', 'run']);
  // A module's own type is known by the module's name.
  const outline = await ask('textDocument/documentSymbol', { textDocument: { uri: shapes } });
  assert.deepEqual(outline.map(s => [s.name, s.children.map(c => c.name)]), [['shapes', ['shapes', 'new', 'sum']]]);
  assert.deepEqual(outline[0].children[0].selectionRange.start, { line: 2, character: 11 });
  const tokens = await ask('textDocument/semanticTokens/full', { textDocument: { uri: main } });
  assert.equal(tokens.data.length % 5, 0);
  assert.ok(tokens.data.length >= 5 * 10);

  // Completion as the text is typed: members of a value, of a module, then names in scope.
  const completing = async (text, marker) => {
    await tell('textDocument/didChange', { textDocument: { uri: main, version: ++version }, contentChanges: [{ text: text.replace(marker, '') }] });
    return (await ask('textDocument/completion', at(text, marker))).map(item => item.label);
  };
  let version = 1;
  assert.deepEqual(await completing(MAIN.replace('total * 2;', 'p.¦\n    total * 2;'), '¦'), ['x', 'y', 'sum']);
  assert.deepEqual(await completing(MAIN.replace('Point.new(1, 2));', 'Point.¦);'), '¦'), ['new', 'sum']);
  assert.ok((await completing(MAIN.replace('total * 2;', 'total.to¦\n    total * 2;'), '¦')).includes('to_str'), "an I32's methods");
  const names = await completing(MAIN.replace('total * 2;', 'to¦\n    total * 2;'), '¦');
  for (const name of ['total', 'p', 'twice', 'Point', 'Str', 'let']) assert.ok(names.includes(name), name);
  // Nothing is offered in a comment or a string.
  assert.deepEqual(await completing(MAIN.replace('total * 2;', '// to¦\n    total * 2;'), '¦'), []);
  assert.deepEqual(await completing(MAIN.replace('total * 2;', 'let s = "to¦";\n    total * 2;'), '¦'), []);

  // Diagnostics as the text changes, and cleared when it is fixed.
  await tell('textDocument/didChange', { textDocument: { uri: main, version: ++version }, contentChanges: [{ text: MAIN.replace('total * 2', 'total * nope') }] });
  assert.deepEqual(diagnostics().map(d => [d.code, d.message, d.range.start.line]), [['unknown-variable', 'Unknown variable nope', 6]]);
  await tell('textDocument/didChange', { textDocument: { uri: main, version: ++version }, contentChanges: [{ text: MAIN.replace('== 6', '== true') }] });
  assert.equal(diagnostics().length, 1, "the tests' build is checked too");
  await tell('textDocument/didChange', { textDocument: { uri: main, version: ++version }, contentChanges: [{ text: MAIN }] });
  assert.deepEqual(diagnostics(), []);

  // A @wat function's parameter is named in its text as `$x`: renamed,
  // referenced, and hovered there too (with its type as written).
  const WAT = 'fn rotl(x: I32, k: I32) I32 {\n    @wat/\\ local.get $x ;; not $x in a comment\n      local.get $k i32.rotl \\/;\n}\nexport lib { fn t() I32 { rotl(1, 2); } }\n';
  const wat = pathToFileURL(path.join(dir, 'wat.utu')).href;
  await fs.writeFile(path.join(dir, 'wat.utu'), WAT);
  await tell('textDocument/didOpen', { textDocument: { uri: wat, languageId: 'utu', version: 1, text: WAT } });
  const watRename = await ask('textDocument/rename', { ...at(WAT, 'x:', 0, wat), newName: 'y' });
  assert.deepEqual(watRename.changes[wat].map(e => [e.range.start.line, e.range.start.character]), [[0, 8], [1, 22]]);
  const watHover = await ask('textDocument/hover', at(WAT, '$x', 0, wat));
  assert.match(watHover.contents.value, /x: I32/);

  // A mistake in an import the editor has not opened is shown on it.
  await fs.writeFile(path.join(dir, '_shapes.utu'), SHAPES.replace('self.x + self.y', 'self.x + nope'));
  await tell('textDocument/didChange', { textDocument: { uri: main, version: ++version }, contentChanges: [{ text: MAIN }] });
  const onImport = sent.filter(m => m.method === 'textDocument/publishDiagnostics' && m.params.uri === shapes).at(-1);
  assert.deepEqual(onImport.params.diagnostics.map(d => [d.message, d.range.start.line]), [['Unknown variable nope', 12]]);
  await fs.writeFile(path.join(dir, '_shapes.utu'), SHAPES);
  await tell('textDocument/didChange', { textDocument: { uri: main, version: ++version }, contentChanges: [{ text: MAIN }] });
  assert.deepEqual(sent.filter(m => m.method === 'textDocument/publishDiagnostics' && m.params.uri === shapes).at(-1).params.diagnostics, [], 'and cleared when fixed');

  // An edit to an open import shows in the file that imports it.
  await tell('textDocument/didOpen', { textDocument: { uri: shapes, languageId: 'utu', version: 1, text: SHAPES } });
  await tell('textDocument/didChange', { textDocument: { uri: shapes, version: 2 }, contentChanges: [{ text: SHAPES.replace('fn &.sum', 'fn &.total') }] });
  const published = sent.filter(m => m.method === 'textDocument/publishDiagnostics' && m.params.uri === main).at(-1);
  assert.match(published.params.diagnostics[0]?.message ?? '', /sum/);

  // A fresh server, for what follows: its own documents.
  {
    const out = [];
    const fresh = createLanguageServer({
      utu: await loadNodeCompiler(), hostFor: () => host, send: message => out.push(message),
      toKey: uri => uri.startsWith('file:') ? fileURLToPath(uri) : uri, toUri: key => key.startsWith('std:') ? null : pathToFileURL(key).href,
    });
    const call = async (method, params) => {
      const n = out.length;
      await fresh.handle({ jsonrpc: '2.0', id: ++id, method, params });
      const answer = out.slice(n).find(m => m.id === id);
      return answer.error ? { error: answer.error.message } : answer.result;
    };
    const note = async (method, params) => { await fresh.handle({ jsonrpc: '2.0', method, params }); await fresh.idle(); };
    const shown = uri => out.filter(m => m.method === 'textDocument/publishDiagnostics' && m.params.uri === uri).at(-1)?.params.diagnostics;
    const file = async (name, text) => { await fs.writeFile(path.join(dir, name), text); return pathToFileURL(path.join(dir, name)).href; };
    await call('initialize', { capabilities: {} });

    // While a file does not parse, answers come from its last text that did.
    const S = 'fn g() I32 { 2; }\nfn f() I32 { let count = g(); count; }\nexport lib { fn h() I32 { f(); } }\n';
    const s = await file('s.utu', S);
    await note('textDocument/didOpen', { textDocument: { uri: s, version: 1, text: S } });
    const broken = '// above\n' + S.replace('count; }', 'count }');
    await note('textDocument/didChange', { textDocument: { uri: s, version: 2 }, contentChanges: [{ text: broken }] });
    assert.match((await call('textDocument/hover', at(broken, 'f();', 0, s))).contents.value, /fn f\(\) I32/);
    assert.deepEqual((await call('textDocument/definition', at(broken, 'g()', 0, s))).range.start, { line: 1, character: 3 });
    assert.deepEqual((await call('textDocument/documentSymbol', { textDocument: { uri: s } })).map(x => x.name), ['g', 'h'], "f's line changed");
    assert.ok((await call('textDocument/semanticTokens/full', { textDocument: { uri: s } })).data.length >= 15);
    assert.match((await call('textDocument/rename', { ...at(broken, 'g()', 0, s), newName: 'k' })).error, /does not parse/);
    await note('textDocument/didChange', { textDocument: { uri: s, version: 3 }, contentChanges: [{ text: S }] });

    // A rename to a name that would mean something else is refused.
    for (const name of ['new', 'I32', 'Str']) assert.ok((await call('textDocument/rename', { ...at(S, 'count', 1, s), newName: name })).error, name);

    // References and rename from an imported file reach the open files importing it.
    const SH = 'mod shapes {\n    struct &:\n        | x: I32\n    fn &.new(x: I32) & { &{ x: x }; }\n    fn &.sum |self| () I32 { self.x; }\n}\n';
    const M = 'using shapes |Point| from "./sh.utu";\nexport lib { fn run() I32 { let p = Point.new(1); p.sum(); } }\n';
    const sh = await file('sh.utu', SH), m = await file('m.utu', M);
    await note('textDocument/didOpen', { textDocument: { uri: m, version: 1, text: M } });
    await note('textDocument/didOpen', { textDocument: { uri: sh, version: 1, text: SH } });
    const across = await call('textDocument/rename', { ...at(SH, 'sum', 0, sh), newName: 'total' });
    assert.deepEqual(Object.keys(across.changes).sort(), [m, sh].sort());
    assert.deepEqual((await call('textDocument/references', { ...at(SH, 'shapes', 0, sh), context: { includeDeclaration: true } })).map(r => r.uri).filter((u, i, all) => all.indexOf(u) === i).sort(), [m, sh].sort());

    // Closing a file: the others are built again (on its text on disk), and
    // what only its builds showed on files not open is cleared.
    await note('textDocument/didChange', { textDocument: { uri: sh, version: 2 }, contentChanges: [{ text: SH.replace('fn &.sum', 'fn &.add') }] });
    assert.equal(shown(m).length, 1);
    await note('textDocument/didClose', { textDocument: { uri: sh } });
    assert.deepEqual(shown(m), [], 'the discarded text no longer counts');
    const lib = await file('util.utu', 'mod util { fn helper() I32 { nope; } }\n');
    const U = 'using util from "./util.utu";\nexport lib { fn run() I32 { util.helper(); } }\n';
    const user = await file('user.utu', U);
    await note('textDocument/didOpen', { textDocument: { uri: user, version: 1, text: U } });
    assert.equal(shown(lib)?.length, 1, 'an import not open shows its mistake');
    await note('textDocument/didClose', { textDocument: { uri: user } });
    assert.deepEqual(shown(lib), [], 'and not after its importer closes');

    // An unsaved buffer keeps its own URI.
    const T = 'fn f() I32 {\n    let total = 1;\n    totl;\n}\nexport lib { fn h() I32 { f(); } }\n';
    await note('textDocument/didOpen', { textDocument: { uri: 'untitled:Untitled-1', version: 1, text: T } });
    assert.equal(shown('untitled:Untitled-1')[0].data.fix.uri, 'untitled:Untitled-1');
    assert.equal((await call('textDocument/definition', at(T, 'f();', 0, 'untitled:Untitled-1'))).uri, 'untitled:Untitled-1');

    // Completion after a type, a field, a call, an index; `?.` on a nullable.
    const C = 'struct Inner:\n    | v: I32\nstruct Rect:\n    | w: F64\n    | inner: Inner\nfn Rect.square(s: F64) Rect { Rect { w: s, inner: Inner { v: 1 } }; }\nfn Rect.area |r| () F64 { r.w; }\nenum Shape:\n    | Circle\n    | Square\nfn mk() Rect { Rect.square(2.0); }\nexport lib {\n    fn f(r: Rect, opt: ?Rect, arr: Array[Rect]) F64 {\n        CURSOR\n        r.w;\n    }\n}\n';
    const c = await file('c.utu', C.replace('CURSOR', ''));
    await note('textDocument/didOpen', { textDocument: { uri: c, version: 1, text: C.replace('CURSOR', '') } });
    let v = 1;
    const offered = async typed => {
      const text = C.replace('CURSOR', `${typed}¦`);
      await note('textDocument/didChange', { textDocument: { uri: c, version: ++v }, contentChanges: [{ text: text.replace('¦', '') }] });
      return (await call('textDocument/completion', at(text, '¦', 0, c))).map(item => item.label);
    };
    assert.deepEqual(await offered('Rect.'), ['square']);
    assert.deepEqual(await offered('Shape.'), ['Circle', 'Square']);
    assert.deepEqual(await offered('r.inner.'), ['v']);
    for (const typed of ['mk().', 'arr[0].', 'Rect.square(1.0).', 'opt?.', 'r. ']) assert.deepEqual(await offered(typed), ['w', 'inner', 'area'], typed);
    assert.deepEqual(await offered('opt.'), [], 'not without ?.');

    // Hover: a built-in type without its representation, a module's type by the module's name.
    const H = 'using shapes |Point| from "./sh.utu";\nfn f(a: Array[I32], p: Point) I32 { a.len() + p.x; }\nexport lib { fn run() I32 { f([1], Point.new(1)); } }\n';
    const h = await file('h.utu', H);
    await note('textDocument/didOpen', { textDocument: { uri: h, version: 1, text: H } });
    assert.match((await call('textDocument/hover', at(H, 'Array', 0, h))).contents.value, /^```utu\ntype Array\n```/);
    assert.match((await call('textDocument/hover', at(H, 'new(1)', 0, h))).contents.value, /fn shapes\.new\(x: I32\) shapes/);
  }

  // `utu lsp`: the same server, framed on stdin and stdout.
  const child = spawn(process.execPath, [path.join(ROOT, 'cli', 'utu.mjs'), 'lsp'], { stdio: ['pipe', 'pipe', 'ignore'] });
  let buffer = Buffer.alloc(0);
  const answers = [];
  child.stdout.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const end = buffer.indexOf('\r\n\r\n');
      if (end < 0) return;
      const length = Number(/Content-Length: (\d+)/.exec(buffer.subarray(0, end))[1]);
      if (buffer.length < end + 4 + length) return;
      answers.push(JSON.parse(buffer.subarray(end + 4, end + 4 + length)));
      buffer = buffer.subarray(end + 4 + length);
    }
  });
  const write = message => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }));
    child.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
  };
  const exited = new Promise(resolve => child.on('exit', resolve));
  write({ id: 1, method: 'initialize', params: { capabilities: {} } });
  write({ method: 'textDocument/didOpen', params: { textDocument: { uri: main, languageId: 'utu', version: 1, text: MAIN } } });
  write({ id: 2, method: 'textDocument/definition', params: at(MAIN, 'twice(Point') });
  // What is not a message, or a notification it cannot follow, is not the end of it.
  child.stdin.write('Content-Length: 5\r\n\r\n{bad}');
  write({ method: 'textDocument/didOpen', params: {} });
  write({ id: 3, method: 'textDocument/hover', params: at(MAIN, 'total * 2') });
  // A standard library file (where a definition leads) is its std: module, with no mistakes of its own.
  const strFile = path.join(ROOT, 'std', 'Str.utu');
  const strUri = pathToFileURL(strFile).href;
  write({ method: 'textDocument/didOpen', params: { textDocument: { uri: strUri, languageId: 'utu', version: 1, text: await fs.readFile(strFile, 'utf8') } } });
  write({ id: 6, method: 'textDocument/documentSymbol', params: { textDocument: { uri: strUri } } });
  write({ id: 4, method: 'shutdown' });
  write({ id: 5, method: 'textDocument/hover', params: at(MAIN, 'total * 2') });
  write({ method: 'exit' });
  assert.equal(await exited, 0);
  assert.deepEqual(answers.find(a => a.id === 2).result, twiceDef);
  assert.equal(answers.find(a => a.id === null).error.code, -32700);
  assert.match(answers.find(a => a.id === 3).result.contents.value, /total: I32/);
  assert.equal(answers.find(a => a.id === 5).error.code, -32600, 'nothing is answered after shutdown');
  assert.ok(answers.find(a => a.id === 6).result.length > 0);
  assert.ok(!answers.some(a => a.method === 'textDocument/publishDiagnostics' && a.params.uri === strUri && a.params.diagnostics.length));

  console.log('lsp: hover, definitions, references, rename (aliases, refusals, importers), symbols, tokens, completion (members of any expression, statics, ?.; not in comments or strings), answers while a file does not parse, diagnostics as text changes, on close, and in unopened imports, unsaved buffers; `utu lsp` on stdio, std files, past bad messages');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
