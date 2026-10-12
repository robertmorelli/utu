// Loop and iterator kernels: utu (-Oz and -O3) against Rust (opt-level=3, LTO).
// Rust is the yardstick, not the target: its slices live in linear memory with
// bounds checks removed by LLVM, while every WasmGC array.get is checked by the
// engine. Large ratios point at codegen worth fixing.
//
//   node scripts/benchmark-loops.mjs        # V8
//   bun  scripts/benchmark-loops.mjs        # JSC
//   ONLY=sort,zip_dot N=200000 node ...      # a subset / size
//   SKIP_AS=1 SKIP_DART=1 node ...            # without the other languages
//
// AssemblyScript (loops.ts, via npx) and Dart (loops.dart, `dart compile
// wasm`, WasmGC like utu) run alongside when their toolchains are available.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildImportObject, createCompiler, emitBinary, initParser, instantiateLowered } from '../src/index.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BENCH = path.join(ROOT, 'benchmarks', 'loops');
const TMP = path.join(ROOT, '.tmp', 'loop-benchmark');
const N = Number(process.env.N ?? 1_000_000);
const ROUNDS = Number(process.env.ROUNDS ?? 11);
const ONLY = process.env.ONLY?.split(',');
await fs.mkdir(TMP, { recursive: true });

const engine = typeof Bun !== 'undefined' ? `JSC (Bun ${Bun.version})` : `V8 (Node ${process.versions.node})`;

function compileRust() {
  const output = path.join(TMP, 'loops.wasm');
  const result = spawnSync('rustup', ['run', 'stable', 'rustc', path.join(BENCH, 'loops.rs'), '--target', 'wasm32-unknown-unknown', '--crate-type', 'cdylib',
    '-C', 'opt-level=3', '-C', 'lto=fat', '-C', 'codegen-units=1', '-C', 'panic=abort', '-C', 'strip=symbols', '-o', output], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`rustc failed:\n${result.stderr}`);
  return fs.readFile(output);
}

async function compileUtu(optimize) {
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const compiler = createCompiler({
    parser, target: 'normal', optimize,
    readFile: file => fs.readFile(file, 'utf8'),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
  });
  const doc = await compiler.compileFile(path.join(BENCH, 'loops.utu'));
  const errors = [...doc.querySelectorAll('[data-error]')].map(node => node.dataset.errorMessage ?? node.dataset.error);
  if (errors.length) throw new Error(errors.join('\n'));
  const wasm = emitBinary(doc);
  const { instance } = await instantiateLowered(wasm, await buildImportObject(doc));
  return { exports: instance.exports, wasm };
}

const ns = ms => (ms * 1e6 / N).toFixed(2).padStart(7);

function time(run) {
  for (let i = 0; i < 3; i++) run();
  const samples = [];
  for (let r = 0; r < ROUNDS; r++) { const t = performance.now(); run(); samples.push(performance.now() - t); }
  samples.sort((a, b) => a - b);
  return samples[samples.length >> 1];
}

/**
 * Other WasmGC / wasm languages, when their toolchains are available:
 * AssemblyScript (linear memory, via npx) and Dart (dart compile wasm, WasmGC).
 * Each returns { label, kernels, wasm } or null when the toolchain is missing.
 */
async function compileAssemblyScript() {
  if (process.env.SKIP_AS) return null;
  const output = path.join(TMP, 'loops_as.wasm');
  const result = spawnSync('npx', ['--yes', '--package=assemblyscript@0.28.20', 'asc', path.join(BENCH, 'loops.ts'),
    '-O3', '--noAssert', '-o', output], { encoding: 'utf8' });
  if (result.status !== 0) { console.log(`  (AssemblyScript skipped: ${(result.stderr || result.error?.message || '').split('\n')[0]})`); return null; }
  const wasm = await fs.readFile(output);
  const { instance } = await WebAssembly.instantiate(wasm, { env: { abort() { throw new Error('AssemblyScript abort'); }, seed: () => 1 } });
  return { label: 'AssemblyScript', kernels: instance.exports, wasm };
}

async function compileDart() {
  if (process.env.SKIP_DART) return null;
  const output = path.join(TMP, 'loops_dart.wasm');
  const result = spawnSync('dart', ['compile', 'wasm', '-O2', path.join(BENCH, 'loops.dart'), '-o', output], { encoding: 'utf8' });
  if (result.status !== 0) { console.log(`  (Dart skipped: ${(result.stderr || result.error?.message || '').split('\n')[0]})`); return null; }
  const wasm = await fs.readFile(output);
  const loader = await import(pathToFileURL(output.replace(/\.wasm$/, '.mjs')).href);
  const app = await loader.compile(wasm);
  const instance = await app.instantiate({});
  instance.invokeMain();
  return { label: 'Dart', kernels: globalThis.loopKernels, wasm, extra: (await fs.readFile(output.replace(/\.wasm$/, '.mjs'))).length };
}

const rustWasm = await compileRust();
const rust = (await WebAssembly.instantiate(rustWasm)).instance.exports;
rust.setup(N);
const builds = { '-Oz': await compileUtu('size'), '-O3': await compileUtu('speed') };
const inputs = Object.fromEntries(Object.entries(builds).map(([label, { exports }]) =>
  [label, { ints: exports.ints(N), floats: exports.floats(N), sorted: exports.sorted(N) }]));

const others = (await Promise.all([compileAssemblyScript(), compileDart()])).filter(Boolean);
for (const other of others) other.kernels.setup(N);

const kernels = Object.keys(rust).filter(name => typeof rust[name] === 'function' && name !== 'setup' && !name.startsWith('__'))
  .filter(name => !ONLY || ONLY.includes(name));
const inputOf = name => (name === 'dot_f64' ? 'floats' : name === 'bisect_many' ? 'sorted' : 'ints');

console.log(`${engine}: ${N.toLocaleString()} elements, median of ${ROUNDS}`);
console.log(`  ns/element; ratio = time / Rust`);
console.log(`  ${'kernel'.padEnd(20)} ${'Rust'.padStart(7)} ${'utu -Oz'.padStart(8)} ${'utu -O3'.padStart(8)}${others.map(o => o.label.padStart(16)).join('')}`);
const ratios = [];
const otherRatios = others.map(() => []);
for (const name of kernels) {
  const expected = rust[name]();
  const rustMs = time(() => rust[name]());
  const times = {};
  for (const [label, { exports }] of Object.entries(builds)) {
    const input = inputs[label][inputOf(name)];
    const got = exports[name](input);
    if (Math.abs(got - expected) > 1e-6 * Math.abs(expected)) throw new Error(`${name} ${label}: ${got}, Rust ${expected}`);
    times[label] = time(() => exports[name](input));
  }
  const otherCells = others.map((other, index) => {
    const got = other.kernels[name]();
    if (Math.abs(got - expected) > 1e-6 * Math.abs(expected)) throw new Error(`${name} ${other.label}: ${got}, Rust ${expected}`);
    const ms = time(() => other.kernels[name]());
    otherRatios[index].push(ms / rustMs);
    return `${ns(ms)} (${(ms / rustMs).toFixed(1)}×)`.padStart(16);
  });
  const ratio = times['-Oz'] / rustMs;
  ratios.push(ratio);
  console.log(`  ${name.padEnd(20)} ${ns(rustMs)} ${ns(times['-Oz'])} ${ns(times['-O3'])}${otherCells.join('')}`);
}
const geomean = list => Math.exp(list.reduce((a, r) => a + Math.log(r), 0) / list.length);
console.log(`  geometric mean vs Rust: utu -Oz ${geomean(ratios).toFixed(2)}×${others.map((o, i) => ` · ${o.label} ${geomean(otherRatios[i]).toFixed(2)}×`).join('')}`);
const size = (label, bytes, extra = 0) => `${label} ${bytes.length} B (${gzipSync(bytes).length} gz)${extra ? ` + ${extra} B JS loader` : ''}`;
console.log(`  wasm: ${[size('Rust', rustWasm), size('utu -Oz', builds['-Oz'].wasm), size('utu -O3', builds['-O3'].wasm),
  ...others.map(o => size(o.label, o.wasm, o.extra))].join(' · ')}`);
