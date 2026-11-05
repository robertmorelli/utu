// The Benchmarks Game frontier: for each program in benchmarks/bg/<program>/,
// the fastest BG submission of each language compiled to Wasm, and utu's port,
// timed in d8 (V8's shell) and sized as shipped (Wasm + the JavaScript it needs,
// minified; gzip per file, summed).
//
//   node scripts/benchmark-bg.mjs [program ...] [--ports=c,rust,utu-fast,...]
//        [--samples=N] [--warmups=N] [--n=N] [--json=file] [--no-save]
//
// A program is a directory with a program.json:
//   { "n": 1000000,          bench(n)'s argument (required)
//     "setup": true | 250000, call setup(n) (true) or setup(that number) once,
//                             untimed, before timing (programs that read input)
//     "samples": 10, "warmups": 3,
//     "flags": { "c": ["-mavx"], "rust": ["-C", "target-cpu=..."], ... },
//                             extra flags per port (appended; see PORTS below)
//     "notes": "..." }
// and one directory per port (c/ cpp/ rust/ go/ swift/ haskell/ dart/ js/
// kotlin/ moonbit/ assemblyscript/) plus <program>.utu (idiomatic utu: no @wat/@ir,
// no unrolling beyond the C source) and optionally <program>.tuned.utu (hand-tuned,
// reported as "utu tuned fast/small") and <program>.host.utu (host numbers, e.g.
// JS BigInt: "utu host fast/small"). Ports that are absent
// are skipped. Every port exports bench(n) returning a checksum (an integer
// is compared as an unsigned 32-bit number); all ports must agree.
// See the header of each builder below for what a port directory must hold.
//
// Results: printed, written to benchmarks/bg/<program>/results.json, and
// gathered into benchmarks/bg/results.json.
// Builds and artifacts: .tmp/bg/<program>/. Set D8_BIN to choose the d8.
// Exits 1 if any port failed to build, run, or agree.
import fs from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BG = path.join(ROOT, 'benchmarks', 'bg');
const D8 = process.env.D8_BIN ?? 'd8';
const HOME = process.env.HOME;
const ASC = 'assemblyscript@0.28.20';
const JAVA_HOME = '/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home';
const SWIFT_SDK = 'swift-6.4.1-RELEASE_wasm';
const WASI_SHIM = path.join(BG, 'wasi.js');

const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = name => process.argv.includes(`--${name}`);
const only = option('ports')?.split(',');
const jsonOut = option('json');

// Ports in report order. `kind` is how the d8 driver loads it:
//   wasm    a module instantiated through benchmarks/bg/wasi.js (WASI imports
//           shimmed, other imports throw; _initialize and hs_init run if exported)
//   utu     the NAME.mjs loader `utu build` writes, imported
//   dart    dart2wasm's NAME.mjs: compile, instantiate, invokeMain; main() sets
//           globalThis.bench (and setup)
//   kotlin  Kotlin/Wasm's NAME.mjs, imported; its @JsExport functions
//   js      the source, loaded as a script; its top-level bench (and setup)
const UTU_MODES = [['utu-fast', 'fast'], ['utu-fastUnsafe', 'fastUnsafe'], ['utu-small', 'small'], ['utu-smallUnsafe', 'smallUnsafe']];
const PORTS = [
  ...UTU_MODES.map(([key, mode]) => ({ key, name: `utu ${mode}`, kind: 'utu', present: p => existsSync(p.utu), build: p => buildUtu(p, mode, p.utu) })),
  // Optional <program>.tuned.utu (hand-tuned: @wat SIMD, unrolling): reported apart, never as utu's headline.
  ...[['utu-tuned-fast', 'fast'], ['utu-tuned-small', 'small']].map(([key, mode]) => ({ key, name: `utu tuned ${mode}`, kind: 'utu', group: 'utu-tuned', present: p => existsSync(p.tunedUtu), build: p => buildUtu(p, mode, p.tunedUtu) })),
  // Optional <program>.host.utu (numbers in the host, e.g. JS BigInt through @es): reported apart as "utu host fast/small".
  ...[['utu-host-fast', 'fast'], ['utu-host-small', 'small']].map(([key, mode]) => ({ key, name: `utu host ${mode}`, kind: 'utu', group: 'utu-host', present: p => existsSync(p.hostUtu), build: p => buildUtu(p, mode, p.hostUtu) })),
  { key: 'c', name: 'C', kind: 'wasm', build: p => buildEmscripten(p, 'c', 'emcc', ['.c']) },
  { key: 'cpp', name: 'C++', kind: 'wasm', build: p => buildEmscripten(p, 'cpp', 'em++', ['.cpp', '.cc', '.cxx']) },
  { key: 'rust', name: 'Rust', kind: 'wasm', build: buildRust },
  { key: 'go', name: 'Go', kind: 'wasm', build: buildGo },
  { key: 'swift', name: 'Swift', kind: 'wasm', build: buildSwift },
  { key: 'haskell', name: 'Haskell', kind: 'wasm', build: buildHaskell },
  { key: 'dart', name: 'Dart', kind: 'dart', build: buildDart },
  { key: 'js', name: 'JavaScript', kind: 'js', build: buildJs },
  { key: 'kotlin', name: 'Kotlin', kind: 'kotlin', build: buildKotlin },
  { key: 'moonbit', name: 'MoonBit', kind: 'wasm', build: buildMoonBit },
  { key: 'assemblyscript', name: 'AssemblyScript', kind: 'wasm', build: buildAssemblyScript },
];
const selects = (port, key) => port.key === key || (key === 'utu' && port.kind === 'utu' && !port.group) || (port.group && port.group === key);
if (only) for (const key of only) if (!PORTS.some(p => selects(p, key))) {
  fail(`--ports: no port "${key}"; ports: utu (the four builds of <program>.utu), utu-tuned (both of <program>.tuned.utu), utu-host (both of <program>.host.utu), ${PORTS.map(p => p.key).join(', ')}`);
}

// Runs in d8: loads one port, calls setup once if asked, then bench(n): once for
// the result, `warmups` more, then `samples` timed.
const DRIVER = String.raw`
const [kind, file, samples, warmups, n, setupArg, shim] = arguments;
globalThis.URL ??= class { constructor(rel, base) { this.href = String(base ?? '').replace(/[^/]*$/, '') + String(rel).replace(/^\.\//, ''); } toString() { return this.href; } };
globalThis.fetch ??= url => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(readbuffer(String(url).replace(/^file:\/\//, ''))) });
const die = message => { print('DRIVER-ERROR ' + message); quit(3); };
async function loadPort() {
  if (kind === 'js') { load(file); return globalThis; }
  if (kind === 'wasm') { load(shim); return instantiateWasi(readbuffer(file)); }
  if (kind === 'utu' || kind === 'kotlin') { const m = await import(file); return kind === 'utu' ? m.exports : m; }
  if (kind === 'dart') {
    const runtime = await import(file);
    const app = await (await runtime.compile(readbuffer(file.replace(/\.mjs$/, '.wasm')))).instantiate({});
    app.invokeMain();
    return globalThis;
  }
  die('unknown kind ' + kind);
}
// An integer checksum is compared as unsigned 32-bit (i32 results arrive signed, i64 as BigInt).
const norm = r => typeof r === 'bigint' ? Number(BigInt.asUintN(32, r)) : Number.isInteger(r) ? r >>> 0 : r;
loadPort().then(e => {
  if (typeof e.bench !== 'function') die('the port exports no bench function (exports: ' + Object.keys(e).filter(k => typeof e[k] === 'function').slice(0, 20).join(', ') + ')');
  if (setupArg !== '') {
    if (typeof e.setup !== 'function') die('program.json asks for setup, but the port exports no setup function');
    e.setup(+setupArg);
  }
  const run = () => e.bench(+n);
  const result = String(norm(run()));
  for (let i = 0; i < +warmups; i++) run();
  const times = [];
  for (let i = 0; i < +samples; i++) { const start = performance.now(); const r = String(norm(run())); times.push(performance.now() - start); if (r !== result) die('bench returned ' + r + ' after ' + result + ': it must be repeatable'); }
  const sorted = [...times].sort((a, b) => a - b), m = sorted.length >> 1;
  print('RESULT ' + JSON.stringify({ result, median: sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2, best: sorted[0], times }));
}).catch(error => die((error && error.stack) || String(error)));
`;

const version = spawnSync(D8, ['-e', 'print(version())'], { encoding: 'utf8' });
if (version.error || version.status !== 0) fail(`d8 unavailable (${D8}): put d8 on PATH or set D8_BIN`);
const known = readdirSync(BG).filter(name => existsSync(path.join(BG, name, 'program.json'))).sort();
const names = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
for (const name of names) if (!known.includes(name)) fail(`no program "${name}" (no benchmarks/bg/${name}/program.json); programs: ${known.join(', ') || 'none'}`);

const recorded = {};
let failures = 0;
for (const name of names.length ? names : known) {
  try { recorded[name] = await runProgram(name); } catch (error) { failures++; console.error(`\n${name}: ${error.message}`); }
}
// Each program's results go to benchmarks/bg/<program>/results.json (agents
// run programs at once, so no file is shared), then benchmarks/bg/results.json
// is rebuilt from all of them.
if (!flag('no-save') && Object.keys(recorded).length) {
  for (const [name, result] of Object.entries(recorded)) {
    const file = path.join(BG, name, 'results.json');
    const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    // A run of some ports keeps the other ports' last results (same n).
    if (only && old && old.n === result.n) result.ports = [...old.ports.filter(p => !result.ports.some(q => q.key === p.key)), ...result.ports].sort((a, b) => order(a.key) - order(b.key));
    result.d8 = version.stdout.trim();
    await fs.writeFile(file, JSON.stringify(result, null, 1) + '\n');
    console.log(`\nwrote ${path.relative(ROOT, file)}`);
  }
  const all = { programs: {} };
  for (const name of readdirSync(BG).sort()) {
    const file = path.join(BG, name, 'results.json');
    if (existsSync(file)) all.programs[name] = JSON.parse(readFileSync(file, 'utf8'));
  }
  await fs.writeFile(path.join(BG, 'results.json'), JSON.stringify(all, null, 1) + '\n');
}
if (jsonOut) await fs.writeFile(jsonOut, JSON.stringify(recorded, null, 1));
process.exit(failures ? 1 : 0);

function order(key) { return PORTS.findIndex(p => p.key === key); }

async function runProgram(name) {
  const dir = path.join(BG, name);
  let config;
  try { config = JSON.parse(readFileSync(path.join(dir, 'program.json'), 'utf8')); } catch (error) { throw new Error(`program.json: ${error.message}`); }
  const n = Number(option('n') ?? config.n);
  if (!Number.isFinite(n)) throw new Error('program.json needs "n" (bench\'s argument)');
  const setupArg = config.setup === true ? n : typeof config.setup === 'number' ? config.setup : null;
  const samples = Number(option('samples') ?? process.env.BENCH_SAMPLES ?? config.samples ?? 10);
  const warmups = Number(option('warmups') ?? process.env.BENCH_WARMUPS ?? config.warmups ?? 3);
  const tmp = path.join(ROOT, '.tmp', 'bg', name);
  await fs.mkdir(tmp, { recursive: true });
  const driver = path.join(tmp, 'd8-driver.js');
  await fs.writeFile(driver, DRIVER);
  const program = { name, dir, tmp, config, setup: setupArg !== null, utu: path.join(dir, `${name}.utu`), tunedUtu: path.join(dir, `${name}.tuned.utu`), hostUtu: path.join(dir, `${name}.host.utu`), flags: key => config.flags?.[key] ?? [] };

  const ports = PORTS.filter(p => (p.present ? p.present(program) : existsSync(path.join(dir, p.key))))
    .filter(p => !only || only.some(key => selects(p, key)));
  console.log(`\n${name}: n=${n}${setupArg !== null ? `, setup(${setupArg})` : ''}; ${samples} samples after ${warmups} warmups; ports: ${ports.map(p => p.key).join(', ') || 'none'}`);
  const results = [];
  for (const port of ports) {
    const out = { key: port.key, name: port.name };
    results.push(out);
    process.stdout.write(`  ${port.name.padEnd(17)}`);
    let built;
    try {
      const start = performance.now();
      built = await port.build(program);
      out.compileMs = Math.round(performance.now() - start);
      if (built.compileMs) out.compileMs = Math.round(built.compileMs);
      out.flags = built.flags ?? [];
      const js = await Promise.all((built.js ?? []).map(file => minify(readFileSync(file), file)));
      const wasm = built.wasm ? readFileSync(built.wasm) : new Uint8Array();
      out.wasm = wasm.length;
      out.js = js.reduce((sum, file) => sum + file.length, 0);
      out.bytes = out.wasm + out.js;
      out.gzip = [wasm, ...js].filter(file => file.length).reduce((sum, file) => sum + gzipSync(file, { level: 9 }).length, 0);
      out.jsFiles = (built.js ?? []).map(file => path.relative(ROOT, file));
    } catch (error) {
      out.error = `build: ${error.message}`;
      console.log(`BUILD FAILED\n${indent(error.message)}`);
      continue;
    }
    const run = spawnSync(D8, [driver, '--', port.kind, built.run, samples, warmups, n, setupArg ?? '', WASI_SHIM], { encoding: 'utf8', timeout: 900000, maxBuffer: 64 << 20 });
    const line = run.stdout?.split('\n').find(text => text.startsWith('RESULT '));
    if (!line) {
      const why = run.error ? String(run.error) : [run.stdout, run.stderr].join('\n').split('\n').filter(Boolean).slice(-12).join('\n');
      out.error = `run: ${why}`;
      console.log(`RUN FAILED (${built.run})\n${indent(why)}`);
      continue;
    }
    Object.assign(out, JSON.parse(line.slice(7)));
    console.log(`${fmtMs(out.median)} (best ${fmtMs(out.best)})  ${fmtBytes(out.bytes)} raw, ${fmtBytes(out.gzip)} gzip  [wasm ${out.wasm}, js ${out.js}]  result ${out.result}`);
  }

  // Agreement: the most common result is the expected one.
  const ran = results.filter(r => r.result !== undefined);
  const counts = new Map();
  for (const r of ran) counts.set(r.result, (counts.get(r.result) ?? 0) + 1);
  const expected = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const r of ran) if (r.result !== expected) r.error = `wrong result ${r.result} (others: ${expected})`;
  const bad = results.filter(r => r.error);
  if (counts.size > 1) console.log(`  RESULTS DIFFER: ${ran.map(r => `${r.key}=${r.result}`).join(', ')}`);
  for (const r of bad) console.log(`  ${r.name}: ${r.error.split('\n')[0]}`);
  if (bad.length) failures++;
  return { n, setup: setupArg, samples, warmups, result: expected ?? null, notes: config.notes ?? '', date: new Date().toISOString(), ports: results };
}

// ---- builders: each returns { wasm, js: [files to ship], run: file for the driver, flags, compileMs? }

function sh(what, command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 900000, ...options });
  if (result.error?.code === 'ENOENT') throw new Error(`${what}: ${command} not found on PATH`);
  if (result.error || result.status !== 0) {
    const output = `${result.error ?? ''}${[result.stdout, result.stderr].join('\n')}`.replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').filter(line => line.trim());
    const first = output.find(line => /error|fail|cannot|not found|undefined|unexpected/i.test(line)) ?? output[0] ?? `exit ${result.status}`;
    throw new Error(`${what}: ${first.trim()}\n${output.slice(-40).join('\n')}\n(command: ${command} ${args.join(' ')})`);
  }
  return result;
}
function clean(...dirs) { for (const dir of dirs) spawnSync('rm', ['-rf', dir]); }
function sources(dir, extensions) {
  if (!existsSync(dir)) throw new Error(`${dir} is missing`);
  const files = readdirSync(dir).filter(file => extensions.some(ext => file.endsWith(ext))).map(file => path.join(dir, file));
  if (!files.length) throw new Error(`no ${extensions.join('/')} source in ${path.relative(ROOT, dir)}`);
  return files;
}
function exportsOf(p) { return p.setup ? ['bench', 'setup'] : ['bench']; }

// How a linear-memory module ships: with wasi.js if it imports WASI, else with
// a loader like utu's (fetch or read the module, instantiate, _initialize).
function linearShip(p, key, wasm) {
  const imports = WebAssembly.Module.imports(new WebAssembly.Module(readFileSync(wasm)));
  if (imports.some(i => i.module === 'wasi_snapshot_preview1')) return [WASI_SHIM];
  const env = imports.filter(i => i.kind === 'function').map(i => i.name === "emscripten_notify_memory_growth" ? `${i.name}() {}` : `${JSON.stringify(i.name)}() { throw new Error(${JSON.stringify(i.name)}); }`);
  const other = imports.filter(i => i.kind !== 'function' || i.module !== 'env');
  if (other.length) throw new Error(`${path.basename(wasm)} imports ${other.map(i => `${i.module}.${i.name}`).join(', ')}: give it a loader`);
  const file = path.join(p.tmp, `${key}-loader.mjs`);
  const url = `new URL(${JSON.stringify(`./${path.basename(wasm)}`)}, import.meta.url)`;
  const text = `const bytes = await (typeof process === 'object' && process.versions?.node ? import('node:fs/promises').then(fs => fs.readFile(${url})) : fetch(${url}).then(r => r.arrayBuffer()));
export const instance = (await WebAssembly.instantiate(bytes, ${env.length ? `{ env: { ${env.join(', ')} } }` : '{}'})).instance;
export const exports = instance.exports;
exports._initialize?.();
`;
  return [writeSync(file, text)];
}
function writeSync(file, text) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); return file; }

// utu: `utu build -O mode` (the self-hosted compiler); ships NAME.wasm and the
// NAME.mjs loader it writes. Built with the CLI, so what runs is what ships.
async function buildUtu(p, mode, file) {
  const stem = path.basename(file, '.utu');
  const out = path.join(p.tmp, `${stem.replace(/\./g, '-')}-utu-${mode}`);
  clean(out);
  const start = performance.now();
  sh(`utu build -O ${mode} ${path.basename(file)}`, process.execPath, [path.join(ROOT, 'cli', 'utu.mjs'), 'build', file, '-O', mode, '-o', out]);
  const compileMs = performance.now() - start;
  const base = path.join(out, stem);
  return { wasm: `${base}.wasm`, js: [`${base}.mjs`], run: `${base}.mjs`, flags: ['-O', mode], compileMs };
}

// C / C++ (c/*.c, cpp/*.cpp): Emscripten, -O3 -msimd128, a standalone module
// (no JS glue; WASI imports only if the code does I/O). bench (and setup) are
// exported by name; flags.c / flags.cpp are appended (e.g. -mavx for code
// written with AVX intrinsics: Emscripten emulates them on simd128).
function buildEmscripten(p, key, compiler, extensions) {
  const out = path.join(p.tmp, key);
  clean(out);
  const wasm = path.join(out, `${p.name}.wasm`);
  const flags = ['-O3', '-msimd128', '-sSTANDALONE_WASM', '--no-entry', '-sALLOW_MEMORY_GROWTH', `-sEXPORTED_FUNCTIONS=${exportsOf(p).map(e => `_${e}`).join(',')}`, ...p.flags(key)];
  mkdirSync(out, { recursive: true });
  // C sources beside C++ ones (a C library such as PCRE2): compiled by emcc as C, then linked.
  const cBeside = key === 'cpp' ? readdirSync(path.join(p.dir, key)).filter(f => f.endsWith('.c')).map(f => {
    const object = path.join(out, `${path.basename(f, '.c')}.o`);
    sh(`${key} (emcc ${path.basename(f)})`, 'emcc', ['-O3', '-msimd128', '-c', path.join(p.dir, key, f), '-o', object]);
    return object;
  }) : [];
  sh(`${key} (${compiler})`, compiler, [...flags, ...sources(path.join(p.dir, key), extensions), ...cBeside, '-o', wasm]);
  return { wasm, js: linearShip(p, key, wasm), run: wasm, flags };
}

// Rust (rust/Cargo.toml, a cdylib): cargo build --release for
// wasm32-unknown-unknown with +simd128 (set lto, codegen-units = 1, panic =
// "abort" in Cargo.toml). Exports are #[no_mangle] pub extern "C" fns.
function buildRust(p) {
  const manifest = path.join(p.dir, 'rust', 'Cargo.toml');
  if (!existsSync(manifest)) throw new Error('rust/Cargo.toml is missing');
  const toml = readFileSync(manifest, 'utf8');
  const crate = (toml.match(/\[lib\][^[]*?\bname\s*=\s*"([^"]+)"/)?.[1] ?? toml.match(/\[package\][^[]*?\bname\s*=\s*"([^"]+)"/)?.[1])?.replace(/-/g, '_');
  if (!crate) throw new Error('rust/Cargo.toml: no package name');
  const rustc = spawnSync('rustup', ['which', '--toolchain', 'stable', 'rustc'], { encoding: 'utf8' });
  const target = path.join(p.tmp, 'rust-target');
  clean(target);
  const rustflags = ['-C', 'target-feature=+simd128', ...p.flags('rust')];
  sh('rust (cargo)', 'cargo', ['build', '--release', '--lib', '--target', 'wasm32-unknown-unknown', '--manifest-path', manifest, '--target-dir', target], {
    env: { ...process.env, ...(rustc.status === 0 ? { RUSTC: rustc.stdout.trim() } : {}), RUSTFLAGS: rustflags.join(' ') },
  });
  const wasm = path.join(target, 'wasm32-unknown-unknown', 'release', `${crate}.wasm`);
  if (!existsSync(wasm)) throw new Error(`cargo built no ${crate}.wasm (is crate-type ["cdylib"]?)`);
  return { wasm, js: linearShip(p, 'rust', wasm), run: wasm, flags: ['--release', ...rustflags] };
}

// Go (go/: go.mod and *.go, package main with an empty main): GOOS=wasip1
// -buildmode=c-shared, a WASI reactor; exports are //go:wasmexport funcs.
// A fresh build cache each time, so the runtime is built too.
function buildGo(p) {
  const out = path.join(p.tmp, 'go');
  const cache = path.join(p.tmp, 'go-cache');
  clean(out, cache);
  const wasm = path.join(out, `${p.name}.wasm`);
  const flags = ['-buildmode=c-shared', '-trimpath', '-ldflags=-s -w', ...p.flags('go')];
  sh('go build', 'go', ['build', ...flags, '-o', wasm, '.'], { cwd: path.join(p.dir, 'go'), env: { ...process.env, GOOS: 'wasip1', GOARCH: 'wasm', GOCACHE: cache } });
  return { wasm, js: [WASI_SHIM], run: wasm, flags };
}

// Swift (swift/Package.swift, an executable target linked as a reactor, with
// @_expose(wasm, "bench") @_cdecl("bench") exports): swift build -c release
// with the Swift SDK for WebAssembly (swiftly's toolchain in ~/.swiftly/bin).
function buildSwift(p) {
  const scratch = path.join(p.tmp, 'swift');
  clean(scratch);
  const env = { ...process.env, PATH: `${path.join(HOME, '.swiftly', 'bin')}${path.delimiter}${process.env.PATH}` };
  const flags = ['-c', 'release', '--swift-sdk', SWIFT_SDK, '-Xlinker', '--strip-all', ...p.flags('swift')];
  sh('swift build', 'swift', ['build', ...flags, '--scratch-path', scratch], { cwd: path.join(p.dir, 'swift'), env });
  const found = spawnSync('find', [scratch, '-name', '*.wasm', '-path', '*elease*'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(f => f && !f.includes('.build/') && !f.includes('.o/'));
  const wasm = found.sort((a, b) => statSync(b).size - statSync(a).size)[0];
  if (!wasm) throw new Error('swift build made no .wasm');
  return { wasm, js: [WASI_SHIM], run: wasm, flags };
}

// Haskell (haskell/*.hs, one module, `foreign export ccall bench`): GHC's wasm
// backend (~/.ghc-wasm) at -O2, a WASI reactor exporting hs_init and bench/setup.
function buildHaskell(p) {
  const out = path.join(p.tmp, 'haskell');
  clean(out);
  const [source, ...more] = sources(path.join(p.dir, 'haskell'), ['.hs']);
  if (more.length) throw new Error('haskell/ must hold one .hs file');
  const wasm = path.join(out, `${p.name}.wasm`);
  const flags = ['-O2', ...p.flags('haskell')];
  const q = s => `'${s.replace(/'/g, `'\\''`)}'`;
  // C sources beside it (a C library for its FFI, such as PCRE2) are compiled and linked by GHC.
  const cBeside = readdirSync(path.join(p.dir, 'haskell')).filter(f => f.endsWith('.c')).map(f => path.join(p.dir, 'haskell', f));
  const command = [`source ${q(path.join(HOME, '.ghc-wasm', 'env'))} &&`, 'mkdir -p', q(out), '&& wasm32-wasi-ghc', ...flags.map(q), q(source), ...cBeside.map(q),
    '-outputdir', q(path.join(out, 'obj')), '-o', q(wasm), '-no-hs-main -optl-mexec-model=reactor',
    `-optl-Wl,--export=hs_init,${exportsOf(p).map(e => `--export=${e}`).join(',')}`, '-optl-Wl,--strip-all'].join(' ');
  sh('wasm32-wasi-ghc', 'bash', ['-c', command]);
  return { wasm, js: [WASI_SHIM], run: wasm, flags };
}

// Dart (dart/<program>.dart; main() sets globalThis.bench via dart:js_interop):
// dart compile wasm -O2 (WasmGC); ships the module and its NAME.mjs runtime.
function buildDart(p) {
  const out = path.join(p.tmp, 'dart');
  clean(out);
  const [source] = sources(path.join(p.dir, 'dart'), ['.dart']).filter(f => path.basename(f) === `${p.name}.dart`).concat(sources(path.join(p.dir, 'dart'), ['.dart']));
  const flags = ['-O2', ...p.flags('dart')];
  sh('dart compile wasm', 'dart', ['compile', 'wasm', ...flags, '--no-source-maps', '-o', path.join(out, `${p.name}.wasm`), source]);
  return { wasm: path.join(out, `${p.name}.wasm`), js: [path.join(out, `${p.name}.mjs`)], run: path.join(out, `${p.name}.mjs`), flags };
}

// JavaScript (js/<program>.js, a script whose top level defines bench and
// setup): run as is; ships its minified source.
function buildJs(p) {
  const files = sources(path.join(p.dir, 'js'), ['.js']);
  const source = files.find(f => path.basename(f) === `${p.name}.js`) ?? files[0];
  const text = readFileSync(source, 'utf8');
  if (/^export /m.test(text)) throw new Error(`${path.relative(ROOT, source)}: a script, not a module (no export)`);
  return { js: [source], run: source, flags: [] };
}

// Kotlin (kotlin/: Gradle multiplatform, wasmJs { outputModuleName = <program>;
// d8(); binaries.executable() }, @JsExport fun bench): the optimized
// production build (WasmGC); ships the module and the .mjs files it writes.
function buildKotlin(p) {
  const work = path.join(p.tmp, 'kotlin');
  clean(work);
  const flags = ['compileProductionExecutableKotlinWasmJsOptimize', ...p.flags('kotlin')];
  sh('gradle (kotlin)', 'gradle', ['-q', '--project-cache-dir', path.join(work, 'gradle-cache'), `-PoutDir=${path.join(work, 'build')}`,
    `-Pkotlin.project.persistent.dir=${path.join(work, 'kotlin-data')}`, ...flags], { cwd: path.join(p.dir, 'kotlin'), env: { ...process.env, JAVA_HOME } });
  const out = path.join(work, 'build', 'compileSync', 'wasmJs', 'main', 'productionExecutable', 'optimized');
  const wasm = path.join(out, `${p.name}.wasm`);
  if (!existsSync(wasm)) throw new Error(`no ${p.name}.wasm in ${out}: set outputModuleName to "${p.name}"`);
  return { wasm, js: readdirSync(out).filter(f => f.endsWith('.mjs')).map(f => path.join(out, f)), run: path.join(out, `${p.name}.mjs`), flags };
}

// MoonBit (moonbit/: moon.mod, moon.pkg with link.wasm-gc.exports, *.mbt):
// moon build --target wasm-gc --release (~/.moon/bin).
function buildMoonBit(p) {
  const out = path.join(p.tmp, 'moonbit');
  clean(out);
  const flags = ['--target', 'wasm-gc', '--release', ...p.flags('moonbit')];
  sh('moon build', path.join(HOME, '.moon', 'bin', 'moon'), ['build', ...flags, '--target-dir', out], { cwd: path.join(p.dir, 'moonbit') });
  const built = path.join(out, 'wasm-gc', 'release', 'build');
  const wasm = readdirSync(built).filter(f => f.endsWith('.wasm')).map(f => path.join(built, f))[0];
  if (!wasm) throw new Error(`moon build made no .wasm in ${built}`);
  return { wasm, js: linearShip(p, 'moonbit', wasm), run: wasm, flags };
}

// AssemblyScript (assemblyscript/<program>.ts, `export function bench`):
// asc -O3 --enable simd, the incremental runtime (linear memory, its own GC).
function buildAssemblyScript(p) {
  const out = path.join(p.tmp, 'assemblyscript');
  clean(out);
  const files = sources(path.join(p.dir, 'assemblyscript'), ['.ts']);
  const source = files.find(f => path.basename(f) === `${p.name}.ts`) ?? files[0];
  const wasm = path.join(out, `${p.name}.wasm`);
  const flags = ['-O3', '--enable', 'simd', '--runtime', 'incremental', ...p.flags('assemblyscript')];
  sh('asc', 'npx', ['--yes', '-p', ASC, 'asc', source, ...flags, '-o', wasm]);
  return { wasm, js: linearShip(p, 'assemblyscript', wasm), run: wasm, flags };
}

async function minify(bytes, file) {
  try {
    const { code } = await transform(Buffer.from(bytes).toString('utf8'), { minify: true, format: file.endsWith('.mjs') ? 'esm' : undefined, target: 'es2022', legalComments: 'none' });
    return new TextEncoder().encode(code);
  } catch (error) { throw new Error(`minifying ${file}: ${error.message}`); }
}

function fail(message) { console.error(message); process.exit(2); }
function indent(text) { return text.split('\n').slice(0, 40).map(line => `      ${line}`).join('\n'); }
function fmtMs(value) { return `${value.toFixed(1)} ms`; }
function fmtBytes(value) { return value < 1024 ? `${value} B` : value < 1 << 20 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1048576).toFixed(2)} MiB`; }
