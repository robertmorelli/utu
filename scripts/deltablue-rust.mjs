import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as compiler from '../index.js';
import { getRepoRoot } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const cacheDir = path.join(tmpdir(), 'utu-deltablue-bench-cache');
const MAX_BENCH_ITERATIONS = 0x7fffffff;
const CASE_TO_EXPORT = { chain: 'bench_chain', projection: 'bench_projection' };
const IMPLS = {
  utu: ['utu', runUtuCase],
  rust: ['rust_wasm', runRustWasmCase],
  native: ['rust_native', runNativeCase],
  rust_arena: ['rust_arena_wasm', runRustWasmCase],
  native_arena: ['rust_arena_native', runNativeCase],
};
const [command = 'compare', ...args] = process.argv.slice(2);

if (command === 'prepare') console.log(await prepareCache());
else if (command === 'run') await IMPLS[args[0]][1](IMPLS[args[0]][0], args[1], int(args[2], 50));
else if (command === 'report') console.log(await generateReport(args));
else if (command === 'compare') await compareBenchmarks(Number.parseFloat(args[0] ?? '1'));
else throw new Error(`Unknown command: ${command}`);

async function generateReport(args) {
  const options = parseReportArgs(args);
  const reportPath = path.join(repoRoot, 'examples/rust_benchmarks/utu_v_rust.md');
  const preparedCacheDir = await prepareCache();
  const sizes = JSON.parse(await readFile(path.join(preparedCacheDir, 'sizes.json'), 'utf8'));
  const [chain, projection] = await Promise.all(['chain', 'projection'].map((name) => runHyperfine(name, options, preparedCacheDir)));
  await writeFile(reportPath, renderMarkdown({ generatedAt: new Date().toISOString(), options, sizes, chain, projection, cacheDir: preparedCacheDir }), 'utf8');
  return reportPath;
}

async function compareBenchmarks(targetSeconds) {
  const targetNs = Math.floor(targetSeconds * 1e9);
  const cases = (await Promise.all([loadUtuBenchmarkCases(), loadRustBenchmarkCases()])).flat();
  try {
    const metricsEntries = await Promise.all(cases.map(async (benchmark) => [benchmark.name, await benchmarkCase(benchmark.bench, targetNs)]));
    const orderedBySpeed = [...metricsEntries].sort((left, right) => right[1].meanRate - left[1].meanRate).map(([name]) => name);
    console.log(JSON.stringify({
      targetSeconds,
      checks: Object.fromEntries(await Promise.all(cases.map(async (benchmark) => [benchmark.name, Number(await benchmark.check())]))),
      wasmBytes: Object.fromEntries(cases.map((benchmark) => [benchmark.name, benchmark.wasmBytes])),
      rates: Object.fromEntries(metricsEntries.map(([name, metrics]) => [name, summarizeMetrics(metrics)])),
      fastest: orderedBySpeed[0] ?? null,
      speedOrder: orderedBySpeed,
    }, null, 2));
  } finally {
    await Promise.all(cases.map((benchmark) => benchmark.cleanup()));
  }
}

async function prepareCache() {
  await rm(cacheDir, { recursive: true, force: true });
  await Promise.all(['utu', 'rust_wasm', 'rust_native', 'rust_arena_wasm', 'rust_arena_native'].map((dir) => mkdir(path.join(cacheDir, dir), { recursive: true })));
  const [utu, rust, rustArena] = await Promise.all([
    prepareUtuBundle(),
    prepareRustVariant('examples/rust_benchmarks/rust_deltablue/Cargo.toml', 'rust_deltablue', 'rust_wasm', 'rust_native'),
    prepareRustVariant('examples/rust_benchmarks/rust_deltablue_arena/Cargo.toml', 'rust_deltablue_arena', 'rust_arena_wasm', 'rust_arena_native'),
  ]);
  await writeFile(path.join(cacheDir, 'sizes.json'), JSON.stringify({
    utu,
    rust_wasm: rust.wasm,
    rust_native: rust.native,
    rust_arena_wasm: rustArena.wasm,
    rust_arena_native: rustArena.native,
  }, null, 2), 'utf8');
  return cacheDir;
}

async function prepareUtuBundle() {
  const source = await readFile(path.join(repoRoot, 'examples/deltablue.utu'), 'utf8');
  await compiler.init();
  const { js, metadata, wasm } = await compiler.compile(source, { mode: 'bench' });
  const metadataText = JSON.stringify({ benches: metadata.benches }, null, 2);
  const moduleBytes = Buffer.byteLength(js, 'utf8');
  await Promise.all([
    writeFile(path.join(cacheDir, 'utu', 'module.mjs'), js, 'utf8'),
    writeFile(path.join(cacheDir, 'utu', 'metadata.json'), metadataText, 'utf8'),
    writeFile(path.join(cacheDir, 'utu', 'utu.wasm'), wasm),
  ]);
  return {
    source_artifact: 'examples/deltablue.utu',
    source_bytes: Buffer.byteLength(source, 'utf8'),
    bundle_artifact: 'module.mjs + utu.wasm',
    bundle_bytes: moduleBytes + wasm.length,
    wasm_bytes: wasm.length,
    module_bytes: moduleBytes,
    metadata_bytes: Buffer.byteLength(metadataText, 'utf8'),
  };
}

async function prepareRustVariant(manifestRelPath, artifactName, wasmKey, nativeKey) {
  const manifestPath = path.join(repoRoot, manifestRelPath);
  const rustcPath = resolveRustcPath();
  const cargoPath = path.join(path.dirname(rustcPath), 'cargo');
  const wasmDir = path.join(cacheDir, wasmKey);
  const nativeDir = path.join(cacheDir, nativeKey);
  const wasmBuildDir = path.join(wasmDir, 'target');
  const nativeBuildDir = path.join(nativeDir, 'target');
  run([cargoPath, 'build', '--release', '--target', 'wasm32-unknown-unknown', '--manifest-path', manifestPath, '--target-dir', wasmBuildDir], { env: rustEnv(rustcPath) }, 'cargo build failed');
  run([cargoPath, 'build', '--release', '--manifest-path', manifestPath, '--target-dir', nativeBuildDir], { env: rustEnv(rustcPath, '-C target-cpu=native') }, 'cargo build failed');
  run([wasmOptPath(), '-O4', path.join(wasmBuildDir, 'wasm32-unknown-unknown', 'release', `${artifactName}.wasm`), '-o', path.join(wasmDir, 'module.wasm')], {}, 'wasm-opt failed');

  const nativePath = path.join(nativeBuildDir, 'release', artifactName);
  const [wasm, native, source_bytes] = await Promise.all([
    readFile(path.join(wasmDir, 'module.wasm')),
    readFile(nativePath),
    sumFileBytes([path.join(path.dirname(manifestPath), 'src', 'lib.rs'), path.join(path.dirname(manifestPath), 'src', 'main.rs')]),
  ]);
  await copyFile(nativePath, path.join(nativeDir, 'runner'));
  await chmod(path.join(nativeDir, 'runner'), 0o755);
  return {
    wasm: { source_artifact: 'src/lib.rs + src/main.rs', source_bytes, bundle_artifact: `${artifactName}.wasm`, bundle_bytes: wasm.length, wasm_bytes: wasm.length },
    native: { source_artifact: 'src/lib.rs + src/main.rs', source_bytes, bundle_artifact: `release/${artifactName}`, bundle_bytes: native.length, binary_bytes: native.length },
  };
}

async function runUtuCase(_, benchCase, iterations) {
  const metadata = JSON.parse(await readFile(path.join(cacheDir, 'utu', 'metadata.json'), 'utf8'));
  const mod = await import(pathToFileURL(path.join(cacheDir, 'utu', 'module.mjs')).href);
  const exports = await mod.instantiate();
  exports[metadata.benches.find((bench) => bench.name === `deltablue_${benchCase}`).exportName](iterations);
}

async function runRustWasmCase(dirName, benchCase, iterations) {
  const { instance } = await WebAssembly.instantiate(await readFile(path.join(cacheDir, dirName, 'module.wasm')), {});
  instance.exports[CASE_TO_EXPORT[benchCase]](iterations);
}

function runNativeCase(dirName, benchCase, iterations) {
  run([path.join(cacheDir, dirName, 'runner'), benchCase, String(iterations)], {}, 'native runner failed');
}

async function loadUtuBenchmarkCases() {
  const dir = await mkdtemp(path.join(tmpdir(), 'utu-rust-compare-utu-'));
  const source = await readFile(path.join(repoRoot, 'examples/deltablue.utu'), 'utf8');
  await compiler.init();
  const { js, metadata, wasm } = await compiler.compile(source, { mode: 'bench' });
  await writeFile(path.join(dir, 'module.mjs'), js, 'utf8');
  const mod = await import(pathToFileURL(path.join(dir, 'module.mjs')).href);
  const exports = await mod.instantiate();
  return metadata.benches.map((bench) => ({
    name: `utu_${bench.name.replace(/^deltablue_/, '')}`,
    wasmBytes: wasm.length,
    bench: (iterations) => exports[bench.exportName](iterations),
    check: () => Number(exports.main()),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  }));
}

async function loadRustBenchmarkCases() {
  const dir = await mkdtemp(path.join(tmpdir(), 'utu-rust-compare-rust-'));
  const rustcPath = resolveRustcPath();
  run([path.join(path.dirname(rustcPath), 'cargo'), 'build', '--release', '--target', 'wasm32-unknown-unknown', '--manifest-path', path.join(repoRoot, 'examples/rust_benchmarks/rust_deltablue/Cargo.toml'), '--target-dir', dir], { env: rustEnv(rustcPath) }, 'cargo build failed');
  const rawWasmPath = path.join(dir, 'wasm32-unknown-unknown', 'release', 'rust_deltablue.wasm');
  const cases = await Promise.all(['chain', 'projection'].map((name) => instantiateRustCase(`rust_${name}`, CASE_TO_EXPORT[name], rawWasmPath, dir)));
  const optimizedWasmPath = path.join(dir, 'rust_deltablue.opt.wasm');
  const opt = findTool('wasm-opt');
  if (!opt) return cases;
  run([opt, '-O4', rawWasmPath, '-o', optimizedWasmPath], {}, 'wasm-opt failed');
  return cases.concat(await Promise.all(['chain', 'projection'].map((name) => instantiateRustCase(`rust_wasm_opt_${name}`, CASE_TO_EXPORT[name], optimizedWasmPath, dir))));
}

async function instantiateRustCase(name, exportName, wasmPath, dir) {
  const { instance } = await WebAssembly.instantiate(await readFile(wasmPath), {});
  return {
    name,
    wasmBytes: (await readFile(wasmPath)).length,
    bench: (iterations) => instance.exports[exportName](iterations),
    check: () => instance.exports.run_check(),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

async function runHyperfine(caseName, options, preparedCacheDir) {
  const jsonDir = await mkdtemp(path.join(tmpdir(), `utu-v-rust-${caseName}-`));
  const jsonPath = path.join(jsonDir, `${caseName}.json`);
  const names = ['utu_wasm', 'rc_rust_wasm', 'rc_rust_native', 'unsafe_rust_wasm', 'unsafe_rust_native'];
  run([
    'hyperfine',
    '--warmup', String(options.warmup),
    '--min-runs', String(options.minRuns),
    '--export-json', jsonPath,
    ...names.flatMap((name) => ['--command-name', name]),
    `bun scripts/deltablue-rust.mjs run utu ${caseName} ${options.iterations}`,
    `bun scripts/deltablue-rust.mjs run rust ${caseName} ${options.iterations}`,
    `${path.join(preparedCacheDir, 'rust_native', 'runner')} ${caseName} ${options.iterations}`,
    `bun scripts/deltablue-rust.mjs run rust_arena ${caseName} ${options.iterations}`,
    `${path.join(preparedCacheDir, 'rust_arena_native', 'runner')} ${caseName} ${options.iterations}`,
  ], {}, `hyperfine failed for ${caseName}`);
  const data = JSON.parse(await readFile(jsonPath, 'utf8'));
  await rm(jsonDir, { recursive: true, force: true });
  return data.results.map((result, index) => ({ name: names[index], command: result.command, mean: result.mean, stddev: result.stddev, min: result.min, max: result.max, median: result.median, runs: result.times.length }));
}

function parseReportArgs(args) {
  const options = { warmup: 10, minRuns: 10, iterations: 20 };
  for (let i = 0; i < args.length; i += 1) options[args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = int(args[i + 1], options.iterations);
  return options;
}

async function benchmarkCase(bench, targetNs) {
  let estimate = await calibrateIterations(bench, targetNs, 1);
  const samples = [];
  for (let i = 0; i < 3; i += 1) {
    const iterations = clampIterations(estimate);
    const elapsedNs = await timeInvocation(() => bench(iterations));
    samples.push({ iterations, elapsedNs, rate: rate(iterations, elapsedNs) });
    estimate = projectIterations(iterations, elapsedNs, targetNs);
  }
  return {
    samples,
    meanRate: samples.reduce((sum, sample) => sum + sample.rate, 0) / samples.length,
    meanNsPerIter: samples.reduce((sum, sample) => sum + sample.elapsedNs, 0) / samples.reduce((sum, sample) => sum + sample.iterations, 0),
  };
}

async function timeInvocation(runFn) {
  const start = process.hrtime.bigint();
  await runFn();
  return Number(process.hrtime.bigint() - start);
}

async function calibrateIterations(bench, targetNs, iterations) {
  let elapsedNs = await timeInvocation(() => bench(iterations));
  while (elapsedNs < targetNs / 10 && iterations < MAX_BENCH_ITERATIONS) {
    const next = clampIterations(iterations * (elapsedNs <= 0 ? 10 : Math.max(2, Math.ceil((targetNs / 10) / elapsedNs))));
    if (next === iterations) break;
    iterations = next;
    elapsedNs = await timeInvocation(() => bench(iterations));
  }
  return projectIterations(iterations, elapsedNs, targetNs);
}

function projectIterations(iterations, elapsedNs, targetNs) {
  return clampIterations(elapsedNs <= 0 ? iterations * 10 : Math.round(iterations * (targetNs / elapsedNs)));
}

function clampIterations(value) {
  return Math.max(1, Math.min(MAX_BENCH_ITERATIONS, Math.round(value || 1)));
}

function rate(iterations, elapsedNs) {
  return elapsedNs <= 0 ? 0 : iterations / (elapsedNs / 1e9);
}

function summarizeMetrics(metrics) {
  return {
    meanIterPerSecond: round(metrics.meanRate),
    minIterPerSecond: round(Math.min(...metrics.samples.map((sample) => sample.rate))),
    maxIterPerSecond: round(Math.max(...metrics.samples.map((sample) => sample.rate))),
    nsPerIter: round(metrics.meanNsPerIter),
    samples: metrics.samples.map((sample) => ({ iterations: sample.iterations, elapsedNs: sample.elapsedNs, iterPerSecond: round(sample.rate) })),
  };
}

function renderMarkdown({ generatedAt, options, sizes, chain, projection, cacheDir }) {
  const rows = [
    ['Utu bundle', sizes.utu.source_bytes, sizes.utu.bundle_bytes],
    ['Rust wasm', sizes.rust_wasm.source_bytes, sizes.rust_wasm.bundle_bytes],
    ['Rust native', sizes.rust_native.source_bytes, sizes.rust_native.bundle_bytes],
    ['Unsafe Rust wasm', sizes.rust_arena_wasm.source_bytes, sizes.rust_arena_wasm.bundle_bytes],
    ['Unsafe Rust native', sizes.rust_arena_native.source_bytes, sizes.rust_arena_native.bundle_bytes],
  ];
  const smallest = Math.min(...rows.map((row) => row[1]));
  return [
    '# Utu vs Rust DeltaBlue',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Benchmark Setup',
    '',
    `- Warmup runs: ${options.warmup}`,
    `- Minimum timed runs: ${options.minRuns}`,
    `- Iterations per command: ${options.iterations}`,
    `- Prepared cache: \`${cacheDir}\``,
    '',
    '## Source vs Bundle Sizes',
    '',
    markdownTable(['Variant', 'Source (bytes)', 'Source rel. smallest', 'Bundle (bytes)', 'Bundle / Source'], rows.map(([name, sourceBytes, bundleBytes]) => [name, sourceBytes, `${round(sourceBytes / smallest)}x`, bundleBytes, `${round(bundleBytes / sourceBytes)}x`])),
    '',
    'Source size counts only the benchmark language files. Utu bundle size combines the generated `module.mjs` and `utu.wasm` outputs.',
    '',
    '## Chain Benchmark',
    '',
    benchmarkTable(chain),
    '',
    '## Projection Benchmark',
    '',
    benchmarkTable(projection),
    '',
  ].join('\n');
}

function benchmarkTable(results) {
  const fastest = Math.min(...results.map((result) => result.mean));
  return markdownTable(
    ['Variant', 'Mean (ms)', 'Stddev (ms)', 'Min (ms)', 'Max (ms)', 'Relative', 'Runs'],
    [...results].sort((left, right) => left.mean - right.mean).map((result) => [result.name, ms(result.mean), ms(result.stddev), ms(result.min), ms(result.max), `${round(result.mean / fastest)}x`, result.runs]),
  );
}

function markdownTable(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `| ${headers.map((_, i) => i ? '---:' : '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

function rustEnv(rustcPath, rustflags) {
  return { ...process.env, CARGO_TERM_COLOR: 'never', RUSTC: rustcPath, ...(rustflags ? { RUSTFLAGS: joinFlags(process.env.RUSTFLAGS, rustflags) } : {}) };
}

function resolveRustcPath() {
  return run(['rustup', 'which', 'rustc'], {}, 'rustup which rustc failed').stdout.toString().trim();
}

function wasmOptPath() {
  return path.join(repoRoot, 'node_modules', 'binaryen', 'bin', 'wasm-opt');
}

function findTool(command) {
  const result = Bun.spawnSync(['which', command], { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' });
  return result.exitCode === 0 ? result.stdout.toString().trim() : null;
}

function run(args, options, label) {
  const result = Bun.spawnSync(args, { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe', ...options });
  if (result.exitCode !== 0) throw new Error(`${label}\n${result.stdout.toString()}\n${result.stderr.toString()}`);
  return result;
}

function joinFlags(existing, extra) {
  return existing ? `${existing} ${extra}` : extra;
}

async function sumFileBytes(paths) {
  return (await Promise.all(paths.map((file) => readFile(file)))).reduce((sum, file) => sum + file.length, 0);
}

function int(value, fallback) {
  return Number.parseInt(value ?? String(fallback), 10);
}

function ms(seconds) {
  return round(seconds * 1000);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
