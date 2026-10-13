// The invariant for compiler refactors: every program compiles to the same wasm.
//
//   node scripts/wasm-fingerprints.mjs --record        record baselines/wasm-fingerprints.json
//   node scripts/wasm-fingerprints.mjs                 compare against it
//   ... --optimized       also check -Oz and -O3 (with the local cleanup)
//   ... --only=substring  just the matching programs
//   ... --jobs=N          worker threads (default: one per core)
//   ... --corpus          also the programs in baselines/corpus (the syntax corpus)
//
// Covers every .utu program under examples/ and benchmarks/. The default check
// hashes -O0 output, which is fast and shows every change the compiler makes;
// the optimizer can hide differences. Programs that do not compile record
// their diagnostics. Exits 1 on any difference.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORD = path.join(ROOT, 'baselines', 'wasm-fingerprints.json');

if (isMainThread) await main();
else await worker();

async function main() {
  const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const record = process.argv.includes('--record');
  const levels = process.argv.includes('--optimized') ? ['none', 'size', 'speed'] : ['none'];
  const only = flag('only');
  const corpus = process.argv.includes('--corpus') ? await programs(path.join(ROOT, 'baselines', 'corpus')).catch(() => []) : [];
  const files = [...await programs(path.join(ROOT, 'examples')), ...await programs(path.join(ROOT, 'benchmarks')), ...corpus]
    .filter(file => !only || file.includes(only));
  const queue = files.flatMap(file => levels.map(level => ({ file, level })));
  const jobs = Math.min(Number(flag('jobs') ?? os.availableParallelism()), queue.length);

  const started = performance.now();
  const results = {};
  await Promise.all(Array.from({ length: jobs }, () => new Promise((resolve, reject) => {
    const thread = new Worker(fileURLToPath(import.meta.url), { workerData: { ROOT } });
    const next = () => {
      const job = queue.shift();
      if (job) thread.postMessage(job);
      else thread.terminate().then(resolve);
    };
    thread.on('message', ({ key, value }) => { results[key] = value; next(); });
    thread.on('error', reject);
    thread.once('online', next);
  })));
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const keys = Object.keys(results).sort();

  let recorded = {};
  try { recorded = JSON.parse(await fs.readFile(RECORD, 'utf8')); } catch {}
  if (record) {
    for (const key of keys) recorded[key] = results[key];
    await fs.mkdir(path.dirname(RECORD), { recursive: true });
    await fs.writeFile(RECORD, JSON.stringify(Object.fromEntries(Object.entries(recorded).sort()), null, 1));
    const compiled = keys.filter(key => /^[0-9a-f]{64}$/.test(results[key])).length;
    console.log(`recorded ${keys.length} builds (${compiled} compile) in ${seconds} s on ${jobs} threads`);
    return;
  }
  const missing = keys.filter(key => !(key in recorded));
  if (missing.length) {
    console.log(`no recorded fingerprint for ${missing.length} builds (e.g. ${missing[0]}); run with --record first`);
    process.exit(1);
  }
  const differ = keys.filter(key => recorded[key] !== results[key]);
  for (const key of differ) console.log(`DIFFERS ${key}\n  was ${recorded[key]}\n  now ${results[key]}`);
  console.log(`${keys.length - differ.length}/${keys.length} builds identical in ${seconds} s on ${jobs} threads`);
  if (differ.length) process.exit(1);
}

async function worker() {
  const { createCompiler, emitBinary, initParser } = await import('../src/index.js');
  const { nodePackageResolver } = await import('../tools/dts/packages.mjs');
  const parser = await initParser({ wasmDir: `${workerData.ROOT}/` });
  const compilers = {};
  const compilerFor = optimize => compilers[optimize] ??= createCompiler({
    parser, target: 'normal', optimize,
    readFile: file => fs.readFile(file, 'utf8'),
    readBinaryFile: file => fs.readFile(file),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
    resolvePackage: nodePackageResolver({ root: workerData.ROOT }),
  });
  parentPort.on('message', async ({ file, level }) => {
    const key = `${path.relative(workerData.ROOT, file)} ${level}`;
    let value;
    try {
      const doc = await compilerFor(level).compileFile(file);
      const errors = [...doc.querySelectorAll('[data-error]')].map(node => node.dataset.errorMessage ?? node.dataset.error);
      value = errors.length ? `errors: ${errors.join(' | ')}`
        : createHash('sha256').update(emitBinary(doc)).digest('hex');
    } catch (error) {
      value = `throws: ${String(error.message).split('\n')[0]}`;
    }
    // Paths in messages are relative to the repository, so records are portable.
    parentPort.postMessage({ key, value: value.split(workerData.ROOT).join('<root>') });
  });
}

async function programs(directory) {
  const out = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'error_demo', 'dist', '.utu'].includes(entry.name)) continue;
      out.push(...await programs(file));
    } else if (entry.name.endsWith('.utu')) {
      const source = await fs.readFile(file, 'utf8');
      // Entry files only: imported modules are compiled through them.
      if (/^\s*export\s+(main|lib)\b/m.test(source)) out.push(file);
    }
  }
  return out.sort();
}
