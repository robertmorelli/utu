// DeltaBlue's table: utu at -O3 and -Oz, each with and without --safe (which
// keeps the bounds checks wasm does not make), against Rc and unsafe Rust,
// JavaScript, Dart (WasmGC), Go, and Swift (both linear memory), each timed
// in d8, with how long each takes to build and how big what ships is.
//
//   node scripts/benchmark-deltablue-table.mjs [--json=file]
//
// utu builds with the shipped self-hosted compiler, warm (the median of 20
// builds after 5); the others build from clean (the median of 3): Rust with
// `cargo build --release`, Dart with `dart compile wasm -O2`, Go with a fresh
// build cache, Swift with SwiftPM and the Swift SDK for WebAssembly (swiftly's
// toolchain, ~/.swiftly/bin). Dart, Go, and Swift run through the d8 prelude
// beside their source. Set D8_BIN to choose the d8.
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
const TMP = path.join(ROOT, '.tmp', 'deltablue-table');
const SAMPLES = 20, WARMUPS = 5, ITERATIONS = 20;
const D8 = process.env.D8_BIN ?? 'd8';
await fs.mkdir(TMP, { recursive: true });

const DRIVER = String.raw`
const [kind, file, samples, warmups, iterations, dir] = arguments;
let runs;
if (kind === 'js') {
  load(file);
  runs = [() => benchChain(+iterations), () => benchProjection(+iterations)];
} else if (kind === 'prelude') {
  globalThis.PORT_DIR = dir;
  load(file);
  runs = [() => chain(+iterations), () => projection(+iterations)];
} else {
  const e = new WebAssembly.Instance(new WebAssembly.Module(readbuffer(file)), {}).exports;
  runs = e.main ? [() => e.main(0, +iterations), () => e.main(1, +iterations)] : [() => e.bench_chain(+iterations), () => e.bench_projection(+iterations)];
}
Promise.resolve(globalThis.PORT_READY).then(() => print('RESULT ' + JSON.stringify(runs.map(run => {
  const result = String(run());
  for (let i = 0; i < +warmups; i++) run();
  const times = [];
  for (let i = 0; i < +samples; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  return { result, median: (times[(samples >> 1) - 1] + times[samples >> 1]) / 2 };
}))));
`;
const driver = path.join(TMP, 'd8-driver.js');
await fs.writeFile(driver, DRIVER);
const median = values => { const s = [...values].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const utu = await loadNodeCompiler();
const ports = [
  { name: 'Rc Rust', ...buildRust('rust', 'rust_deltablue') },
  { name: 'unsafe Rust', ...buildRust('rust-unsafe', 'rust_deltablue_arena') },
  { name: 'utu -O3', ...await buildUtu({ optimize: 'speed' }) },
  { name: 'utu -O3 --safe', ...await buildUtu({ optimize: 'speed', safe: true }) },
  { name: 'utu -Oz', ...await buildUtu({ optimize: 'size' }) },
  { name: 'utu -Oz --safe', ...await buildUtu({ optimize: 'size', safe: true }) },
  { name: 'JavaScript', ...await loadJavaScript() },
  { name: 'Dart', ...buildDart() },
  { name: 'Go', ...buildGo() },
  { name: 'Swift', ...buildSwift() },
];
for (const [i, port] of ports.entries()) {
  let args;
  if (port.dir) args = ['prelude', path.join(BENCH, port.prelude, 'd8-prelude.js'), SAMPLES, WARMUPS, ITERATIONS, port.dir];
  else {
    const file = path.join(TMP, `port${i}.${port.script ? 'js' : 'wasm'}`);
    await fs.writeFile(file, port.script ?? port.wasm);
    args = [port.script ? 'js' : 'wasm', file, SAMPLES, WARMUPS, ITERATIONS];
  }
  const run = spawnSync(D8, [driver, '--', ...args], { encoding: 'utf8', timeout: 600000 });
  const line = run.stdout?.split('\n').find(text => text.startsWith('RESULT '));
  if (run.status !== 0 || !line) throw new Error(`${port.name} in d8 failed:\n${run.stdout}\n${run.stderr}`);
  [port.chain, port.projection] = JSON.parse(line.slice(7));
  if (port.chain.result !== '0' || port.projection.result !== '0') throw new Error(`${port.name}: DeltaBlue failed its checks`);
}

const version = spawnSync(D8, ['-e', 'print(version())'], { encoding: 'utf8' }).stdout.trim();
const ms = value => value < 10 ? `${value.toFixed(2)} ms` : value < 1000 ? `${value.toFixed(1)} ms` : `${(value / 1000).toFixed(1)} s`;
const kb = value => `${(value / 1024).toFixed(1)} KB`;
const rows = [
  [`chain (${ITERATIONS} × 1,048 variables)`, p => ms(p.chain.median)],
  [`projection (${ITERATIONS} × 1,048 variables)`, p => ms(p.projection.median)],
  ['compile time', p => p.compile === null ? '—' : ms(p.compile)],
  ['size', p => kb(p.wasm.length)],
  ['gzipped', p => kb(gzipSync(p.wasm).length)],
];
console.log(`DeltaBlue in d8 ${version}: median of ${SAMPLES} samples after ${WARMUPS} warmups\n`);
console.log(`| | ${ports.map(p => p.name).join(' | ')} |`);
console.log(`|---|${ports.map(() => '---:').join('|')}|`);
for (const [label, cell] of rows) console.log(`| ${label} | ${ports.map(cell).join(' | ')} |`);
const json = process.argv.find(arg => arg.startsWith('--json='))?.slice(7);
if (json) await fs.writeFile(json, JSON.stringify({ d8: version, ports: ports.map(p => ({ name: p.name, chain: p.chain.median, projection: p.projection.median, compile: p.compile, bytes: p.wasm.length, gzip: gzipSync(p.wasm).length })) }, null, 1));

// The module as a d8 script (its exports as globals); its size is minified,
// and there is no build to time.
async function loadJavaScript() {
  const source = await fs.readFile(path.join(BENCH, 'deltablue.js'), 'utf8');
  const minified = await transform(source, { minify: true, format: 'esm', target: 'es2022' });
  return { script: source.replace(/^export /gm, ''), wasm: new TextEncoder().encode(minified.code), compile: null };
}

async function buildUtu(options) {
  const file = path.join(BENCH, 'deltablue.utu');
  let built;
  const times = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    built = await compileFile(utu, file, options);
    if (i >= 5) times.push(performance.now() - start);
  }
  if (!built.wasm) throw new Error(`${file}: ${built.diagnostics.map(d => d.message).join('; ')}`);
  return { wasm: built.wasm, compile: median(times) };
}

/** The median of 3 runs of `build`, each after `clean`. */
function timedBuilds(what, clean, build) {
  const times = [];
  for (let i = 0; i < 3; i++) {
    clean();
    const start = performance.now();
    const result = build();
    times.push(performance.now() - start);
    if (result.status !== 0) throw new Error(`${what} build failed:\n${result.stderr || result.stdout}`);
  }
  return median(times);
}

// What ships: the module and dart2wasm's JavaScript runtime for it.
function buildDart() {
  const dir = path.join(TMP, 'dart-out');
  const compile = timedBuilds('Dart', () => spawnSync('rm', ['-rf', dir]), () => spawnSync('dart', [
    'compile', 'wasm', '-O2', '--no-source-maps', '-o', path.join(dir, 'deltablue.wasm'), path.join(BENCH, 'dart', 'deltablue.dart'),
  ], { encoding: 'utf8' }));
  const wasm = Buffer.concat([readFileSync(path.join(dir, 'deltablue.wasm')), readFileSync(path.join(dir, 'deltablue.mjs'))]);
  return { wasm, compile, dir, prelude: 'dart' };
}

// GOOS=wasip1, a reactor; a fresh build cache each time, so the runtime builds too.
function buildGo() {
  const dir = path.join(TMP, 'go-out');
  const cache = path.join(TMP, 'go-cache');
  const compile = timedBuilds('Go', () => spawnSync('rm', ['-rf', dir, cache]), () => spawnSync('go', [
    'build', '-buildmode=c-shared', '-trimpath', '-ldflags=-s -w', '-o', path.join(dir, 'deltablue.wasm'), '.',
  ], { cwd: path.join(BENCH, 'go'), encoding: 'utf8', env: { ...process.env, GOOS: 'wasip1', GOARCH: 'wasm', GOCACHE: cache } }));
  return { wasm: readFileSync(path.join(dir, 'deltablue.wasm')), compile, dir, prelude: 'go' };
}

// The full Swift SDK for WebAssembly (wasm32-unknown-wasi), release.
function buildSwift() {
  const scratch = path.join(TMP, 'swift-build');
  const env = { ...process.env, PATH: `${path.join(process.env.HOME, '.swiftly', 'bin')}${path.delimiter}${process.env.PATH}` };
  const compile = timedBuilds('Swift', () => spawnSync('rm', ['-rf', scratch]), () => spawnSync('swift', [
    'build', '-c', 'release', '--swift-sdk', 'swift-6.4.1-RELEASE_wasm', '-Xlinker', '--strip-all', '--scratch-path', scratch,
  ], { cwd: path.join(BENCH, 'swift'), encoding: 'utf8', env }));
  const found = spawnSync('find', [scratch, '-name', 'DeltaBlue.wasm', '-path', '*Release*'], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
  if (!found) throw new Error('Swift: no DeltaBlue.wasm built');
  return { wasm: readFileSync(found), compile, dir: path.dirname(found), prelude: 'swift' };
}

function buildRust(directory, artifact) {
  const rustc = spawnSync('rustup', ['which', '--toolchain', 'stable', 'rustc'], { encoding: 'utf8' });
  if (rustc.status !== 0) throw new Error('rustup stable is required for the Rust ports');
  const targetDir = path.join(TMP, `${directory}-target`);
  const times = [];
  for (let i = 0; i < 3; i++) {
    spawnSync('rm', ['-rf', targetDir]);
    const start = performance.now();
    const result = spawnSync('cargo', [
      'build', '--release', '--lib', '--target', 'wasm32-unknown-unknown',
      '--manifest-path', path.join(BENCH, directory, 'Cargo.toml'), '--target-dir', targetDir,
    ], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RUSTC: rustc.stdout.trim() } });
    times.push(performance.now() - start);
    if (result.status !== 0) throw new Error(`${directory}: Rust build failed:\n${result.stderr || result.stdout}`);
  }
  return { wasm: new Uint8Array(readFileSync(path.join(targetDir, 'wasm32-unknown-unknown', 'release', `${artifact}.wasm`))), compile: median(times) };
}
