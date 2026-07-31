import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform } from 'esbuild';
import binaryen from 'binaryen';
import { createCompiler, emitBinary, initParser, instantiateLowered } from '../src/index.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SUITE = path.join(ROOT, 'benchmarks', 'suite');
const TMP = path.join(ROOT, '.tmp', 'wasm-benchmark-suite');
const SAMPLES = Number(process.env.BENCH_SAMPLES ?? 20);
const WARMUPS = Number(process.env.BENCH_WARMUPS ?? 5);
await fs.mkdir(TMP, { recursive: true });

const parser = await initParser({ wasmDir: `${ROOT}/` });
const compiler = createCompiler({
  parser,
  target: 'normal',
  readFile: file => fs.readFile(file, 'utf8'),
  resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
});

const cases = [
  {
    name: 'scalar recurrence', stem: 'scalar', detail: '1,000,000 dependent integer iterations',
    setup(utu, rust, rustSafe, js) {
      const n = 1_000_000;
      return { utu: () => utu.run(n), rust: () => rust.run(n), rustSafe: () => rustSafe.run(n), js: () => js.run(n) };
    },
  },
  stringCase('middle insert: tiny chunks', 8, 8_192),
  stringCase('middle insert: medium chunks', 32, 2_048),
  stringCase('middle insert: large chunks', 1024, 64),
  {
    name: 'source analyzer', stem: 'analyzer', detail: '256 KiB source-like document; 14 lexical/statistical metrics',
    setup(utu, rust, rustSafe, js) {
      const text = analyzerInput(256 * 1024);
      const encoder = new TextEncoder();
      const utuRun = () => utu.run(text);
      const rustRun = () => {
        const bytes = encoder.encode(text); // boundary conversion and copy are intentionally timed
        new Uint8Array(rust.memory.buffer, rust.input_ptr(), bytes.length).set(bytes);
        return rust.run(bytes.length);
      };
      const rustSafeRun = () => {
        const bytes = encoder.encode(text);
        new Uint8Array(rustSafe.memory.buffer, rustSafe.input_ptr(), bytes.length).set(bytes);
        return rustSafe.run(bytes.length);
      };
      const jsRun = () => js.run(text);
      return { utu: utuRun, rust: rustRun, rustSafe: rustSafeRun, js: jsRun };
    },
  },
  {
    name: 'prime sieve', stem: 'sieve', detail: '100,000 flags; allocation/fill/random writes/reduction',
    setup(utu, rust, rustSafe, js) {
      const n = 100_000;
      return { utu: () => utu.run(n), rust: () => rust.run(n), rustSafe: () => rustSafe.run(n), js: () => js.run(n) };
    },
  },
];

function stringCase(name, pieceLength, repeats) {
  return {
    name, stem: 'strings',
    detail: `${pieceLength.toLocaleString()} ASCII chars inserted ${repeats.toLocaleString()} times at midpoint; 64→128 KiB`,
    setup(utu, rust, rustSafe, js) {
      const base = asciiPiece(65_536);
      const piece = asciiPiece(pieceLength);
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const utuRun = () => checksumString(utu.run(base, piece, repeats));
      const rustRun = () => {
        const baseBytes = encoder.encode(base); // both boundary conversions are intentionally timed
        const pieceBytes = encoder.encode(piece);
        new Uint8Array(rust.memory.buffer, rust.base_ptr(), baseBytes.length).set(baseBytes);
        new Uint8Array(rust.memory.buffer, rust.piece_ptr(), pieceBytes.length).set(pieceBytes);
        const packed = BigInt.asUintN(64, rust.run(baseBytes.length, pieceBytes.length, repeats));
        const outputPtr = Number(packed >> 32n);
        const outputLen = Number(packed & 0xffff_ffffn);
        const output = decoder.decode(new Uint8Array(rust.memory.buffer, outputPtr, outputLen));
        return checksumString(output); // decode and flatten are intentionally timed
      };
      const rustSafeRun = () => {
        const baseBytes = encoder.encode(base);
        const pieceBytes = encoder.encode(piece);
        new Uint8Array(rustSafe.memory.buffer, rustSafe.base_ptr(), baseBytes.length).set(baseBytes);
        new Uint8Array(rustSafe.memory.buffer, rustSafe.piece_ptr(), pieceBytes.length).set(pieceBytes);
        const packed = BigInt.asUintN(64, rustSafe.run(baseBytes.length, pieceBytes.length, repeats));
        const outputPtr = Number(packed >> 32n);
        const outputLen = Number(packed & 0xffff_ffffn);
        return checksumString(decoder.decode(new Uint8Array(rustSafe.memory.buffer, outputPtr, outputLen)));
      };
      const jsRun = () => checksumString(js.run(base, piece, repeats));
      return { utu: utuRun, rust: rustRun, rustSafe: rustSafeRun, js: jsRun };
    },
  };
}

console.log('Rust/utu Wasm benchmark suite (including forbid(unsafe_code) Rust)');
console.log(`  engine: Bun ${Bun.version} (${process.arch})`);
console.log(`  samples: ${SAMPLES}, warmups: ${WARMUPS}`);
console.log('  Rust: rustc stable -O3 + LTO + simd128 + bulk-memory');
console.log('  utu: Binaryen -O3/max-shrink then -Oz; string lowering only when required\n');

const rows = [];
for (const spec of cases) {
  const utuBytes = await compileUtu(spec.stem);
  const rustBytes = compileRust(spec.stem);
  const rustSafeBytes = compileRust(spec.stem, { safe: true });
  const { module: jsModule, bytes: jsBytes } = await loadJavaScript(spec.stem);
  await Promise.all([
    fs.writeFile(path.join(TMP, `${spec.stem}-utu.wasm`), utuBytes),
    fs.writeFile(path.join(TMP, `${spec.stem}-rust.wasm`), rustBytes),
    fs.writeFile(path.join(TMP, `${spec.stem}-rust-safe.wasm`), rustSafeBytes),
  ]);
  const [{ instance: utuInstance }, rustResult, rustSafeResult] = await Promise.all([
    instantiateLowered(utuBytes),
    WebAssembly.instantiate(rustBytes),
    WebAssembly.instantiate(rustSafeBytes),
  ]);
  const runners = spec.setup(utuInstance.exports, rustResult.instance.exports, rustSafeResult.instance.exports, jsModule);
  const expected = runners.rust();
  const actual = runners.utu();
  const rustSafeResultValue = runners.rustSafe();
  const jsResult = runners.js();
  if (actual !== expected || rustSafeResultValue !== expected || jsResult !== expected) {
    throw new Error(`${spec.name}: output mismatch, utu=${actual}, Rust=${expected}, safe Rust=${rustSafeResultValue}, JS=${jsResult}`);
  }
  for (let i = 0; i < WARMUPS; i++) { runners.utu(); runners.rust(); runners.rustSafe(); runners.js(); }
  const utuTimes = [], rustTimes = [], rustSafeTimes = [], jsTimes = [];
  for (let i = 0; i < SAMPLES; i++) {
    const order = i % 4;
    const timed = [
      () => utuTimes.push(time(runners.utu)),
      () => rustTimes.push(time(runners.rust)),
      () => rustSafeTimes.push(time(runners.rustSafe)),
      () => jsTimes.push(time(runners.js)),
    ];
    for (let offset = 0; offset < timed.length; offset++) timed[(order + offset) % timed.length]();
  }
  const row = {
    ...spec, result: actual,
    utuMs: median(utuTimes), rustMs: median(rustTimes), rustSafeMs: median(rustSafeTimes), jsMs: median(jsTimes),
    utuBest: Math.min(...utuTimes), rustBest: Math.min(...rustTimes), rustSafeBest: Math.min(...rustSafeTimes), jsBest: Math.min(...jsTimes),
    utuSize: utuBytes.length, rustSize: rustBytes.length, rustSafeSize: rustSafeBytes.length, jsSize: jsBytes.length,
    utuGzip: gzipSync(utuBytes).length, rustGzip: gzipSync(rustBytes).length,
    rustSafeGzip: gzipSync(rustSafeBytes).length, jsGzip: gzipSync(jsBytes).length,
  };
  rows.push(row);
  printCase(row);
}

console.log('Summary');
console.log('  benchmark                 utu median   Rust median   safe Rust median     JS median');
for (const row of rows) {
  console.log(`  ${row.name.padEnd(25)} ${formatMs(row.utuMs).padStart(10)}   ${formatMs(row.rustMs).padStart(10)}   ${formatMs(row.rustSafeMs).padStart(16)}   ${formatMs(row.jsMs).padStart(10)}`);
}
console.log(`\nArtifacts: ${path.relative(ROOT, TMP)}/`);

async function loadJavaScript(stem) {
  const file = path.join(SUITE, `${stem}.js`);
  const source = await fs.readFile(file, 'utf8');
  const minified = await transform(source, { minify: true, format: 'esm', target: 'es2022' });
  const module = await import(`${pathToFileURL(file).href}?benchmark=${Date.now()}`);
  return { module, bytes: new TextEncoder().encode(minified.code) };
}

async function compileUtu(stem) {
  const file = path.join(SUITE, `${stem}.utu`);
  const doc = await compiler.compileFile(file);
  const errors = [...doc.querySelectorAll('[data-error]')];
  if (errors.length) throw new Error(`${stem}.utu: ${errors.map(node => node.dataset.errorMessage).join('; ')}`);
  return emitBinary(doc);
}

function compileRust(stem, { safe = false } = {}) {
  const suffix = safe ? '-safe' : '';
  const output = path.join(TMP, `${stem}-rust${suffix}.wasm`);
  const args = [
    'run', 'stable', 'rustc', path.join(SUITE, `${stem}${suffix}.rs`),
    '--target', 'wasm32-unknown-unknown', '--crate-type', 'cdylib',
    '-C', 'opt-level=3', '-C', 'lto=fat', '-C', 'codegen-units=1',
    '-C', 'panic=abort', ...(safe ? [] : ['-C', 'strip=symbols']),
    '-C', 'target-feature=+simd128,+bulk-memory', '-o', output,
  ];
  const result = spawnSync('rustup', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') throw new Error('rustup is required for bench:suite');
  if (result.status !== 0) throw new Error(`${stem}${suffix}.rs failed:\n${result.stderr || result.stdout}`);
  const bytes = new Uint8Array(readFileSync(output));
  return safe ? addSafeRustExports(bytes, stem) : bytes;
}

function addSafeRustExports(bytes, stem) {
  const required = stem === 'strings' ? ['base_ptr', 'piece_ptr', 'run']
    : stem === 'analyzer' ? ['input_ptr', 'run'] : ['run'];
  const module = binaryen.readBinary(bytes);
  const names = Array.from({ length: module.getNumFunctions() }, (_, index) =>
    binaryen.getFunctionInfo(module.getFunctionByIndex(index)).name);
  for (const exported of required) {
    const internal = names.find(name => name.includes(`${exported}17h`));
    if (!internal) throw new Error(`${stem}-safe.rs: retained function ${exported} not found`);
    module.addFunctionExport(internal, exported);
  }
  module.runPasses(['strip']);
  const emitted = module.emitBinary();
  module.dispose();
  return emitted;
}

function asciiPiece(length) {
  const seed = 'utu-wasm-rope-0123456789abcdef';
  return seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
}

function checksumString(value) {
  return value.length ^ value.charCodeAt(value.length >> 1) ^ value.charCodeAt(value.length - 1);
}

function analyzerInput(length) {
  const block = `// generated source fixture 104729\nfn transform_item(value_17: I32) I32 {\n  let scaled = value_17 * 31 + 7;\n  if scaled > 4096 { return scaled - 113; }\n  for (0..<12) |index| { scaled = scaled + index; };\n  let message = "utu \\183 parser [fixture]"; /* balanced comment */\n  scaled;\n}\n`;
  return block.repeat(Math.ceil(length / block.length)).slice(0, length);
}

function time(run) {
  const start = Bun.nanoseconds();
  run();
  return (Bun.nanoseconds() - start) / 1e6;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function printCase(row) {
  console.log(row.name);
  console.log(`  workload: ${row.detail}`);
  console.log(`  result: ${row.result}`);
  console.log(`  utu:  ${formatMs(row.utuMs)} median (${formatMs(row.utuBest)} best), ${formatBytes(row.utuSize)} (${formatBytes(row.utuGzip)} gzip)`);
  console.log(`  Rust: ${formatMs(row.rustMs)} median (${formatMs(row.rustBest)} best), ${formatBytes(row.rustSize)} (${formatBytes(row.rustGzip)} gzip)`);
  console.log(`  safe: ${formatMs(row.rustSafeMs)} median (${formatMs(row.rustSafeBest)} best), ${formatBytes(row.rustSafeSize)} (${formatBytes(row.rustSafeGzip)} gzip)`);
  console.log(`  JS:   ${formatMs(row.jsMs)} median (${formatMs(row.jsBest)} best), ${formatBytes(row.jsSize)} minified (${formatBytes(row.jsGzip)} gzip)`);
  console.log(`  utu ratios: ${(row.utuMs / row.rustMs).toFixed(2)}× Rust time, ${(row.utuMs / row.jsMs).toFixed(2)}× JS time; ${(row.utuSize / row.rustSize).toFixed(2)}× Rust bytes, ${(row.utuSize / row.jsSize).toFixed(2)}× JS bytes\n`);
}

function formatMs(value) { return `${value.toFixed(3)} ms`; }
function formatBytes(value) { return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(2)} KiB`; }
