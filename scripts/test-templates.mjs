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
  assert.deepEqual(errors.selfhost.errors, errors.stage0.errors);
  console.log(`templates: ${Object.keys(expected).length} templates build alike in both compilers, and a value without to_str is reported alike`);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
