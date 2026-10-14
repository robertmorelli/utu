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

/// Twice the sum
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
  assert.match(fn.contents.value, /Twice the sum\nof a point's coordinates\./);
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

  // The outline, and semantic tokens (five numbers each).
  const symbols = await ask('textDocument/documentSymbol', { textDocument: { uri: main } });
  assert.deepEqual(symbols.map(s => s.name), ['twice', 'run']);
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

  // Diagnostics as the text changes, and cleared when it is fixed.
  await tell('textDocument/didChange', { textDocument: { uri: main, version: ++version }, contentChanges: [{ text: MAIN.replace('total * 2', 'total * nope') }] });
  assert.deepEqual(diagnostics().map(d => [d.code, d.message, d.range.start.line]), [['unknown-variable', "Unknown variable 'nope'", 6]]);
  await tell('textDocument/didChange', { textDocument: { uri: main, version: ++version }, contentChanges: [{ text: MAIN.replace('== 6', '== true') }] });
  assert.equal(diagnostics().length, 1, "the tests' build is checked too");
  await tell('textDocument/didChange', { textDocument: { uri: main, version: ++version }, contentChanges: [{ text: MAIN }] });
  assert.deepEqual(diagnostics(), []);

  // An edit to an open import shows in the file that imports it.
  await tell('textDocument/didOpen', { textDocument: { uri: shapes, languageId: 'utu', version: 1, text: SHAPES } });
  await tell('textDocument/didChange', { textDocument: { uri: shapes, version: 2 }, contentChanges: [{ text: SHAPES.replace('fn &.sum', 'fn &.total') }] });
  const published = sent.filter(m => m.method === 'textDocument/publishDiagnostics' && m.params.uri === main).at(-1);
  assert.match(published.params.diagnostics[0]?.message ?? '', /sum/);

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
  write({ id: 3, method: 'shutdown' });
  write({ method: 'exit' });
  assert.equal(await exited, 0);
  assert.deepEqual(answers.find(a => a.id === 2).result, twiceDef);

  console.log('lsp: hover, definitions, references, rename, symbols, tokens, completion, and diagnostics as text changes; `utu lsp` on stdio');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
