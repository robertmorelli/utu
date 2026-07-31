import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform } from 'esbuild';
import { createCompiler, emitBinary, initParser, instantiateLowered } from '../src/index.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BENCH = path.join(ROOT, 'benchmarks', 'deltablue');
const TMP = path.join(ROOT, '.tmp', 'deltablue-benchmark');
const SAMPLES = Number(process.env.BENCH_SAMPLES ?? 10);
const WARMUPS = Number(process.env.BENCH_WARMUPS ?? 3);
const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 20);
await fs.mkdir(TMP, { recursive: true });

const utuBytes = await compileUtu();
const rustBytes = compileRust('rust', 'rust_deltablue');
const rustUnsafeBytes = compileRust('rust-unsafe', 'rust_deltablue_arena');
const { module: js, bytes: jsBytes } = await loadJavaScript();
await Promise.all([
  fs.writeFile(path.join(TMP, 'deltablue-utu.wasm'), utuBytes),
  fs.writeFile(path.join(TMP, 'deltablue-rust.wasm'), rustBytes),
  fs.writeFile(path.join(TMP, 'deltablue-rust-unsafe.wasm'), rustUnsafeBytes),
]);
const [{ instance: utu }, rust, rustUnsafe] = await Promise.all([
  instantiateLowered(utuBytes),
  WebAssembly.instantiate(rustBytes),
  WebAssembly.instantiate(rustUnsafeBytes),
]);

console.log(`DeltaBlue: ${SAMPLES} samples, ${WARMUPS} warmups, ${ITERATIONS} iteration(s) per sample`);
console.log(`Payload: utu ${formatBytes(utuBytes.length)} (${formatBytes(gzipSync(utuBytes).length)} gzip), safe Rust ${formatBytes(rustBytes.length)} (${formatBytes(gzipSync(rustBytes).length)} gzip), unsafe Rust ${formatBytes(rustUnsafeBytes.length)} (${formatBytes(gzipSync(rustUnsafeBytes).length)} gzip), JS ${formatBytes(jsBytes.length)} (${formatBytes(gzipSync(jsBytes).length)} gzip)`);
for (const spec of [
  { name: 'chain', kind: 0, rustExport: 'bench_chain', jsExport: 'benchChain' },
  { name: 'projection', kind: 1, rustExport: 'bench_projection', jsExport: 'benchProjection' },
]) {
  const utuRun = () => utu.exports.main(spec.kind, ITERATIONS);
  const rustRun = () => rust.instance.exports[spec.rustExport](ITERATIONS);
  const rustUnsafeRun = () => rustUnsafe.instance.exports[spec.rustExport](ITERATIONS);
  const jsRun = () => js[spec.jsExport](ITERATIONS);
  const expected = rustRun();
  const actual = utuRun();
  const unsafeActual = rustUnsafeRun();
  const jsActual = BigInt(jsRun());
  if (actual !== expected || unsafeActual !== expected || jsActual !== expected) throw new Error(`${spec.name}: result mismatch, utu=${actual}, safe Rust=${expected}, unsafe Rust=${unsafeActual}, JS=${jsActual}`);
  for (let i = 0; i < WARMUPS; i++) { utuRun(); rustRun(); rustUnsafeRun(); jsRun(); }
  const utuTimes = [], rustTimes = [], rustUnsafeTimes = [], jsTimes = [];
  const timed = [
    [utuTimes, utuRun], [rustTimes, rustRun], [rustUnsafeTimes, rustUnsafeRun], [jsTimes, jsRun],
  ];
  for (let i = 0; i < SAMPLES; i++) {
    for (let offset = 0; offset < timed.length; offset++) {
      const [times, run] = timed[(i + offset) % timed.length];
      times.push(time(run));
    }
  }
  const utuMedian = median(utuTimes), rustMedian = median(rustTimes), rustUnsafeMedian = median(rustUnsafeTimes), jsMedian = median(jsTimes);
  console.log(`${spec.name}: result ${actual}`);
  console.log(`  utu:         ${formatMs(utuMedian)} median (${formatMs(Math.min(...utuTimes))} best)`);
  console.log(`  safe Rust:   ${formatMs(rustMedian)} median (${formatMs(Math.min(...rustTimes))} best)`);
  console.log(`  unsafe Rust: ${formatMs(rustUnsafeMedian)} median (${formatMs(Math.min(...rustUnsafeTimes))} best)`);
  console.log(`  JavaScript:  ${formatMs(jsMedian)} median (${formatMs(Math.min(...jsTimes))} best)`);
  console.log(`  utu ratios: ${(utuMedian / rustMedian).toFixed(2)}× safe Rust time, ${(utuMedian / rustUnsafeMedian).toFixed(2)}× unsafe Rust time, ${(utuMedian / jsMedian).toFixed(2)}× JS time`);
}
console.log(`artifacts: ${path.relative(ROOT, TMP)}/`);

async function compileUtu() {
  const file = path.join(BENCH, 'deltablue.utu');
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const compiler = createCompiler({
    parser, target: 'normal', readFile: name => fs.readFile(name, 'utf8'),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
  });
  const doc = await compiler.compileFile(file);
  const errors = [...doc.querySelectorAll('[data-error]')];
  if (errors.length) throw new Error(`deltablue.utu: ${errors.map(node => node.dataset.errorMessage).join('; ')}`);
  return emitBinary(doc);
}

async function loadJavaScript() {
  const file = path.join(BENCH, 'deltablue.js');
  const source = await fs.readFile(file, 'utf8');
  const minified = await transform(source, { minify: true, format: 'esm', target: 'es2022' });
  const module = await import(`${pathToFileURL(file).href}?benchmark=${Date.now()}`);
  return { module, bytes: new TextEncoder().encode(minified.code) };
}

function compileRust(directory, artifact) {
  const targetDir = path.join(TMP, `${directory}-target`);
  const manifest = path.join(BENCH, directory, 'Cargo.toml');
  const rustc = spawnSync('rustup', ['which', '--toolchain', 'stable', 'rustc'], { encoding: 'utf8' });
  if (rustc.status !== 0) throw new Error('rustup stable is required for bench:deltablue');
  const result = spawnSync('cargo', [
    'build', '--release', '--lib', '--target', 'wasm32-unknown-unknown',
    '--manifest-path', manifest, '--target-dir', targetDir,
  ], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RUSTC: rustc.stdout.trim() } });
  if (result.status !== 0) throw new Error(`DeltaBlue Rust build failed:\n${result.stderr || result.stdout}`);
  return new Uint8Array(readFileSync(path.join(targetDir, 'wasm32-unknown-unknown', 'release', `${artifact}.wasm`)));
}

function time(run) { const start = Bun.nanoseconds(); run(); return (Bun.nanoseconds() - start) / 1e6; }
function median(values) { const sorted = [...values].sort((a, b) => a - b); const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; }
function formatMs(value) { return `${value.toFixed(3)} ms`; }
function formatBytes(value) { return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(2)} KiB`; }
