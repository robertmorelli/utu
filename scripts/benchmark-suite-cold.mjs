// Cold-start (Run 1, 0 warmups) benchmark suite in fresh d8 processes.
//
// Unlike scripts/benchmark-suite.mjs and scripts/benchmark-programs-d8.mjs
// (which run 3-5 warmups before timing), every sample here spawns a brand-new
// d8 process, instantiates the module, and times the very first invocation.
//
//   node scripts/benchmark-suite-cold.mjs
//   COLD_RUNS=5 node scripts/benchmark-suite-cold.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { compileFile, loadNodeCompiler } from '../src/selfhost/node.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SUITE = path.join(ROOT, 'benchmarks', 'suite');
const TMP = path.join(ROOT, '.tmp', 'cold-benchmark-suite');
const RUNS = Number(process.env.COLD_RUNS ?? 5);
const D8 = process.env.D8_BIN ?? 'd8';
await fs.mkdir(TMP, { recursive: true });

const compiler = await loadNodeCompiler();

// ── Part 1: Kernel suite (utu -O small, utu -O small --coldloops, utu -O fast, Rust, JS) ──

const KERNEL_CASES = [
  { name: 'scalar (50M)', stem: 'scalar', inputs: () => ({ kind: 'scalar', n: 50_000_000 }) },
  { name: 'sieve (500k)', stem: 'sieve', inputs: () => ({ kind: 'scalar', n: 500_000 }) },
  { name: 'analyzer (256 KiB)', stem: 'analyzer', inputs: () => ({ kind: 'analyzer', text: analyzerInput(256 * 1024) }) },
  { name: 'strings (32×2048)', stem: 'strings', inputs: () => ({ kind: 'strings', base: asciiPiece(65_536), piece: asciiPiece(32), repeats: 2_048 }) },
];

const KERNEL_DRIVER = String.raw`
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
    out[n++] = 0xe0 | (c >> 12); out[n++] = 0x80 | ((c >> 6) & 63); out[n++] = 0x80 | (c & 63);
  }
  return out.subarray(0, n);
}
function decodeUtf8(bytes) {
  const units = new Uint16Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    if (b < 0x80) { units[n++] = b; continue; }
    if (b < 0xe0) { units[n++] = ((b & 31) << 6) | (bytes[i++] & 63); continue; }
    units[n++] = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
  }
  let text = '';
  for (let i = 0; i < n; i += 8192) text += String.fromCharCode.apply(null, units.subarray(i, Math.min(n, i + 8192)));
  return text;
}
function instantiate(file, options) {
  return new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(readbuffer(file)), options), {}).exports;
}
async function runCold() {
  if (config.impl === 'js') {
    const js = await import(config.js);
    const t0 = performance.now();
    const res = input.kind === 'strings' ? checksumString(js.run(input.base, input.piece, input.repeats))
      : input.kind === 'analyzer' ? js.run(input.text) : js.run(input.n);
    return { ms: performance.now() - t0, result: res };
  }
  if (config.impl.startsWith('utu')) {
    const tInst = performance.now();
    const utu = instantiate(config.wasm, { builtins: ['js-string'], importedStringConstants: "'" });
    const instMs = performance.now() - tInst;
    const t0 = performance.now();
    const res = input.kind === 'strings' ? checksumString(utu.run(input.base, input.piece, input.repeats))
      : input.kind === 'analyzer' ? utu.run(input.text) : utu.run(input.n);
    return { ms: performance.now() - t0, instMs, result: res };
  }
  const tInst = performance.now();
  const rust = instantiate(config.wasm);
  const instMs = performance.now() - tInst;
  const t0 = performance.now();
  let res;
  if (input.kind === 'strings') {
    const baseBytes = encodeUtf8(input.base);
    const pieceBytes = encodeUtf8(input.piece);
    new Uint8Array(rust.memory.buffer, rust.base_ptr(), baseBytes.length).set(baseBytes);
    new Uint8Array(rust.memory.buffer, rust.piece_ptr(), pieceBytes.length).set(pieceBytes);
    const packed = BigInt.asUintN(64, rust.run(baseBytes.length, pieceBytes.length, input.repeats));
    res = checksumString(decodeUtf8(new Uint8Array(rust.memory.buffer, Number(packed >> 32n), Number(packed & 0xffffffffn))));
  } else if (input.kind === 'analyzer') {
    const bytes = encodeUtf8(input.text);
    new Uint8Array(rust.memory.buffer, rust.input_ptr(), bytes.length).set(bytes);
    res = rust.run(bytes.length);
  } else {
    res = rust.run(input.n);
  }
  return { ms: performance.now() - t0, instMs, result: res };
}
const out = await runCold();
print('RESULT ' + JSON.stringify({ ...out, result: typeof out.result === 'bigint' ? String(out.result) : out.result }));
`;

const PROG_CASES = [
  { name: 'nbody (20)', file: 'benchmarks/nbody/nbody.utu', call: 'e.bench(20)' },
  { name: 'fannkuch (1)', file: 'benchmarks/fannkuch/fannkuch.utu', call: 'e.bench(1)' },
  { name: 'richards (1)', file: 'benchmarks/richards/richards.utu', call: 'e.bench(1)' },
  { name: 'binarytrees (1)', file: 'benchmarks/binarytrees/binarytrees.utu', call: 'e.bench(1)' },
];

const PROG_DRIVER = String.raw`
const [wasmPath, callExpr] = arguments;
const e = new WebAssembly.Instance(new WebAssembly.Module(readbuffer(wasmPath)), { env: { abort() { throw new Error('abort'); } } }).exports;
const fn = new Function('e', 'return ' + callExpr);
const t0 = performance.now();
const res = fn(e);
const ms = performance.now() - t0;
print('RESULT ' + JSON.stringify({ ms, result: String(res) }));
`;

const kernelDriverPath = path.join(TMP, 'kernel-driver.mjs');
const progDriverPath = path.join(TMP, 'prog-driver.js');
await Promise.all([
  fs.writeFile(kernelDriverPath, KERNEL_DRIVER),
  fs.writeFile(progDriverPath, PROG_DRIVER),
]);

const d8Ver = spawnSync(D8, ['-e', 'print(version())'], { encoding: 'utf8' }).stdout.trim();
console.log(`Cold-start benchmark suite (Run 1, 0 warmups, median of ${RUNS} fresh d8 processes)`);
console.log(`  engine: d8 (V8 ${d8Ver}, ${process.arch})\n`);

// ── Run Kernel Suite ──
console.log('1. Kernel suite (cold Run 1)');
console.log('  benchmark           utu -O small   utu +coldloops   utu -O fast      Rust        JS');
console.log('  -------------------+--------------+----------------+--------------+-----------+----------');

for (const spec of KERNEL_CASES) {
  const dir = path.join(TMP, `kernel-${spec.stem}`);
  await fs.mkdir(dir, { recursive: true });
  const inputsPath = path.join(dir, 'inputs.json');
  const utuFile = path.join(SUITE, `${spec.stem}.utu`);
  const uSmall = await compileFile(compiler, utuFile, { root: ROOT, optimize: 'size' });
  const uCold = await compileFile(compiler, utuFile, { root: ROOT, optimize: 'size', luge: true });
  const uFast = await compileFile(compiler, utuFile, { root: ROOT, optimize: 'speed' });
  const jsSource = await fs.readFile(path.join(SUITE, `${spec.stem}.js`), 'utf8');
  const rustWasm = compileRust(spec.stem, path.join(dir, `${spec.stem}-rust.wasm`));
  const files = {
    utuSmall: path.join(dir, 'utu-small.wasm'),
    utuCold: path.join(dir, 'utu-cold.wasm'),
    utuFast: path.join(dir, 'utu-fast.wasm'),
    rust: path.join(dir, `${spec.stem}-rust.wasm`),
    js: path.join(dir, `${spec.stem}.mjs`),
  };
  await Promise.all([
    fs.writeFile(files.utuSmall, uSmall.wasm),
    fs.writeFile(files.utuCold, uCold.wasm),
    fs.writeFile(files.utuFast, uFast.wasm),
    fs.writeFile(files.js, (await transform(jsSource, { minify: true, format: 'esm', target: 'es2022' })).code),
    fs.writeFile(inputsPath, JSON.stringify(spec.inputs())),
  ]);

  const measure = async (impl, artifact) => {
    const cfg = path.join(dir, `${impl}.json`);
    await fs.writeFile(cfg, JSON.stringify({ impl, ...(impl === 'js' ? { js: artifact } : { wasm: artifact }), inputs: inputsPath }));
    const samples = [];
    let result;
    for (let i = 0; i < RUNS; i++) {
      const r = spawnSync(D8, [kernelDriverPath, '--', cfg], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`d8 failed (${spec.name}/${impl}):\n${r.stderr}\n${r.stdout}`);
      const line = r.stdout.split('\n').find(l => l.startsWith('RESULT '));
      const parsed = JSON.parse(line.slice(7));
      samples.push(parsed.ms);
      result = parsed.result;
    }
    return { ms: median(samples), result };
  };

  const mSmall = await measure('utuSmall', files.utuSmall);
  const mCold = await measure('utuCold', files.utuCold);
  const mFast = await measure('utuFast', files.utuFast);
  const mRust = rustWasm ? await measure('rust', files.rust) : null;
  const mJs = await measure('js', files.js);

  if (mSmall.result !== mFast.result || mSmall.result !== mCold.result || mSmall.result !== mJs.result) {
    throw new Error(`${spec.name}: result mismatch`);
  }
  console.log(
    `  ${spec.name.padEnd(19)} | ${fmt(mSmall.ms).padStart(12)} | ${fmt(mCold.ms).padStart(14)} | ${fmt(mFast.ms).padStart(12)} | ${(mRust ? fmt(mRust.ms) : 'n/a').padStart(9)} | ${fmt(mJs.ms).padStart(8)}`
  );
}

// ── Run Classic Programs ──
console.log('\n2. Classic programs (cold Run 1)');
console.log('  program             utu -O small   utu +coldloops   utu -O fast   fast vs small');
console.log('  -------------------+--------------+----------------+--------------+--------------');

for (const spec of PROG_CASES) {
  const dir = path.join(TMP, `prog-${spec.name.replace(/\W+/g, '_')}`);
  await fs.mkdir(dir, { recursive: true });
  const full = path.join(ROOT, spec.file);
  const uSmall = await compileFile(compiler, full, { root: ROOT, optimize: 'size' });
  const uCold = await compileFile(compiler, full, { root: ROOT, optimize: 'size', luge: true });
  const uFast = await compileFile(compiler, full, { root: ROOT, optimize: 'speed' });
  const measure = async (tag, wasm) => {
    const wp = path.join(dir, `${tag}.wasm`);
    await fs.writeFile(wp, wasm);
    const samples = [];
    let result;
    for (let i = 0; i < RUNS; i++) {
      const r = spawnSync(D8, [progDriverPath, '--', wp, spec.call], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`d8 failed (${spec.name}/${tag}):\n${r.stderr}\n${r.stdout}`);
      const line = r.stdout.split('\n').find(l => l.startsWith('RESULT '));
      const parsed = JSON.parse(line.slice(7));
      samples.push(parsed.ms);
      result = parsed.result;
    }
    return { ms: median(samples), result };
  };
  const mSmall = await measure('small', uSmall.wasm);
  const mCold = await measure('cold', uCold.wasm);
  const mFast = await measure('fast', uFast.wasm);
  if (mSmall.result !== mFast.result || mSmall.result !== mCold.result) {
    throw new Error(`${spec.name}: result mismatch`);
  }
  const ratio = (mSmall.ms / mFast.ms).toFixed(2) + '×';
  console.log(
    `  ${spec.name.padEnd(19)} | ${fmt(mSmall.ms).padStart(12)} | ${fmt(mCold.ms).padStart(14)} | ${fmt(mFast.ms).padStart(12)} | ${ratio.padStart(13)}`
  );
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[s.length >> 1];
}
function fmt(ms) { return `${ms.toFixed(1)} ms`; }

function compileRust(stem, outPath) {
  const r = spawnSync('rustup', ['run', 'stable', 'rustc', path.join(SUITE, `${stem}.rs`),
    '--target', 'wasm32-unknown-unknown', '--crate-type', 'cdylib',
    '-C', 'opt-level=3', '-C', 'lto=fat', '-C', 'codegen-units=1', '-C', 'target-feature=+simd128,+bulk-memory',
    '-C', 'panic=abort', '-C', 'strip=symbols', '-o', outPath], { encoding: 'utf8' });
  return r.status === 0;
}

function asciiPiece(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[i % chars.length];
  return out;
}

function analyzerInput(targetBytes) {
  const chunk = 'fn compute(x: I32, y: I32) I32 {\n    let total = x * 3 + y * 7\n    if total > 100 { return total - 42 }\n    // sample comment with 12345 digits\n    return total + 1\n}\n';
  return chunk.repeat(Math.ceil(targetBytes / chunk.length)).slice(0, targetBytes);
}
