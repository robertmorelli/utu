// Classic programs in utu, safe Rust, unsafe Rust, and JavaScript, timed in d8
// (V8's shell): DeltaBlue, Richards, n-body, binary-trees, and fannkuch-redux.
// This process builds every port and checks they agree; each port runs in a
// d8 of its own, which warms it up and times it. Set D8_BIN to choose the d8.
//
//   node scripts/benchmark-programs-d8.mjs [name ...] [--json=file]
//
// utu builds at -O3 and -Oz, warm (the median of 20 builds after 5); Rust
// builds with `cargo build --release` from a clean target directory (the
// median of 3). A size is what ships: the module, or JavaScript minified.
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { compileFile, loadNodeCompiler } from '../src/selfhost/node.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TMP = path.join(ROOT, '.tmp', 'program-benchmarks');
const SAMPLES = Number(process.env.BENCH_SAMPLES ?? 20);
const WARMUPS = Number(process.env.BENCH_WARMUPS ?? 5);
const D8 = process.env.D8_BIN ?? 'd8';

// Each program's workloads: the export each port runs, with its argument.
const PROGRAMS = {
  deltablue: {
    unsafeCrate: 'rust_deltablue_arena',
    workloads: [
      { name: 'chain', utu: 'main(0, N)', rust: 'bench_chain(N)', js: 'benchChain(N)', n: 20 },
      { name: 'projection', utu: 'main(1, N)', rust: 'bench_projection(N)', js: 'benchProjection(N)', n: 20 },
    ],
  },
  richards: { workloads: [{ name: 'richards', n: 1 }] },
  nbody: { workloads: [{ name: 'n-body', n: 5 }] },
  binarytrees: { workloads: [{ name: 'binary-trees', n: 1 }] },
  fannkuch: { workloads: [{ name: 'fannkuch-redux', n: 1 }] },
};

// Runs in d8: one port of one program, each of its workloads.
const DRIVER = String.raw`
const [kind, file, samples, warmups, calls] = arguments;
let e;
if (kind === 'js') { load(file); e = globalThis; }
else e = new WebAssembly.Instance(new WebAssembly.Module(readbuffer(file)), {}).exports;
function measure(run) {
  const result = String(run());
  for (let i = 0; i < +warmups; i++) run();
  const times = [];
  for (let i = 0; i < +samples; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  const m = times.length >> 1;
  return { result, median: times.length % 2 ? times[m] : (times[m - 1] + times[m]) / 2, best: times[0] };
}
print('RESULT ' + JSON.stringify(JSON.parse(calls).map(call => measure(new Function('e', 'return () => e.' + call)(e)))));
`;

const version = spawnSync(D8, ['-e', 'print(version())'], { encoding: 'utf8' });
if (version.error || version.status !== 0) throw new Error('d8 unavailable: put d8 on PATH or set D8_BIN');
const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const json = process.argv.find(arg => arg.startsWith('--json='))?.slice(7);
const names = args.length ? args : Object.keys(PROGRAMS);
const median = values => { const s = [...values].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const recorded = { d8: version.stdout.trim(), programs: {} };
for (const name of names) if (!PROGRAMS[name]) throw new Error(`no program ${name}: ${Object.keys(PROGRAMS).join(', ')}`);
await fs.mkdir(TMP, { recursive: true });
const driver = path.join(TMP, 'd8-driver.js');
await fs.writeFile(driver, DRIVER);
const utu = await loadNodeCompiler();

console.log(`d8 ${version.stdout.trim()}: ${SAMPLES} samples after ${WARMUPS} warmups; median (best)`);
for (const name of names) {
  const program = PROGRAMS[name];
  const dir = path.join(ROOT, 'benchmarks', name);
  const ports = [
    { port: 'utu -O3', file: `${name}.wasm`, ...await compileUtu(path.join(dir, `${name}.utu`), 'speed'), call: w => w.utu ?? 'bench(N)' },
    { port: 'utu -Oz', file: `${name}-oz.wasm`, ...await compileUtu(path.join(dir, `${name}.utu`), 'size'), call: w => w.utu ?? 'bench(N)' },
    { port: name === 'deltablue' ? 'Rc Rust' : 'safe Rust', file: `${name}-rust.wasm`, ...compileRust(dir, 'rust', `rust_${name}`), call: w => w.rust ?? 'bench(N)' },
    { port: 'unsafe Rust', file: `${name}-rust-unsafe.wasm`, ...compileRust(dir, 'rust-unsafe', program.unsafeCrate ?? `rust_${name}_unsafe`), call: w => w.rust ?? 'bench(N)' },
    { port: 'JavaScript', file: `${name}.js`, ...await loadJavaScript(path.join(dir, `${name}.js`)), call: w => w.js ?? 'bench(N)' },
  ];
  console.log(`\n${name}: ${ports.map(p => `${p.port} ${formatBytes(p.bytes.length)} (${formatBytes(gzipSync(p.bytes).length)} gzip)`).join(', ')}`);
  for (const p of ports) {
    await fs.writeFile(path.join(TMP, p.file), p.script ?? p.bytes);
    const calls = program.workloads.map(w => p.call(w).replace('N', w.n));
    const run = spawnSync(D8, [driver, '--', p.script ? 'js' : 'wasm', path.join(TMP, p.file), SAMPLES, WARMUPS, JSON.stringify(calls)], { encoding: 'utf8', timeout: 600000 });
    const line = run.stdout?.split('\n').find(text => text.startsWith('RESULT '));
    if (run.status !== 0 || !line) throw new Error(`${name}, ${p.port} in d8 failed:\n${run.stdout}\n${run.stderr}`);
    p.results = JSON.parse(line.slice(7));
  }
  program.workloads.forEach((w, i) => {
    const expected = ports[2].results[i].result;
    const wrong = ports.filter(p => p.results[i].result !== expected);
    if (wrong.length) throw new Error(`${name} ${w.name}: results differ, ${ports.map(p => `${p.port}=${p.results[i].result}`).join(', ')}`);
    const [utuTime, , rust, rustUnsafe, js] = ports.map(p => p.results[i].median);
    console.log(`  ${w.name} (×${w.n}, result ${expected}): ${ports.map(p => `${p.port} ${formatMs(p.results[i].median)} (${formatMs(p.results[i].best)})`).join(', ')}`);
    console.log(`    utu -O3: ${(utuTime / rust).toFixed(2)}× safe Rust, ${(utuTime / rustUnsafe).toFixed(2)}× unsafe Rust, ${(utuTime / js).toFixed(2)}× JS time`);
  });
  recorded.programs[name] = {
    workloads: program.workloads.map(w => ({ name: w.name, n: w.n, result: ports[2].results[program.workloads.indexOf(w)].result })),
    ports: ports.map(p => ({ name: p.port, times: p.results.map(r => r.median), compile: p.compile ?? null, bytes: p.bytes.length, gzip: gzipSync(p.bytes).length })),
  };
}
if (json) await fs.writeFile(json, JSON.stringify(recorded, null, 1));
console.log(`\nartifacts: ${path.relative(ROOT, TMP)}/`);

// utu as `utu build -O3` makes it: the self-hosted compiler, optimizing for speed.
async function compileUtu(file, optimize) {
  let built;
  const times = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    built = await compileFile(utu, file, { optimize });
    if (i >= 5) times.push(performance.now() - start);
  }
  const { wasm, spec, diagnostics } = built;
  if (!wasm) throw new Error(`${file}: ${diagnostics.map(d => d.message).join('; ')}`);
  if (Object.keys(spec ?? {}).length) throw new Error(`${file}: a benchmark module must import nothing from its host`);
  return { bytes: wasm, compile: median(times) };
}

// The module as a d8 script (its exports as globals); payload is its minified size.
async function loadJavaScript(file) {
  const source = await fs.readFile(file, 'utf8');
  const minified = await transform(source, { minify: true, format: 'esm', target: 'es2022' });
  return { script: source.replace(/^export /gm, ''), bytes: new TextEncoder().encode(minified.code) };
}

function compileRust(dir, directory, artifact) {
  const targetDir = path.join(TMP, `${path.basename(dir)}-${directory}-target`);
  const rustc = spawnSync('rustup', ['which', '--toolchain', 'stable', 'rustc'], { encoding: 'utf8' });
  if (rustc.status !== 0) throw new Error('rustup stable is required for the Rust ports');
  const times = [];
  for (let i = 0; i < 3; i++) {
    spawnSync('rm', ['-rf', targetDir]);
    const start = performance.now();
    const result = spawnSync('cargo', [
      'build', '--release', '--lib', '--target', 'wasm32-unknown-unknown',
      '--manifest-path', path.join(dir, directory, 'Cargo.toml'), '--target-dir', targetDir,
    ], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RUSTC: rustc.stdout.trim() } });
    times.push(performance.now() - start);
    if (result.status !== 0) throw new Error(`${dir}/${directory}: Rust build failed:\n${result.stderr || result.stdout}`);
  }
  return { bytes: new Uint8Array(readFileSync(path.join(targetDir, 'wasm32-unknown-unknown', 'release', `${artifact}.wasm`))), compile: median(times) };
}

function formatMs(value) { return `${value.toFixed(2)} ms`; }
function formatBytes(value) { return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KiB`; }
