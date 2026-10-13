// What every program does when run, recorded so a backend change can be
// checked by behavior rather than by bytes.
//
//   node scripts/run-differential.mjs --record    record .tmp/run-differential.json
//   node scripts/run-differential.mjs             compare against it
//   ... --only=substring   just the matching programs
//   ... --jobs=N           worker threads (default: one per core)
//
// Each program under examples/, benchmarks/, and .tmp/corpus is built for its
// `normal` and `test` targets; every exported function that takes no
// arguments is called, and its result (or trap), plus what it printed, is
// recorded. A call that runs longer than a few seconds is recorded as such.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORD = path.join(ROOT, '.tmp', 'run-differential.json');
const TIMEOUT_MS = 8000;

if (isMainThread) await main();
else await worker();

async function main() {
  const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const record = process.argv.includes('--record');
  const only = flag('only');
  const files = [
    ...await programs(path.join(ROOT, 'examples')),
    ...await programs(path.join(ROOT, 'benchmarks')),
    ...await programs(path.join(ROOT, '.tmp', 'corpus')).catch(() => []),
  ].filter(file => !only || file.includes(only));
  const queue = files.flatMap(file => ['normal', 'test'].map(target => ({ file, target })));
  const jobs = Math.min(Number(flag('jobs') ?? os.availableParallelism()), queue.length);
  const started = performance.now();
  const results = {};

  await Promise.all(Array.from({ length: jobs }, async () => {
    let thread = null;
    for (let job = queue.shift(); job; job = queue.shift()) {
      thread ??= new Worker(fileURLToPath(import.meta.url), { workerData: { ROOT } });
      const key = `${path.relative(ROOT, job.file)} ${job.target}`;
      const outcome = await new Promise(resolve => {
        const timer = setTimeout(() => resolve({ timeout: true }), TIMEOUT_MS);
        thread.once('message', value => { clearTimeout(timer); resolve({ value }); });
        thread.once('error', error => { clearTimeout(timer); resolve({ value: `worker error: ${error.message}` }); });
        thread.postMessage(job);
      });
      thread.removeAllListeners('message');
      thread.removeAllListeners('error');
      if (outcome.timeout || typeof outcome.value === 'string') {
        await thread.terminate();
        thread = null;
      }
      results[key] = outcome.timeout ? 'timeout' : outcome.value;
    }
    await thread?.terminate();
  }));

  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const keys = Object.keys(results).sort();
  if (record) {
    await fs.mkdir(path.dirname(RECORD), { recursive: true });
    await fs.writeFile(RECORD, JSON.stringify(Object.fromEntries(keys.map(key => [key, results[key]])), null, 1));
    const ran = keys.filter(key => typeof results[key] === 'object').length;
    console.log(`recorded ${keys.length} builds (${ran} ran) in ${seconds} s on ${jobs} threads`);
    return;
  }
  const recorded = JSON.parse(await fs.readFile(RECORD, 'utf8'));
  const differ = keys.filter(key => JSON.stringify(recorded[key]) !== JSON.stringify(results[key]));
  for (const key of differ) {
    console.log(`DIFFERS ${key}\n  was ${JSON.stringify(recorded[key]).slice(0, 400)}\n  now ${JSON.stringify(results[key]).slice(0, 400)}`);
  }
  console.log(`${keys.length - differ.length}/${keys.length} builds behave the same in ${seconds} s on ${jobs} threads`);
  if (differ.length) process.exit(1);
}

async function worker() {
  // A program's own async work (a fetch it never awaits) may reject long
  // after its call returned; that belongs to no call being recorded.
  process.on('unhandledRejection', () => {});
  const { createCompiler, emitBinary, initParser, buildImportObject, instantiateLowered } = await import('../src/index.js');
  const { nodePackageResolver } = await import('../tools/dts/packages.mjs');
  const parser = await initParser({ wasmDir: `${workerData.ROOT}/` });
  const compilers = {};
  const compilerFor = target => compilers[target] ??= createCompiler({
    parser, target, optimize: 'none',
    readFile: file => fs.readFile(file, 'utf8'),
    readBinaryFile: file => fs.readFile(file),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
    resolvePackage: nodePackageResolver({ root: workerData.ROOT }),
  });
  parentPort.on('message', async ({ file, target }) => {
    parentPort.postMessage(await run(file, target).catch(error => ({ fails: summarizeError(error) })));
  });

  async function run(file, target) {
    let doc;
    try {
      doc = await compilerFor(target).compileFile(file);
    } catch (error) {
      return { compile: summarizeError(error) };
    }
    if (doc.querySelector('[data-error]')) return { diagnostics: true };
    let wasm;
    try {
      wasm = emitBinary(doc);
    } catch (error) {
      return { emit: summarizeError(error) };
    }
    let instance;
    const printed = [];
    const log = console.log;
    try {
      const imports = await buildImportObject(doc, { projectRoot: workerData.ROOT, wasm });
      ({ instance } = await instantiateLowered(wasm, imports));
    } catch (error) {
      return { instantiate: summarizeError(error) };
    }
    const calls = {};
    for (const [name, value] of Object.entries(instance.exports).sort(([a], [b]) => a.localeCompare(b))) {
      if (typeof value !== 'function' || value.length !== 0) continue;
      printed.length = 0;
      console.log = (...args) => printed.push(args.map(String).join(' '));
      try {
        const result = await value();
        calls[name] = { result: summarize(result), printed: [...printed] };
      } catch (error) {
        calls[name] = { throws: summarizeError(error), printed: [...printed] };
      } finally {
        console.log = log;
      }
    }
    return { calls };
  }
}

function summarize(value) {
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : Number.isNaN(value) ? 'NaN' : value;
  if (typeof value === 'string' || typeof value === 'boolean' || value == null) return value ?? null;
  if (Array.isArray(value)) return value.map(summarize);
  return typeof value;
}

function summarizeError(error) {
  // Engine messages name functions by index, which a new backend may number
  // differently; keep the kind and the message without positions.
  const message = String(error?.message ?? error).split('\n')[0].replace(/\(?wasm-function\[\d+\][^)]*\)?/g, '').trim();
  return `${error?.constructor?.name ?? 'Error'}: ${message}`;
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
      if (/^\s*export\s+(main|lib)\b|^\s*test\s/m.test(source)) out.push(file);
    }
  }
  return out.sort();
}
