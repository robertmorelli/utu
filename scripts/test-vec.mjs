// `vec` and `mem`, in both compilers (stage 0 and the self-hosted one).
//
// The same operations on every storage kind, declared once as mems and once
// as vecs, give the same values; a vec's capacity grows to the larger of
// what is needed and twice what it was; an access whose index or value
// calls a function that grows the vec reaches its new array; a module may
// have any number of vecs; and the 101st mem is an error (a module has at
// most 100 memories), reported alike by both compilers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KINDS = [['U8', 200], ['I8', -100], ['U16', 60000], ['I16', -30000], ['I32', -2000000000], ['U32', 4000000000], ['I64', -9000000000], ['F32', 1.5], ['F64', -2.25]];

// For each kind: initial contents, pushes past 64 KiB, writes, compound
// writes, resize (keeping old contents), and clear.
const widen = kind => kind === 'I64' || kind === 'F64' ? '' : kind === 'F32' ? '.to_f64()' : '.to_i64()';
const exercise = word => KINDS.map(([kind, value], k) => {
  const float = kind.startsWith('F');
  const lit = float ? value.toFixed(2) : String(value);
  const w = widen(kind);
  const n = x => float ? `${x}.to_f64()` : `${x}.to_i64()`;
  return `
${word} m${k}: ${kind} = [${lit}, ${lit}, ${lit}];
fn run${k}() ${float ? 'F64' : 'I64'} {
    let before = m${k}.len();
    for (0 ..< 70000) |i| { m${k}.push(m${k}[i % 3]); };
    m${k}[5] = ${lit};
    m${k}[6] += ${float ? lit : '1'};
    let total = m${k}[0]${w} + m${k}[6]${w};
    m${k}.resize(10);
    m${k}.resize(70000);
    let kept = m${k}[69999]${w};
    m${k}.clear();
    total + kept + ${n('before')} + ${n(`m${k}.len()`)};
}`;
}).join('\n');
const kinds = word => `${exercise(word)}
export lib {
${KINDS.map(([kind], k) => `    fn run${k}_() ${kind.startsWith('F') ? 'F64' : 'I64'} { run${k}(); }`).join('\n')}
}
`;

const growth = `
vec v: I32;
fn grow() I32 { for (0 ..< 100) |i| { v.push(i); }; 5; }
export lib {
    fn caps() I32 { v.clear(); v.reserve(3); let a = v.cap(); v.reserve(4); let b = v.cap(); v.reserve(20); a * 10000 + b * 100 + v.cap(); }
    fn read() I32 { v.clear(); v.push(1); v[grow()]; }
    fn write() I32 { v.clear(); v.push(1); v[0] = grow(); v[0] * 1000 + v.len(); }
    fn compound() I32 { v.clear(); v.push(1); v[0] += grow(); v[0]; }
}
`;
const many = count => `${Array.from({ length: count }, (_, i) => `vec v${i}: I32;`).join('\n')}
export lib { fn total() I32 { ${Array.from({ length: count }, (_, i) => `v${i}.push(${i});`).join(' ')} v${count - 1}[0]; } }
`;
const tooMany = `${Array.from({ length: 101 }, (_, i) => `mem m${i}: U8;`).join('\n')}
export lib { fn f() I32 { m0.len(); } }
`;

const { initParser, createCompiler, emitBinary, instantiateLowered, buildImportObject, collectAnalysisDiagnostics } = await import('../src/index.js');
const parser = await initParser({ wasmDir: `${ROOT}/` });
const utu = await loadNodeCompiler();

/** Both compilers' builds of `text`: { stage0, selfhost }, each { exports, memories } or { error }. */
async function both(file, text) {
  await fs.writeFile(file, text);
  const out = {};
  try {
    const compiler = createCompiler({ parser, target: 'normal', optimize: 'speed', readFile: f => fs.readFile(f, 'utf8'), resolvePath: (a, b) => path.resolve(path.dirname(a), b) });
    const doc = await compiler.compileFile(file);
    const errors = collectAnalysisDiagnostics(doc).filter(d => d.severity === 'error');
    if (errors.length) out.stage0 = { error: errors[0].message };
    else {
      const wasm = emitBinary(doc);
      out.stage0 = { exports: (await instantiateLowered(wasm, await buildImportObject(doc, { wasm }))).instance.exports, memories: section(wasm, 5) };
    }
  } catch (error) {
    out.stage0 = { error: error.message };
  }
  const built = await compileFile(utu, file, { optimize: 'speed' });
  out.selfhost = built.wasm
    ? { exports: (await instantiateNode(built.wasm, built.spec)).exports, memories: section(built.wasm, 5) }
    : { error: built.diagnostics[0].message };
  return out;
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-vec-'));
try {
  const run = ({ exports }) => KINDS.map((_, k) => String(exports[`run${k}_`]()));
  const mems = await both(path.join(dir, 'mems.utu'), kinds('mem'));
  const vecs = await both(path.join(dir, 'vecs.utu'), kinds('vec'));
  for (const compiler of ['stage0', 'selfhost']) {
    assert.ok(mems[compiler].exports && vecs[compiler].exports, `${compiler}: ${mems[compiler].error ?? vecs[compiler].error}`);
    assert.equal(mems[compiler].memories, KINDS.length, `${compiler}: a memory for each mem`);
    assert.equal(vecs[compiler].memories, 0, `${compiler}: no memory for a vec`);
    assert.deepEqual(run(vecs[compiler]), run(mems[compiler]), `${compiler}: vecs behave as mems`);
  }
  assert.deepEqual(run(vecs.selfhost), run(vecs.stage0));

  const grown = await both(path.join(dir, 'growth.utu'), growth);
  for (const compiler of ['stage0', 'selfhost']) {
    const { exports } = grown[compiler];
    assert.equal(exports.caps(), 30620, `${compiler}: capacity 3, then 6 (twice), then 20 (what is needed)`);
    assert.equal(exports.read(), 4, `${compiler}: an index that grows the vec reads its new array`);
    assert.equal(exports.write(), 5101, `${compiler}: a value that grows the vec is stored in its new array`);
    assert.equal(exports.compound(), 6, `${compiler}: v[0] += grow() reads v[0] first`);
  }

  const lots = await both(path.join(dir, 'many.utu'), many(150));
  for (const compiler of ['stage0', 'selfhost']) assert.equal(lots[compiler].exports?.total(), 149, `${compiler}: 150 vecs`);

  const over = await both(path.join(dir, 'over.utu'), tooMany);
  assert.equal(over.stage0.error, 'mem m100 is one mem too many: a module has at most 100 memories; declare the others as vec');
  assert.equal(over.selfhost.error, 'Too many mems (max 100): make m100 a vec');
  console.log(`vec: ${KINDS.length} storage kinds behave as mems in both compilers; growth, 150 vecs, and the 101st mem reported by both`);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}

/** How many entries a section of the module declares (null when it has none). */
function section(wasm, id) {
  const bytes = new Uint8Array(wasm);
  let at = 8;
  const leb = () => { let v = 0, shift = 0, b; do { b = bytes[at++]; v |= (b & 127) << shift; shift += 7; } while (b & 128); return v >>> 0; };
  while (at < bytes.length) {
    const kind = bytes[at++];
    const size = leb();
    const end = at + size;
    if (kind === id) return leb();
    at = end;
  }
  return id === 5 ? 0 : null;
}
