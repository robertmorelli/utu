import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { exportFunctions } from './wasm-exports.mjs';
import { createCompiler, emitBinary, initParser } from '../src/index.js';

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

// Each case only describes its inputs. All execution, warmups and timing
// happen in a fresh d8 process per implementation (see DRIVER below).
const cases = [
  {
    name: 'scalar recurrence', stem: 'scalar', detail: '1,000,000 dependent integer iterations',
    inputs: () => ({ kind: 'scalar', n: 1_000_000 }),
  },
  stringCase('middle insert: tiny chunks', 8, 8_192),
  stringCase('middle insert: medium chunks', 32, 2_048),
  stringCase('middle insert: large chunks', 1024, 64),
  {
    name: 'source analyzer', stem: 'analyzer', detail: '256 KiB source-like document; 14 lexical/statistical metrics',
    inputs: () => ({ kind: 'analyzer', text: analyzerInput(256 * 1024) }),
  },
  {
    name: 'prime sieve', stem: 'sieve', detail: '100,000 flags; allocation/fill/random writes/reduction',
    inputs: () => ({ kind: 'scalar', n: 100_000 }),
  },
];

function stringCase(name, pieceLength, repeats) {
  return {
    name, stem: 'strings',
    detail: `${pieceLength.toLocaleString()} ASCII chars inserted ${repeats.toLocaleString()} times at midpoint; 64→128 KiB`,
    inputs: () => ({ kind: 'strings', base: asciiPiece(65_536), piece: asciiPiece(pieceLength), repeats }),
  };
}

const IMPLEMENTATIONS = ['utu', 'rust', 'rustSafe', 'js'];

// The d8 driver: one process runs one implementation of one case. d8 has no
// TextEncoder/TextDecoder, so the Rust boundary's UTF-8 conversions (which are
// intentionally timed, as is the copy into linear memory) are plain JS here.
const DRIVER = String.raw`
const config = JSON.parse(read(arguments[0]));
const input = JSON.parse(read(config.inputs));

function checksumString(value) {
  return value.length ^ value.charCodeAt(value.length >> 1) ^ value.charCodeAt(value.length - 1);
}

function encodeUtf8(text) {
  const out = new Uint8Array(text.length * 3);
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c < 0x80) { out[n++] = c; continue; }
    if (c < 0x800) { out[n++] = 0xc0 | (c >> 6); out[n++] = 0x80 | (c & 63); continue; }
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low < 0xe000) {
        c = 0x10000 + ((c - 0xd800) << 10) + (low - 0xdc00);
        i++;
        out[n++] = 0xf0 | (c >> 18); out[n++] = 0x80 | ((c >> 12) & 63);
        out[n++] = 0x80 | ((c >> 6) & 63); out[n++] = 0x80 | (c & 63);
        continue;
      }
    }
    if (c >= 0xd800 && c < 0xe000) c = 0xfffd; // lone surrogate, as TextEncoder does
    out[n++] = 0xe0 | (c >> 12); out[n++] = 0x80 | ((c >> 6) & 63); out[n++] = 0x80 | (c & 63);
  }
  return out.subarray(0, n);
}

// Assumes well-formed UTF-8 (the Rust kernels only produce it).
function decodeUtf8(bytes) {
  const units = new Uint16Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    if (b < 0x80) { units[n++] = b; continue; }
    if (b < 0xe0) { units[n++] = ((b & 31) << 6) | (bytes[i++] & 63); continue; }
    if (b < 0xf0) { units[n++] = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63); continue; }
    const c = (((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63)) - 0x10000;
    units[n++] = 0xd800 + (c >> 10); units[n++] = 0xdc00 + (c & 1023);
  }
  let text = '';
  for (let i = 0; i < n; i += 8192) text += String.fromCharCode.apply(null, units.subarray(i, Math.min(n, i + 8192)));
  return text;
}

function instantiate(file, options) {
  const module = new WebAssembly.Module(new Uint8Array(readbuffer(file)), options);
  if (WebAssembly.Module.imports(module).length) throw new Error(file + ' needs host imports; the d8 runner provides none');
  return new WebAssembly.Instance(module, {}).exports;
}

function makeRunner() {
  if (config.impl === 'js') return import(config.js).then(js =>
    input.kind === 'strings' ? () => checksumString(js.run(input.base, input.piece, input.repeats))
    : input.kind === 'analyzer' ? () => js.run(input.text)
    : () => js.run(input.n));
  if (config.impl === 'utu') {
    const utu = instantiate(config.wasm, { builtins: ['js-string'], importedStringConstants: "'" });
    return input.kind === 'strings' ? () => checksumString(utu.run(input.base, input.piece, input.repeats))
      : input.kind === 'analyzer' ? () => utu.run(input.text)
      : () => utu.run(input.n);
  }
  const rust = instantiate(config.wasm);
  if (input.kind === 'strings') return () => {
    const baseBytes = encodeUtf8(input.base); // both boundary conversions are intentionally timed
    const pieceBytes = encodeUtf8(input.piece);
    new Uint8Array(rust.memory.buffer, rust.base_ptr(), baseBytes.length).set(baseBytes);
    new Uint8Array(rust.memory.buffer, rust.piece_ptr(), pieceBytes.length).set(pieceBytes);
    const packed = BigInt.asUintN(64, rust.run(baseBytes.length, pieceBytes.length, input.repeats));
    const outputPtr = Number(packed >> 32n);
    const outputLen = Number(packed & 0xffffffffn);
    return checksumString(decodeUtf8(new Uint8Array(rust.memory.buffer, outputPtr, outputLen))); // decode and flatten are timed
  };
  if (input.kind === 'analyzer') return () => {
    const bytes = encodeUtf8(input.text); // boundary conversion and copy are intentionally timed
    new Uint8Array(rust.memory.buffer, rust.input_ptr(), bytes.length).set(bytes);
    return rust.run(bytes.length);
  };
  return () => rust.run(input.n);
}

const run = await makeRunner();
const result = run();
for (let i = 0; i < config.warmups; i++) {
  const value = run();
  if (value !== result) throw new Error('nondeterministic result: ' + value + ' after ' + result);
}
const times = [];
for (let i = 0; i < config.samples; i++) {
  const start = performance.now();
  run();
  times.push(performance.now() - start);
}
print('RESULT ' + JSON.stringify({ result: typeof result === 'bigint' ? String(result) : result, times }));
`;
const DRIVER_PATH = path.join(TMP, 'driver.mjs');
await fs.writeFile(DRIVER_PATH, DRIVER);
const D8 = findD8();

console.log('Rust/utu Wasm benchmark suite (including forbid(unsafe_code) Rust)');
console.log(`  engine: d8 (V8 ${D8.version}, ${process.arch}), one process per implementation and case`);
console.log(`  samples: ${SAMPLES}, warmups: ${WARMUPS}`);
console.log('  Rust: rustc stable -O3 + LTO + simd128 + bulk-memory');
console.log('  utu: -Oz (local cleanup); strings through the JS string builtins');
console.log('  Rust string boundary: UTF-8 encode/decode in plain JS (d8 has no TextEncoder)\n');

const rows = [];
for (const [index, spec] of cases.entries()) {
  const utuBytes = await compileUtu(spec.stem);
  const rustBytes = compileRust(spec.stem);
  const rustSafeBytes = compileRust(spec.stem, { safe: true });
  const { source: jsSource, bytes: jsBytes } = await loadJavaScript(spec.stem);
  const dir = path.join(TMP, `case-${index}-${spec.stem}`);
  await fs.mkdir(dir, { recursive: true });
  const artifacts = {
    utu: { wasm: path.join(dir, `${spec.stem}-utu.wasm`) },
    rust: { wasm: path.join(dir, `${spec.stem}-rust.wasm`) },
    rustSafe: { wasm: path.join(dir, `${spec.stem}-rust-safe.wasm`) },
    js: { js: path.join(dir, `${spec.stem}.mjs`) },
  };
  const inputsPath = path.join(dir, 'inputs.json');
  await Promise.all([
    fs.writeFile(artifacts.utu.wasm, utuBytes),
    fs.writeFile(artifacts.rust.wasm, rustBytes),
    fs.writeFile(artifacts.rustSafe.wasm, rustSafeBytes),
    fs.writeFile(artifacts.js.js, jsSource),
    fs.writeFile(inputsPath, JSON.stringify(spec.inputs())),
  ]);
  const measured = {};
  for (const impl of IMPLEMENTATIONS) {
    const configPath = path.join(dir, `${impl}.json`);
    await fs.writeFile(configPath, JSON.stringify({ impl, ...artifacts[impl], inputs: inputsPath, samples: SAMPLES, warmups: WARMUPS }));
    measured[impl] = runInD8(configPath, `${spec.name} (${impl})`);
  }
  const expected = measured.rust.result;
  if (IMPLEMENTATIONS.some(impl => measured[impl].result !== expected)) {
    throw new Error(`${spec.name}: output mismatch, utu=${measured.utu.result}, Rust=${expected}, safe Rust=${measured.rustSafe.result}, JS=${measured.js.result}`);
  }
  const { utu: { times: utuTimes }, rust: { times: rustTimes }, rustSafe: { times: rustSafeTimes }, js: { times: jsTimes } } = measured;
  const row = {
    ...spec, result: expected,
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
  const source = await fs.readFile(path.join(SUITE, `${stem}.js`), 'utf8');
  const minified = await transform(source, { minify: true, format: 'esm', target: 'es2022' });
  return { source, bytes: new TextEncoder().encode(minified.code) };
}

/** Resolve d8 from D8_BIN or PATH; fail clearly when neither runs. */
function findD8() {
  const executable = process.env.D8_BIN || 'd8';
  const probe = spawnSync(executable, ['-e', 'print(version())'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    const why = probe.error?.message ?? (probe.stderr || probe.stdout).trim();
    throw new Error(`d8 is required for bench:kernels: could not run ${JSON.stringify(executable)} (${why}). Install V8's d8 shell or set D8_BIN to its path.`);
  }
  return { executable, version: probe.stdout.trim() };
}

function runInD8(configPath, label) {
  const run = spawnSync(D8.executable, [DRIVER_PATH, '--', configPath], { cwd: ROOT, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  if (run.error || run.status !== 0) throw new Error(`${label}: d8 failed: ${run.error?.message ?? `${run.stdout}\n${run.stderr}`}`);
  const line = run.stdout.split('\n').find(line => line.startsWith('RESULT '));
  if (!line) throw new Error(`${label}: d8 printed no result:\n${run.stdout}\n${run.stderr}`);
  return JSON.parse(line.slice('RESULT '.length));
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
  return exportFunctions(bytes, required.map(exported => [`${exported}17h`, exported]));
}

function asciiPiece(length) {
  const seed = 'utu-wasm-rope-0123456789abcdef';
  return seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
}

function analyzerInput(length) {
  const block = `// generated source fixture 104729\nfn transform_item(value_17: I32) I32 {\n  let scaled = value_17 * 31 + 7;\n  if scaled > 4096 { return scaled - 113; }\n  for (0..<12) |index| { scaled = scaled + index; };\n  let message = "utu \\183 parser [fixture]"; /* balanced comment */\n  scaled;\n}\n`;
  return block.repeat(Math.ceil(length / block.length)).slice(0, length);
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
