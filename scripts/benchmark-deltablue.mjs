// DeltaBlue in utu, safe Rust, unsafe Rust, and JavaScript, timed in d8 (V8's
// shell). This process builds the four and checks they agree; each runs in a
// d8 of its own, which warms it up and times it. Set D8_BIN to choose the d8.
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { compileFile, loadNodeCompiler } from '../src/selfhost/node.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BENCH = path.join(ROOT, 'benchmarks', 'deltablue');
const TMP = path.join(ROOT, '.tmp', 'deltablue-benchmark');
const SAMPLES = Number(process.env.BENCH_SAMPLES ?? 20);
const WARMUPS = Number(process.env.BENCH_WARMUPS ?? 5);
const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 20);
const D8 = process.env.D8_BIN ?? 'd8';
await fs.mkdir(TMP, { recursive: true });

// Runs in d8: one port, both workloads.
const DRIVER = String.raw`
const [kind, file, samples, warmups, iterations] = arguments;
let chain, projection;
if (kind === 'js') {
  load(file);
  chain = () => benchChain(+iterations);
  projection = () => benchProjection(+iterations);
} else {
  const e = new WebAssembly.Instance(new WebAssembly.Module(readbuffer(file)), {}).exports;
  chain = e.main ? () => e.main(0, +iterations) : () => e.bench_chain(+iterations);
  projection = e.main ? () => e.main(1, +iterations) : () => e.bench_projection(+iterations);
}
function measure(run) {
  const result = String(run());
  for (let i = 0; i < +warmups; i++) run();
  const times = [];
  for (let i = 0; i < +samples; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  const m = times.length >> 1;
  return { result, median: times.length % 2 ? times[m] : (times[m - 1] + times[m]) / 2, best: times[0] };
}
print('RESULT ' + JSON.stringify({ chain: measure(chain), projection: measure(projection) }));
`;

const version = spawnSync(D8, ['-e', 'print(version())'], { encoding: 'utf8' });
if (version.error || version.status !== 0) throw new Error('d8 unavailable: put d8 on PATH or set D8_BIN');

const ports = [
  { name: 'utu', file: 'deltablue-utu.wasm', bytes: await compileUtu() },
  { name: 'safe Rust', file: 'deltablue-rust.wasm', bytes: compileRust('rust', 'rust_deltablue') },
  { name: 'unsafe Rust', file: 'deltablue-rust-unsafe.wasm', bytes: compileRust('rust-unsafe', 'rust_deltablue_arena') },
  { name: 'JavaScript', file: 'deltablue.js', ...await loadJavaScript() },
];
for (const port of ports) await fs.writeFile(path.join(TMP, port.file), port.script ?? port.bytes);
const driver = path.join(TMP, 'd8-driver.js');
await fs.writeFile(driver, DRIVER);

console.log(`DeltaBlue in d8 ${version.stdout.trim()}: ${SAMPLES} samples, ${WARMUPS} warmups, ${ITERATIONS} iteration(s) per sample`);
console.log(`Payload: ${ports.map(port => `${port.name} ${formatBytes(port.bytes.length)} (${formatBytes(gzipSync(port.bytes).length)} gzip)`).join(', ')}`);

const results = ports.map(port => {
  const run = spawnSync(D8, [driver, '--', port.script ? 'js' : 'wasm', path.join(TMP, port.file), SAMPLES, WARMUPS, ITERATIONS], { encoding: 'utf8', timeout: 600000 });
  const line = run.stdout?.split('\n').find(text => text.startsWith('RESULT '));
  if (run.status !== 0 || !line) throw new Error(`${port.name} in d8 failed:\n${run.stdout}\n${run.stderr}`);
  return { ...port, ...JSON.parse(line.slice(7)) };
});

for (const workload of ['chain', 'projection']) {
  const [utu, rust, rustUnsafe, js] = results.map(port => port[workload]);
  const expected = rust.result;
  if (results.some(port => port[workload].result !== expected)) {
    throw new Error(`${workload}: result mismatch, ${results.map(port => `${port.name}=${port[workload].result}`).join(', ')}`);
  }
  console.log(`${workload}: result ${expected}`);
  for (const port of results) {
    console.log(`  ${`${port.name}:`.padEnd(13)}${formatMs(port[workload].median)} median (${formatMs(port[workload].best)} best)`);
  }
  console.log(`  utu ratios: ${(utu.median / rust.median).toFixed(2)}× safe Rust time, ${(utu.median / rustUnsafe.median).toFixed(2)}× unsafe Rust time, ${(utu.median / js.median).toFixed(2)}× JS time`);
}
console.log(`artifacts: ${path.relative(ROOT, TMP)}/`);

// utu as `utu build -O3` makes it: the self-hosted compiler, optimizing for speed.
async function compileUtu() {
  const utu = await loadNodeCompiler();
  const { wasm, spec, diagnostics } = await compileFile(utu, path.join(BENCH, 'deltablue.utu'), { optimize: 'speed' });
  if (!wasm) throw new Error(`deltablue.utu: ${diagnostics.map(d => d.message).join('; ')}`);
  if (Object.keys(spec ?? {}).length) throw new Error('deltablue.utu: the benchmark module must import nothing from its host');
  return wasm;
}

// The module as a d8 script (its exports as globals); payload is its minified size.
async function loadJavaScript() {
  const source = await fs.readFile(path.join(BENCH, 'deltablue.js'), 'utf8');
  const minified = await transform(source, { minify: true, format: 'esm', target: 'es2022' });
  return { script: source.replace(/^export /gm, ''), bytes: new TextEncoder().encode(minified.code) };
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

function formatMs(value) { return `${value.toFixed(3)} ms`; }
function formatBytes(value) { return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(2)} KiB`; }
