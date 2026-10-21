// Template strings in both compilers: what each part of examples/templates.utu
// builds to, edge cases of their text (`$`, escapes, nesting, braces inside
// `${…}`, lines), and the diagnostics of a value without to_str.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { initParser, createCompiler, emitBinary, instantiateLowered, buildImportObject, collectAnalysisDiagnostics } = await import('../src/index.js');
const parser = await initParser({ wasmDir: `${ROOT}/` });
const utu = await loadNodeCompiler();

/** Both compilers' builds of `file`: { stage0, selfhost }, each its exports or its errors. */
async function both(file) {
  const out = {};
  const compiler = createCompiler({ parser, target: 'normal', optimize: 'size', readFile: f => fs.readFile(f, 'utf8'), resolvePath: (a, b) => path.resolve(path.dirname(a), b) });
  const doc = await compiler.compileFile(file);
  const errors = collectAnalysisDiagnostics(doc).filter(d => d.severity === 'error');
  if (errors.length) out.stage0 = { errors: errors.map(e => e.message).sort() };
  else {
    const wasm = emitBinary(doc);
    out.stage0 = { exports: (await instantiateLowered(wasm, await buildImportObject(doc, { wasm }))).instance.exports };
  }
  const built = await compileFile(utu, file, { optimize: 'size' });
  out.selfhost = built.wasm
    ? { exports: (await instantiateNode(built.wasm, built.spec)).exports }
    : { errors: built.diagnostics.map(d => d.message).sort() };
  return out;
}

const expected = {
  greeting: 'Ada is 36 years old and 1.65 m tall',
  point: 'p = (3, -4)',
  nested: '[inner 3]',
  blocks: 'yes and 42',
  escapes: 'a ` backtick, a ${ that is text, $5, $x, tab\tend',
  multiline: 'first line\nsecond line true',
  plain: 'no substitutions',
  empty: '',
};
const example = await both(path.join(ROOT, 'examples', 'templates.utu'));
for (const compiler of ['stage0', 'selfhost']) {
  assert.ok(example[compiler].exports, `${compiler}: ${example[compiler].errors}`);
  for (const [name, value] of Object.entries(expected)) assert.equal(example[compiler].exports[name](), value, `${compiler}: ${name}`);
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-templates-'));
try {
  const write = async (name, text) => { const file = path.join(dir, name); await fs.writeFile(file, text); return file; };
  const errors = await both(await write('errors.utu', `struct P:
    | x : I32
fn f(p: P, q: ?Str) Str { \`p=\${p} q=\${q}\`; }
export lib { fn run() Str { f(P { x: 1 }, null); } }
`));
  assert.deepEqual(errors.stage0.errors, ["Cannot access field 'to_str' on nullable ?Str", "Unknown method 'P.to_str'"]);
  assert.deepEqual(errors.selfhost.errors, ['?Str may be null', 'No method P.to_str']);

  // A comment inside `${…}`, and every escape's text.
  const text = await both(await write('text.utu', `export lib {
    fn commented() Str { \`\${ // the value
        1 }\`; }
    fn escapes() Str { \`\\$\\u0041\\"\`; }
    fn quoted() Str { "\\'\\u0042\\/"; }
}
`));
  for (const compiler of ['stage0', 'selfhost']) {
    assert.ok(text[compiler].exports, `${compiler}: ${text[compiler].errors}`);
    assert.equal(text[compiler].exports.commented(), '1', compiler);
    assert.equal(text[compiler].exports.escapes(), '$A"', compiler);
    assert.equal(text[compiler].exports.quoted(), "'B/", compiler);
  }

  // A \u without its four digits, in a template or a string, is a mistake.
  const escapes = await both(await write('escapes.utu', `export lib {
    fn a() Str { \`\\u{41}\`; }
    fn b() Str { "\\u41"; }
}
`));
  assert.deepEqual(escapes.stage0.errors, Array(2).fill('Invalid escape: \\u takes four hexadecimal digits'));
  assert.deepEqual(escapes.selfhost.errors, Array(2).fill('\\u needs four hex digits'));

  // A type's to_str is called as \`x.to_str()\` would be: no arguments, a Str.
  // Each row: the signature, then stage 0's message and the self-hosted compiler's.
  for (const [signature, stage0, selfhost] of [
    ['(extra: I32) Str', 'Wrong arity: expected 1, got 0', 'Takes 1, given 0'],
    ['() I32', 'Type mismatch: expected Str, got I32', 'Expected Str, got I32'],
    ['() ?Str', 'Type mismatch: expected Str, got ?Str', 'Expected Str, got ?Str'],
  ]) {
    const wrong = await both(await write('to_str.utu', `struct P:
    | x : I32
fn P.to_str |self| ${signature} { fatal; }
export lib { fn run() Str { \`\${P { x: 1 }}\`; } }
`));
    assert.deepEqual(wrong.stage0.errors, [stage0], signature);
    assert.deepEqual(wrong.selfhost.errors, [selfhost], signature);
  }

  // An unclosed template or string says so.
  const unclosed = await compileFile(utu, await write('unclosed.utu', 'export lib { fn f() Str { `abc; } }\n'));
  assert.equal(unclosed.diagnostics[0].message, 'Unclosed template string');
  console.log(`templates: ${Object.keys(expected).length} templates build alike in both compilers; comments and escapes inside them; bad \\u escapes, to_str signatures, and values without to_str reported by both`);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
