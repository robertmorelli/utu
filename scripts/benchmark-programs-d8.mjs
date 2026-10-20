// Classic programs written the same way in many languages, timed in d8 (V8's
// shell): DeltaBlue, Richards, n-body, binary-trees, and fannkuch-redux.
// This process builds every port and checks they agree; each port runs in a
// d8 of its own, which warms it up and times it. Set D8_BIN to choose the d8.
//
//   node scripts/benchmark-programs-d8.mjs [name ...] [--json=file] [--engines=v8,sm,jsc]
//
// --engines runs every port in more than V8's shell: SpiderMonkey's (SM_BIN,
// or jsvu's) and JavaScriptCore's (JSC_BIN, or a WebKit build in .tmp/jsc).
// The first engine is the one the sizes and builds are reported with.
//
// Ports, where a program has them (benchmarks/NAME/<dir>):
//   utu        -O3 and -Oz (DeltaBlue also with --safe), the shipped
//              self-hosted compiler, warm: the median of 20 builds after 5
//   Rust       rust/ (safe; Rc Rust for DeltaBlue) and rust-unsafe/,
//              `cargo build --release`
//   JavaScript NAME.js, run as a script; its size is minified
//   Dart       dart/, `dart compile wasm -O2` (WasmGC)
//   Kotlin     kotlin/, the wasmJs production build with Gradle (WasmGC)
//   MoonBit    moonbit/, `moon build --target wasm-gc --release` (~/.moon/bin)
//   AssemblyScript assemblyscript/, `asc -O3 --runtime incremental` (npx,
//              pinned); linear memory with its own collector
//   Go         go/, GOOS=wasip1 (linear memory, its own runtime)
//   Swift      swift/, the Swift SDK for WebAssembly (linear memory; swiftly's
//              toolchain in ~/.swiftly/bin)
//   Haskell    haskell/, GHC's WebAssembly backend at -O2, a WASI reactor
//              (linear memory, GHC's runtime; ghc-wasm-meta in ~/.ghc-wasm)
// Every build but utu's is from clean, the median of 3 (Gradle's daemon stays
// warm between Kotlin's). Dart, Kotlin, MoonBit, Go, Swift, and Haskell run through the
// d8 prelude beside their source.
//
// A size is what ships to run it: the Wasm, and the JavaScript it needs,
// minified alike (gzip is per file, summed): utu the loader `utu build`
// writes; Rust, MoonBit, and AssemblyScript a loader of the same kind (with
// AssemblyScript's `env.abort`); Dart and Kotlin what their compilers emit; Go,
// Swift, and Haskell the WASI shim in their prelude; JavaScript its source.
import fs from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
const ASC = 'assemblyscript@0.28.20';
const JAVA_HOME = '/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home';

// Each program's workloads: what each kind of port calls, with its argument.
// `wasm` is what a module exporting bench functions calls (Rust,
// AssemblyScript), `prelude` what a d8 prelude defines.
const PROGRAMS = {
  deltablue: {
    unsafeCrate: 'rust_deltablue_arena',
    workloads: [
      { name: 'chain', utu: 'main(0, N)', wasm: 'bench_chain(N)', js: 'benchChain(N)', prelude: 'chain(N)', n: 20 },
      { name: 'projection', utu: 'main(1, N)', wasm: 'bench_projection(N)', js: 'benchProjection(N)', prelude: 'projection(N)', n: 20 },
    ],
  },
  richards: { workloads: [{ name: 'richards', n: 1 }] },
  nbody: { workloads: [{ name: 'n-body', n: 5 }] },
  binarytrees: { workloads: [{ name: 'binary-trees', n: 1 }] },
  fannkuch: { workloads: [{ name: 'fannkuch-redux', n: 1 }] },
};

// Runs in a shell (d8, SpiderMonkey's, or JavaScriptCore's): one port of one
// program, each of its workloads. The shells differ in how they take
// arguments, read files, and keep time.
const DRIVER = String.raw`
const argv = typeof scriptArgs !== 'undefined' ? scriptArgs : arguments;
if (typeof readbuffer === 'undefined') globalThis.readbuffer = file => typeof os === 'object' && os.file ? os.file.readFile(file, 'binary') : readFile(file, 'binary');
if (typeof read === 'undefined') globalThis.read = (file, mode) => mode === 'binary' ? readbuffer(file) : readFile(file);
if (typeof performance === 'undefined') globalThis.performance = { now: () => preciseTime() * 1000 };
const [kind, file, samples, warmups, calls, dir] = argv;
let e;
if (kind === 'js') { load(file); e = globalThis; }
else if (kind === 'prelude') { globalThis.PORT_DIR = dir; load(file); e = globalThis; }
else e = new WebAssembly.Instance(new WebAssembly.Module(readbuffer(file)), { env: { abort() { throw new Error('abort'); } } }).exports;
function measure(run) {
  const result = String(run());
  for (let i = 0; i < +warmups; i++) run();
  const times = [];
  for (let i = 0; i < +samples; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  const m = times.length >> 1;
  return { result, median: times.length % 2 ? times[m] : (times[m - 1] + times[m]) / 2, best: times[0] };
}
Promise.resolve(globalThis.PORT_READY).then(() =>
  print('RESULT ' + JSON.stringify(JSON.parse(calls).map(call => measure(new Function('e', 'return () => e.' + call)(e))))));
`;

const JSC = process.env.JSC_BIN ?? path.join(ROOT, '.tmp', 'jsc', 'out', 'Release', 'jsc');
const ENGINES = {
  v8: { name: 'V8', command: D8, args: script => [script, '--'], version: () => spawnSync(D8, ['-e', 'print(version())'], { encoding: 'utf8' }).stdout.trim() },
  sm: { name: 'SpiderMonkey', command: process.env.SM_BIN ?? path.join(process.env.HOME, '.jsvu', 'bin', 'sm'), args: script => [script], version: () => spawnSync(ENGINES.sm.command, ['--version'], { encoding: 'utf8' }).stdout.trim() },
  jsc: { name: 'JavaScriptCore', command: JSC, args: script => [script, '--'], env: { DYLD_FRAMEWORK_PATH: path.dirname(JSC) }, version: () => path.dirname(JSC) },
};
const engines = (process.argv.find(arg => arg.startsWith('--engines='))?.slice(10) ?? 'v8').split(',').map(key => {
  if (!ENGINES[key]) throw new Error(`no engine ${key}: ${Object.keys(ENGINES).join(', ')}`);
  return { key, ...ENGINES[key] };
});
const version = spawnSync(D8, ['-e', 'print(version())'], { encoding: 'utf8' });
if (version.error || version.status !== 0) throw new Error('d8 unavailable: put d8 on PATH or set D8_BIN');
const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const json = process.argv.find(arg => arg.startsWith('--json='))?.slice(7);
const names = args.length ? args : Object.keys(PROGRAMS);
for (const name of names) if (!PROGRAMS[name]) throw new Error(`no program ${name}: ${Object.keys(PROGRAMS).join(', ')}`);
const median = values => { const s = [...values].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
await fs.mkdir(TMP, { recursive: true });
const driver = path.join(TMP, 'd8-driver.js');
await fs.writeFile(driver, DRIVER);
const utu = await loadNodeCompiler();
const recorded = { d8: version.stdout.trim(), engines: Object.fromEntries(engines.map(engine => [engine.key, `${engine.name} ${engine.version()}`])), programs: {} };

console.log(`d8 ${recorded.d8}: ${SAMPLES} samples after ${WARMUPS} warmups; median (best)`);
for (const name of names) {
  const program = PROGRAMS[name];
  const dir = path.join(ROOT, 'benchmarks', name);
  const has = sub => existsSync(path.join(dir, sub));
  const utuPorts = name === 'deltablue'
    ? [['-O3', 'speed', false], ['-O3 --safe', 'speed', true], ['-Oz', 'size', false], ['-Oz --safe', 'size', true]]
    : [['-O3', 'speed', false], ['-Oz', 'size', false]];
  const ports = [];
  for (const [label, optimize, safe] of utuPorts) ports.push({ port: `utu ${label}`, kind: 'utu', ...await compileUtu(path.join(dir, `${name}.utu`), optimize, safe), js: utuLoader(dir, name, optimize, safe) });
  ports.push({ port: name === 'deltablue' ? 'Rc Rust' : 'safe Rust', kind: 'wasm', ...buildRust(dir, 'rust', `rust_${name}`), js: await plainLoader(name, '{}') });
  ports.push({ port: 'unsafe Rust', kind: 'wasm', ...buildRust(dir, 'rust-unsafe', program.unsafeCrate ?? `rust_${name}_unsafe`), js: await plainLoader(name, '{}') });
  ports.push({ port: 'JavaScript', kind: 'js', ...await loadJavaScript(path.join(dir, `${name}.js`)) });
  if (has('dart')) ports.push({ port: 'Dart', kind: 'prelude', ...buildDart(dir, name) });
  if (has('kotlin')) ports.push({ port: 'Kotlin', kind: 'prelude', ...buildKotlin(dir, name) });
  if (has('moonbit')) ports.push({ port: 'MoonBit', kind: 'prelude', ...buildMoonBit(dir, name), js: await plainLoader(name, '{}') });
  if (has('assemblyscript')) ports.push({ port: 'AssemblyScript', kind: 'wasm', ...buildAssemblyScript(dir, name), js: await plainLoader(name, '{ env: { abort() { throw new Error("abort"); } } }') });
  if (has('go')) ports.push({ port: 'Go', kind: 'prelude', ...buildGo(dir, name) });
  if (has('swift')) ports.push({ port: 'Swift', kind: 'prelude', ...buildSwift(dir, name) });
  if (has('haskell')) ports.push({ port: 'Haskell', kind: 'prelude', ...buildHaskell(dir, name) });

  // Each JavaScript file minified on its own (Kotlin's are three modules).
  for (const p of ports) p.js = await Promise.all([].concat(await p.js ?? []).map(minify));
  for (const p of ports) {
    p.jsSize = p.js.reduce((sum, file) => sum + file.length, 0);
    p.size = p.bytes.length + p.jsSize;
    p.gzip = [p.bytes, ...p.js].reduce((sum, file) => sum + gzipSync(file).length, 0);
  }
  console.log(`\n${name}: ${ports.map(p => `${p.port} ${formatBytes(p.size)} (${formatBytes(p.gzip)} gzip; JS ${formatBytes(p.jsSize)})`).join(', ')}`);
  for (const [i, p] of ports.entries()) {
    const calls = program.workloads.map(w => ((p.kind === 'utu' ? w.utu : p.kind === 'js' ? w.js : p.kind === 'prelude' ? w.prelude : w.wasm) ?? 'bench(N)').replace('N', w.n));
    let run;
    if (p.kind === 'prelude') run = ['prelude', path.join(p.preludeDir, 'd8-prelude.js'), SAMPLES, WARMUPS, JSON.stringify(calls), p.outDir];
    else {
      const file = path.join(TMP, `${name}-${i}.${p.script ? 'js' : 'wasm'}`);
      await fs.writeFile(file, p.script ?? p.bytes);
      run = [p.script ? 'js' : 'wasm', file, SAMPLES, WARMUPS, JSON.stringify(calls)];
    }
    p.byEngine = {};
    for (const engine of engines) {
      const result = spawnSync(engine.command, [...engine.args(driver), ...run], { encoding: 'utf8', timeout: 600000, env: { ...process.env, ...engine.env } });
      const line = result.stdout?.split('\n').find(text => text.startsWith('RESULT '));
      if (result.status !== 0 || !line) {
        if (engine === engines[0]) throw new Error(`${name}, ${p.port} in ${engine.name} failed:\n${result.stdout}\n${result.stderr}`);
        p.byEngine[engine.key] = { error: (result.stderr || result.stdout || String(result.error)).trim().split('\n').slice(0, 3).join(' ') };
        continue;
      }
      p.byEngine[engine.key] = { results: JSON.parse(line.slice(7)) };
    }
    p.results = p.byEngine[engines[0].key].results;
  }
  const reference = ports.find(p => p.port.endsWith('Rust'));
  for (const engine of engines.slice(1)) {
    for (const p of ports) {
      const got = p.byEngine[engine.key];
      if (got.results?.some((r, i) => r.result !== reference.results[i].result)) got.error = `wrong result: ${got.results.map(r => r.result).join(', ')}`;
      console.log(`  ${engine.name}, ${p.port}: ${got.error ?? got.results.map(r => formatMs(r.median)).join(', ')}`);
    }
  }
  program.workloads.forEach((w, i) => {
    const expected = reference.results[i].result;
    if (ports.some(p => p.results[i].result !== expected)) {
      throw new Error(`${name} ${w.name}: results differ, ${ports.map(p => `${p.port}=${p.results[i].result}`).join(', ')}`);
    }
    console.log(`  ${w.name} (×${w.n}, result ${expected}):`);
    for (const p of ports) console.log(`    ${`${p.port}:`.padEnd(18)}${formatMs(p.results[i].median)} (${formatMs(p.results[i].best)})`);
  });
  recorded.programs[name] = {
    workloads: program.workloads.map((w, i) => ({ name: w.name, n: w.n, result: reference.results[i].result })),
    ports: ports.map(p => ({ name: p.port, times: p.results.map(r => r.median), engines: Object.fromEntries(Object.entries(p.byEngine).map(([key, got]) => [key, got.error ? { error: got.error } : { times: got.results.map(r => r.median) }])), compile: p.compile ?? null, wasm: p.script ? 0 : p.bytes.length, js: p.script ? p.bytes.length : p.jsSize, bytes: p.size, gzip: p.gzip })),
  };
}
if (json) await fs.writeFile(json, JSON.stringify(recorded, null, 1));
console.log(`\nartifacts: ${path.relative(ROOT, TMP)}/`);

// utu as `utu build` makes it: the self-hosted compiler.
async function compileUtu(file, optimize, safe) {
  let built;
  const times = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    built = await compileFile(utu, file, { optimize, safe });
    if (i >= 5) times.push(performance.now() - start);
  }
  const { wasm, spec, diagnostics } = built;
  if (!wasm) throw new Error(`${file}: ${diagnostics.map(d => d.message).join('; ')}`);
  if (Object.keys(spec ?? {}).length) throw new Error(`${file}: a benchmark module must import nothing from its host`);
  return { bytes: wasm, compile: median(times) };
}

// The loader `utu build` writes for the program (already minified).
function utuLoader(dir, name, optimize, safe) {
  const out = path.join(TMP, `${name}-utu-${optimize}${safe ? '-safe' : ''}`);
  const result = spawnSync(process.execPath, [
    path.join(ROOT, 'cli', 'utu.mjs'), 'build', path.join(dir, `${name}.utu`), optimize === 'speed' ? '-O3' : '-Oz', ...(safe ? ['--safe'] : []), '-o', out,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`utu build ${name}: ${result.stderr}`);
  return readFileSync(path.join(out, `${name}.mjs`));
}

// A loader like utu's for a module that needs only `imports`: read or fetch
// the module beside it, instantiate it, and export its exports.
function plainLoader(name, imports) {
  const url = `new URL(${JSON.stringify(`./${name}.wasm`)}, import.meta.url)`;
  return new TextEncoder().encode(`const bytes = await (typeof process === 'object' && process.versions?.node ? import('node:fs/promises').then(fs => fs.readFile(${url})) : fetch(${url}).then(r => r.arrayBuffer()));
export const instance = (await WebAssembly.instantiate(bytes, ${imports})).instance;
export const exports = instance.exports;
`);
}

async function minify(bytes) {
  const { code } = await transform(Buffer.from(bytes).toString('utf8'), { minify: true, format: 'esm', target: 'es2022', legalComments: 'none' });
  return new TextEncoder().encode(code);
}

// The module as a d8 script (its exports as globals); payload is its minified size.
async function loadJavaScript(file) {
  const source = await fs.readFile(file, 'utf8');
  const minified = await transform(source, { minify: true, format: 'esm', target: 'es2022' });
  return { script: source.replace(/^export /gm, ''), bytes: new TextEncoder().encode(minified.code), compile: null, js: [] };
}

/** The median of 3 runs of `build`, each after `clean`. */
function timedBuilds(what, clean, build) {
  const times = [];
  for (let i = 0; i < 3; i++) {
    clean();
    const start = performance.now();
    const result = build();
    times.push(performance.now() - start);
    if (result.error || result.status !== 0) throw new Error(`${what}: build failed:\n${result.error ?? ''}${result.stderr || result.stdout}`);
  }
  return median(times);
}

function rm(...paths) { return () => spawnSync('rm', ['-rf', ...paths]); }

function buildRust(dir, directory, artifact) {
  const rustc = spawnSync('rustup', ['which', '--toolchain', 'stable', 'rustc'], { encoding: 'utf8' });
  if (rustc.status !== 0) throw new Error('rustup stable is required for the Rust ports');
  const targetDir = path.join(TMP, `${path.basename(dir)}-${directory}-target`);
  const compile = timedBuilds(`${dir}/${directory}`, rm(targetDir), () => spawnSync('cargo', [
    'build', '--release', '--lib', '--target', 'wasm32-unknown-unknown',
    '--manifest-path', path.join(dir, directory, 'Cargo.toml'), '--target-dir', targetDir,
  ], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RUSTC: rustc.stdout.trim() } }));
  return { bytes: readFileSync(path.join(targetDir, 'wasm32-unknown-unknown', 'release', `${artifact}.wasm`)), compile };
}

// What ships: the module and dart2wasm's JavaScript runtime for it.
function buildDart(dir, name) {
  const out = path.join(TMP, `${name}-dart`);
  const compile = timedBuilds(`${name}/dart`, rm(out), () => spawnSync('dart', [
    'compile', 'wasm', '-O2', '--no-source-maps', '-o', path.join(out, `${name}.wasm`), path.join(dir, 'dart', `${name}.dart`),
  ], { encoding: 'utf8' }));
  return { bytes: readFileSync(path.join(out, `${name}.wasm`)), js: readFileSync(path.join(out, `${name}.mjs`)), compile, outDir: out, preludeDir: path.join(dir, 'dart') };
}

// What ships: the module and the three JavaScript modules the build writes for it.
function buildKotlin(dir, name) {
  const work = path.join(TMP, `${name}-kotlin`);
  const env = { ...process.env, JAVA_HOME };
  const compile = timedBuilds(`${name}/kotlin`, rm(work), () => spawnSync('gradle', [
    '-q', '--project-cache-dir', path.join(work, 'gradle-cache'), `-PoutDir=${path.join(work, 'build')}`,
    `-Pkotlin.project.persistent.dir=${path.join(work, 'kotlin-data')}`, 'compileProductionExecutableKotlinWasmJsOptimize',
  ], { cwd: path.join(dir, 'kotlin'), encoding: 'utf8', env }));
  const out = path.join(work, 'build', 'compileSync', 'wasmJs', 'main', 'productionExecutable', 'optimized');
  const scripts = readdirSync(out).filter(file => file.endsWith('.mjs'));
  return { bytes: readFileSync(path.join(out, `${name}.wasm`)), js: scripts.map(file => readFileSync(path.join(out, file))), compile, outDir: out, preludeDir: path.join(dir, 'kotlin') };
}

function buildMoonBit(dir, name) {
  const out = path.join(TMP, `${name}-moonbit`);
  const moon = path.join(process.env.HOME, '.moon', 'bin', 'moon');
  const compile = timedBuilds(`${name}/moonbit`, rm(out), () => spawnSync(moon, [
    'build', '--target', 'wasm-gc', '--release', '--target-dir', out,
  ], { cwd: path.join(dir, 'moonbit'), encoding: 'utf8' }));
  const built = path.join(out, 'wasm-gc', 'release', 'build');
  return { bytes: readFileSync(path.join(built, `${name}.wasm`)), compile, outDir: built, preludeDir: path.join(dir, 'moonbit') };
}

// The incremental runtime: the default, and the one that collects by itself.
function buildAssemblyScript(dir, name) {
  const out = path.join(TMP, `${name}-assemblyscript.wasm`);
  spawnSync('npx', ['--yes', '-p', ASC, 'asc', '--version'], { encoding: 'utf8' });
  const compile = timedBuilds(`${name}/assemblyscript`, rm(out), () => spawnSync('npx', [
    '--yes', '-p', ASC, 'asc', path.join(dir, 'assemblyscript', `${name}.ts`), '-O3', '--runtime', 'incremental', '-o', out,
  ], { encoding: 'utf8' }));
  return { bytes: readFileSync(out), compile };
}

// GOOS=wasip1, a reactor; a fresh build cache each time, so the runtime builds too.
function buildGo(dir, name) {
  const out = path.join(TMP, `${name}-go`);
  const cache = path.join(TMP, `${name}-go-cache`);
  const compile = timedBuilds(`${name}/go`, rm(out, cache), () => spawnSync('go', [
    'build', '-buildmode=c-shared', '-trimpath', '-ldflags=-s -w', '-o', path.join(out, `${name}.wasm`), '.',
  ], { cwd: path.join(dir, 'go'), encoding: 'utf8', env: { ...process.env, GOOS: 'wasip1', GOARCH: 'wasm', GOCACHE: cache } }));
  return { bytes: readFileSync(path.join(out, `${name}.wasm`)), js: readFileSync(path.join(dir, 'go', 'd8-prelude.js')), compile, outDir: out, preludeDir: path.join(dir, 'go') };
}

// The full Swift SDK for WebAssembly (wasm32-unknown-wasi), release.
function buildSwift(dir, name) {
  const scratch = path.join(TMP, `${name}-swift`);
  const env = { ...process.env, PATH: `${path.join(process.env.HOME, '.swiftly', 'bin')}${path.delimiter}${process.env.PATH}` };
  const compile = timedBuilds(`${name}/swift`, rm(scratch), () => spawnSync('swift', [
    'build', '-c', 'release', '--swift-sdk', 'swift-6.4.1-RELEASE_wasm', '-Xlinker', '--strip-all', '--scratch-path', scratch,
  ], { cwd: path.join(dir, 'swift'), encoding: 'utf8', env }));
  const found = spawnSync('find', [scratch, '-name', '*.wasm', '-path', '*Release*'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(f => !f.includes('.build/'))[0];
  if (!found) throw new Error(`${name}/swift: no module built`);
  return { bytes: readFileSync(found), js: readFileSync(path.join(dir, 'swift', 'd8-prelude.js')), compile, outDir: path.dirname(found), preludeDir: path.join(dir, 'swift') };
}

// GHC's WebAssembly backend: a reactor exporting hs_init and the bench functions.
function buildHaskell(dir, name) {
  const out = path.join(TMP, `${name}-haskell`);
  const source = readdirSync(path.join(dir, 'haskell')).find(file => file.endsWith('.hs'));
  const exports = PROGRAMS[name].workloads.map(w => (w.wasm ?? 'bench(N)').replace(/\(.*/, ''));
  const command = [
    'source ~/.ghc-wasm/env &&', 'mkdir -p', JSON.stringify(out), '&&', 'wasm32-wasi-ghc -O2', JSON.stringify(path.join(dir, 'haskell', source)),
    '-outputdir', JSON.stringify(path.join(out, 'obj')), '-o', JSON.stringify(path.join(out, `${name}.wasm`)),
    '-no-hs-main -optl-mexec-model=reactor', `-optl-Wl,--export=hs_init,${exports.map(e => `--export=${e}`).join(',')}`, '-optl-Wl,--strip-all',
  ].join(' ');
  const compile = timedBuilds(`${name}/haskell`, rm(out), () => spawnSync('bash', ['-c', command], { encoding: 'utf8' }));
  return { bytes: readFileSync(path.join(out, `${name}.wasm`)), js: readFileSync(path.join(dir, 'haskell', 'd8-prelude.js')), compile, outDir: out, preludeDir: path.join(dir, 'haskell') };
}

function formatMs(value) { return `${value.toFixed(2)} ms`; }
function formatBytes(value) { return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KiB`; }
