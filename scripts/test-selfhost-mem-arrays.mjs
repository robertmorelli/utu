// Mems as WasmGC arrays behave as mems as memories.
//
// A module has at most 100 memories (JavaScriptCore's limit), so the mems
// used least in a program with more are arrays. The same operations, on
// every storage kind, run once with the mems as memories and once with 120
// mems named more often ahead of them (so they are arrays); the results must
// be the same, and so must the number of memories.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';

const KINDS = [['U8', 200], ['I8', -100], ['U16', 60000], ['I16', -30000], ['I32', -2000000000], ['U32', 4000000000], ['I64', -9000000000], ['F32', 1.5], ['F64', -2.25]];

// For each kind: initial contents, push past a page, writes, compound
// writes, resize (keeping old contents), clear, cap, and a read past the
// length within the capacity.
// How an element of each kind reads as the I64 (or F64) the test sums.
const widen = kind => kind === 'I64' || kind === 'F64' ? '' : kind === 'F32' ? '.to_f64()' : '.to_i64()';
const exercise = KINDS.map(([kind, value], k) => {
  const float = kind.startsWith('F');
  const lit = float ? value.toFixed(2) : String(value);
  const w = widen(kind);
  const n = x => float ? `${x}.to_f64()` : `${x}.to_i64()`;
  return `
mem m${k}: ${kind} = [${lit}, ${lit}, ${lit}];
fn run${k}() ${float ? 'F64' : 'I64'} {
    let before = m${k}.len();
    for (0 ..< 70000) |i| { m${k}.push(m${k}[i % 3]); };
    m${k}[5] = ${lit};
    m${k}[6] += ${float ? lit : '1'};
    let total = m${k}[0]${w} + m${k}[6]${w};
    let cap = m${k}.cap();
    m${k}.resize(10);
    m${k}.resize(70000);
    let kept = m${k}[69999]${w};
    m${k}.clear();
    let past = m${k}[3]${w};
    total + kept + past + ${n('before')} + ${n('cap')} + ${n(`m${k}.len()`)};
}`;
}).join('\n');
const calls = KINDS.map((_, k) => `    fn run${k}_() ${KINDS[k][0].startsWith('F') ? 'F64' : 'I64'} { run${k}(); }`).join('\n');
const program = filler => `${filler}
${exercise}
export lib {
${calls}
}
`;
// Mems named more often than the ones exercised, so they rank ahead of them.
const filler = Array.from({ length: 120 }, (_, i) => `mem f${i}: I32;
fn use${i}() I32 {
    ${Array.from({ length: 20 }, () => `f${i}.push(${i});`).join(' ')}
    f${i}.len();
}`).join('\n') + `\nexport lib { fn __fill() I32 { ${Array.from({ length: 120 }, (_, i) => `use${i}()`).join(' + ')}; } }`;

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-mem-arrays-'));
try {
  const utu = await loadNodeCompiler();
  const results = [];
  for (const [name, text] of [['memories', program('')], ['arrays', program(filler)]]) {
    const file = path.join(dir, `${name}.utu`);
    await fs.writeFile(file, text);
    const built = await compileFile(utu, file, { optimize: 'speed' });
    assert.ok(built.wasm, `${name}: ${built.diagnostics.map(d => d.message).join('; ')}`);
    const { exports } = await instantiateNode(built.wasm, built.spec);
    results.push({ name, memories: section(built.wasm, 5), start: section(built.wasm, 8), values: KINDS.map((_, k) => String(exports[`run${k}_`]())) });
  }
  const [memories, arrays] = results;
  assert.equal(memories.memories, KINDS.length);
  assert.equal(arrays.memories, 100);
  // The mems exercised are arrays: their contents come from the start function.
  assert.equal(memories.start, null);
  assert.notEqual(arrays.start, null);
  assert.deepEqual(arrays.values, memories.values);
  console.log(`mems as arrays: ${KINDS.length} storage kinds behave as memories (${arrays.memories} memories with 129 mems)`);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}

/** The first number in section `id` (a count, or the start function), or null without one. */
function section(wasm, id) {
  let at = 8;
  const leb = () => { let v = 0, shift = 0, b; do { b = wasm[at++]; v |= (b & 127) << shift; shift += 7; } while (b & 128); return v >>> 0; };
  while (at < wasm.length) {
    const kind = wasm[at++];
    const size = leb();
    if (kind === id) return leb();
    at += size;
  }
  return null;
}
