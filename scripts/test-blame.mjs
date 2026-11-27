// Size blame (src/selfhost/blame.js): asking for it changes nothing built,
// and every byte is blamed once, on a place or in a named bucket.
//
//   node scripts/test-blame.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, loadNodeCompiler } from '../src/selfhost/node.js';
import { MODES } from '../src/selfhost/compiler.js';
import { blameGlue, blameModule, checkTiling, formatTop, report } from '../src/selfhost/blame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const utu = await loadNodeCompiler();
let checked = 0;
for (const name of ['closures.utu', 'protocols.utu', 'stdlib.utu', 'promises.utu']) {
  for (const mode of ['small', 'fast', 'debug']) {
    const file = path.join(ROOT, 'examples', name);
    const plain = await compileFile(utu, file, MODES[mode]);
    const built = await compileFile(utu, file, { ...MODES[mode], blame: true });
    assert.ok(Buffer.from(plain.wasm).equals(Buffer.from(built.wasm)), `${name} -O ${mode}: blame changed the module`);
    const blamed = blameModule(built.wasm, built.blame);
    checkTiling(blamed.records, built.wasm.length);
    const rep = report({ wasm: built.wasm, tables: built.blame, blamed, glue: blameGlue(built.spec, blamed.esPlaces) });
    const sum = rep.sections.reduce((n, s) => n + s.bytes, 0);
    assert.equal(sum, built.wasm.length, `${name} -O ${mode}: sections sum to the size`);
    assert.equal(rep.blamed + rep.unattributed.reduce((n, u) => n + u.bytes, 0), built.wasm.length, `${name} -O ${mode}: blamed + buckets = size`);
    assert.ok(rep.blamed / built.wasm.length > 0.7, `${name} -O ${mode}: most bytes have a place`);
    assert.match(formatTop(rep), /declarations/);
    assert.deepEqual(rep.notes, [], `${name} -O ${mode}: every instruction read`);
    checked++;
  }
}
// Declarations by name, past `tag`.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utu-blame-'));
const named = path.join(dir, 'named.utu');
fs.writeFileSync(named, `tag enum Tok:
    | Num { value: I32 }
    | End {}

tag struct Pair:
    | x: I32
    | y: I32

fn toks() Array[Tok] { return [Num { value: 3 }, End {}]; }

lib { fn run() I32 {
    let p = Pair { x: 1, y: 2 };
    return toks().len() + p.x + p.y;
} }
`);
// A block typed (ref null T), T past the opcodes with immediates: read whole.
const typed = path.join(dir, 'typed.utu');
fs.writeFileSync(typed, `${Array.from({ length: 40 }, (_, k) => `struct S${k}:\n    | v: I32\n`).join('\n')}
lib { fn run(n: I32) I32 {
${Array.from({ length: 40 }, (_, k) => `    let p${k}: ?S${k} = if n > ${k} { S${k} { v: n } } else { null }\n    let _ = p${k}`).join('\n')}
    return n
} }
`);
const t = await compileFile(utu, typed, { ...MODES.debug, blame: true });
assert.deepEqual(report({ wasm: t.wasm, tables: t.blame, blamed: blameModule(t.wasm, t.blame), glue: [] }).notes, [], 'blocks typed (ref null T) read whole');
const labels = new Set((await compileFile(utu, named, { ...MODES.small, blame: true })).blame.decls.map(d => d.name));
fs.rmSync(dir, { recursive: true, force: true });
for (const name of ['Tok', 'Pair', 'toks', 'run']) assert.ok(labels.has(name), `a declaration named ${name}: ${[...labels]}`);
assert.ok(!labels.has('tag'), `none named for its modifier: ${[...labels]}`);
console.log(`blame: ${checked} builds, every byte blamed once, modules unchanged, declarations by name`);
