import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import binaryen from 'binaryen';
import { createCompiler, emitBinary, initParser, instantiateLowered } from '../src/index.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BENCH = path.join(ROOT, 'benchmarks', 'tiny');
const TMP = path.join(ROOT, '.tmp', 'tiny-wasm-benchmark');
const UtuSource = path.join(BENCH, 'benchmark.utu');
const RustSource = path.join(BENCH, 'rust.rs');
const RustSafeSource = path.join(BENCH, 'rust-safe.rs');
const RustWasm = path.join(TMP, 'rust.wasm');
const RustSafeWasm = path.join(TMP, 'rust-safe.wasm');
const UtuWasm = path.join(TMP, 'utu.wasm');
const iterations = Number(process.env.BENCH_ITERATIONS ?? 1_000_000);
const samples = Number(process.env.BENCH_SAMPLES ?? 15);
const warmups = Number(process.env.BENCH_WARMUPS ?? 5);

await fs.mkdir(TMP, { recursive: true });
compileRust(RustSource, RustWasm);
compileRust(RustSafeSource, RustSafeWasm, true);
const utuBytes = await compileUtu();
const rustBytes = new Uint8Array(await fs.readFile(RustWasm));
const rustSafeBytes = addSafeRustExport(new Uint8Array(await fs.readFile(RustSafeWasm)));
await fs.writeFile(RustSafeWasm, rustSafeBytes);
await fs.writeFile(UtuWasm, utuBytes);

const [{ instance: utu }, rust, rustSafe] = await Promise.all([
  instantiateLowered(utuBytes),
  WebAssembly.instantiate(rustBytes),
  WebAssembly.instantiate(rustSafeBytes),
]);
const expected = rust.instance.exports.run(iterations);
const actual = utu.exports.run(iterations);
const safeActual = rustSafe.instance.exports.run(iterations);
if (actual !== expected || safeActual !== expected) throw new Error(`result mismatch: utu=${actual}, rust=${expected}, safe Rust=${safeActual}`);

for (let i = 0; i < warmups; i++) {
  utu.exports.run(iterations);
  rust.instance.exports.run(iterations);
  rustSafe.instance.exports.run(iterations);
}
const utuTimes = [];
const rustTimes = [];
const rustSafeTimes = [];
for (let i = 0; i < samples; i++) {
  // Alternate first position to reduce systematic scheduling/temperature bias.
  const timed = [
    () => utuTimes.push(time(() => utu.exports.run(iterations))),
    () => rustTimes.push(time(() => rust.instance.exports.run(iterations))),
    () => rustSafeTimes.push(time(() => rustSafe.instance.exports.run(iterations))),
  ];
  for (let offset = 0; offset < timed.length; offset++) timed[(i + offset) % timed.length]();
}

const bundlePath = path.join(ROOT, 'dist', 'utu.js');
const bundle = await fs.readFile(bundlePath).catch(() => null);
const utuMedian = median(utuTimes);
const rustMedian = median(rustTimes);
const rustSafeMedian = median(rustSafeTimes);
console.log('Tiny scalar-loop Wasm benchmark');
console.log(`  engine:      Bun ${Bun.version} (${process.arch})`);
console.log(`  workload:    ${iterations.toLocaleString()} iterations × ${samples} samples`);
console.log(`  result:      ${actual} (matched)`);
console.log(`  utu:         ${formatMs(utuMedian)} median, ${formatMs(Math.min(...utuTimes))} best`);
console.log(`  Rust:        ${formatMs(rustMedian)} median, ${formatMs(Math.min(...rustTimes))} best`);
console.log(`  safe Rust:   ${formatMs(rustSafeMedian)} median, ${formatMs(Math.min(...rustSafeTimes))} best`);
console.log(`  ratio:       ${(utuMedian / rustMedian).toFixed(2)}× Rust time`);
console.log('Generated Wasm');
console.log(`  utu:         ${formatBytes(utuBytes.byteLength)} (${formatBytes(gzipSync(utuBytes).byteLength)} gzip)`);
console.log(`  Rust:        ${formatBytes(rustBytes.byteLength)} (${formatBytes(gzipSync(rustBytes).byteLength)} gzip)`);
console.log(`  safe Rust:   ${formatBytes(rustSafeBytes.byteLength)} (${formatBytes(gzipSync(rustSafeBytes).byteLength)} gzip)`);
console.log(`  size ratio:  ${(utuBytes.byteLength / rustBytes.byteLength).toFixed(2)}× Rust bytes`);
if (bundle) {
  console.log('Compiler bundle');
  console.log(`  dist/utu.js: ${formatBytes(bundle.byteLength)} (${formatBytes(gzipSync(bundle).byteLength)} gzip)`);
}
console.log(`  artifacts:   ${path.relative(ROOT, TMP)}/`);

function compileRust(source, output, safe = false) {
  const args = [
    source, '--target', 'wasm32-unknown-unknown', '--crate-type', 'cdylib',
    '-C', 'opt-level=3', '-C', 'lto=fat', '-C', 'codegen-units=1',
    '-C', 'panic=abort', ...(safe ? [] : ['-C', 'strip=symbols']), '-o', output,
  ];
  const result = spawnSync('rustup', ['run', 'stable', 'rustc', ...args], { cwd: ROOT, encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') throw new Error('rustup with the wasm32-unknown-unknown target is required for bench:tiny');
  if (result.status !== 0) throw new Error(`rustc failed:\n${result.stderr || result.stdout}`);
}

function addSafeRustExport(bytes) {
  const module = binaryen.readBinary(bytes);
  const names = Array.from({ length: module.getNumFunctions() }, (_, index) =>
    binaryen.getFunctionInfo(module.getFunctionByIndex(index)).name);
  const run = names.find(name => name.includes('run17h'));
  if (!run) throw new Error('rust-safe.rs: retained run function not found');
  module.addFunctionExport(run, 'run');
  module.runPasses(['strip']);
  const emitted = module.emitBinary();
  module.dispose();
  return emitted;
}

async function compileUtu() {
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const compiler = createCompiler({
    parser,
    target: 'normal',
    readFile: file => fs.readFile(file, 'utf8'),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
  });
  const doc = await compiler.compileFile(UtuSource);
  const errors = [...doc.querySelectorAll('[data-error]')];
  if (errors.length) throw new Error(`utu compile reported: ${errors.map(node => node.dataset.errorMessage).join('; ')}`);
  return emitBinary(doc);
}

function time(run) {
  const start = Bun.nanoseconds();
  run();
  return Number(Bun.nanoseconds() - start) / 1e6;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatMs(value) {
  return `${value.toFixed(3)} ms`;
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(2)} KiB`;
  return `${(value / 1024 ** 2).toFixed(2)} MiB`;
}
