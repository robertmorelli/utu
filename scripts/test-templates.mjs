// Template strings in the self-hosted compiler: what each part of examples/templates.utu
// builds to, edge cases of their text (`$`, escapes, nesting, braces inside
// `${…}`, lines), and the diagnostics of a value without to_str.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const utu = await loadNodeCompiler();

/** Build `file`: exports or errors. */
async function build(file) {
  const built = await compileFile(utu, file, { optimize: 'size' });
  return built.wasm
    ? { exports: (await instantiateNode(built.wasm, built.spec)).exports }
    : { errors: built.diagnostics.map(d => d.message).sort() };
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
const example = await build(path.join(ROOT, 'examples', 'templates.utu'));
assert.ok(example.exports, String(example.errors));
for (const [name, value] of Object.entries(expected)) assert.equal(example.exports[name](), value, name);

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-templates-'));
try {
  const write = async (name, text) => { const file = path.join(dir, name); await fs.writeFile(file, text); return file; };
  const errors = await build(await write('errors.utu', `struct P:
    | x : I32
fn f(p: P, q: ?Str) Str { \`p=\${p} q=\${q}\`; }
export lib { fn run() Str { f(P { x: 1 }, null); } }
`));
  assert.deepEqual(errors.errors, ['?Str may be null', 'No method P.to_str']);

  // A comment inside `${…}`, and every escape's text.
  const text = await build(await write('text.utu', `export lib {
    fn commented() Str { \`\${ // the value
        1 }\`; }
    fn escapes() Str { \`\\$\\u0041\\"\`; }
    fn quoted() Str { "\\'\\u0042\\/"; }
}
`));
  assert.ok(text.exports, String(text.errors));
  assert.equal(text.exports.commented(), '1');
  assert.equal(text.exports.escapes(), '$A"');
  assert.equal(text.exports.quoted(), "'B/");

  // A \u without its four digits, in a template or a string, is a mistake.
  const escapes = await build(await write('escapes.utu', `export lib {
    fn a() Str { \`\\u{41}\`; }
    fn b() Str { "\\u41"; }
}
`));
  assert.deepEqual(escapes.errors, Array(2).fill('\\u needs four hex digits'));

  // A type's to_str is called as \`x.to_str()\` would be: no arguments, a Str.
  // Each row: the signature and its diagnostic.
  for (const [signature, message] of [
    ['(extra: I32) Str', 'Takes 1, given 0'],
    ['() I32', 'Expected Str, got I32'],
    ['() ?Str', 'Expected Str, got ?Str'],
  ]) {
    const wrong = await build(await write('to_str.utu', `struct P:
    | x : I32
fn P.to_str |self| ${signature} { fatal; }
export lib { fn run() Str { \`\${P { x: 1 }}\`; } }
`));
    assert.deepEqual(wrong.errors, [message], signature);
  }

  // An unclosed template or string says so.
  const unclosed = await compileFile(utu, await write('unclosed.utu', 'export lib { fn f() Str { `abc; } }\n'));
  assert.equal(unclosed.diagnostics[0].message, 'Unclosed template string');
  console.log(`templates: ${Object.keys(expected).length} templates build; comments and escapes inside them; bad \\u escapes, to_str signatures, and values without to_str reported`);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
