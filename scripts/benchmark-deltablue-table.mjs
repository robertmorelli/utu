// DeltaBlue's table: Rc and unsafe Rust and JavaScript against utu at -O3
// and -Oz, each
// with and without --safe (which keeps the bounds checks wasm does not make),
// each timed in d8, with how long each takes to compile and how big it is.
//
//   node scripts/benchmark-deltablue-table.mjs [--json=file]
//
// utu builds with the shipped self-hosted compiler, warm (the median
// of 20 builds after 5); Rust builds with `cargo build --release` from a clean
// target directory (the median of 3). Set D8_BIN to choose the d8.
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
const [file, samples, warmups, iterations] = arguments;
let runs;
if (file.endsWith('.js')) {
  load(file);
  runs = [() => benchChain(+iterations), () => benchProjection(+iterations)];
} else {
  const e = new WebAssembly.Instance(new WebAssembly.Module(readbuffer(file)), {}).exports;
  runs = e.main ? [() => e.main(0, +iterations), () => e.main(1, +iterations)] : [() => e.bench_chain(+iterations), () => e.bench_projection(+iterations)];
}
print('RESULT ' + JSON.stringify(runs.map(run => {
  const result = String(run());
  for (let i = 0; i < +warmups; i++) run();
  const times = [];
  for (let i = 0; i < +samples; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  return { result, median: (times[(samples >> 1) - 1] + times[samples >> 1]) / 2 };
})));
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
];
for (const [i, port] of ports.entries()) {
  const file = path.join(TMP, `port${i}.${port.script ? 'js' : 'wasm'}`);
  await fs.writeFile(file, port.script ?? port.wasm);
  const run = spawnSync(D8, [driver, '--', file, SAMPLES, WARMUPS, ITERATIONS], { encoding: 'utf8', timeout: 600000 });
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
