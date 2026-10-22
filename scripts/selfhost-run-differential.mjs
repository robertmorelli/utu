// What programs the self-hosted compiler builds do when run, against what
// stage 0's builds did (baselines/run-differential.json).
//
//   node scripts/selfhost-run-differential.mjs [--only=substring] [--show=N] [--jobs=N] [--why=node_kind]
//
// --why=call_expr lists the source of the call_exprs it cannot build yet.
//
// Every program under examples/, benchmarks/, and baselines/corpus, for its
// `normal` and `test` targets, as scripts/run-differential.mjs runs them:
// every exported function that takes no arguments is called, and its result
// (or trap) and what it printed are compared. A program the compiler cannot
// build yet (it reports something unsupported) is counted, not compared.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const OPTIMIZE = process.argv.find(arg => arg.startsWith('--optimize='))?.slice(11) ?? process.env.UTU_OPTIMIZE ?? 'none';
// Workers see the environment, not the arguments.
process.env.UTU_OPTIMIZE = OPTIMIZE;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_TIMEOUT_MS = 8000;

// Where the self-hosted compiler deliberately differs from stage 0, and why.
const INTENDED = {
  // `Pair[I32]` of `mod Pair[A, B]`: stage 0 builds it, reading B as nothing.
  'baselines/corpus/ec8df734a5c2347d03925bf576b9d802fee64101.utu normal': 'a module given too few type arguments is reported',
  'baselines/corpus/ec8df734a5c2347d03925bf576b9d802fee64101.utu test': 'a module given too few type arguments is reported',
  // `Array[P].new_default(n)` of a protocol P: stage 0 fills it with null,
  // which a P is never.
  'baselines/corpus/1d7c242fe6839ec76ed1da7536febf6812b363ab.utu normal': 'an array of a protocol has no default',
  'baselines/corpus/1d7c242fe6839ec76ed1da7536febf6812b363ab.utu test': 'an array of a protocol has no default',
  'baselines/corpus/910fed2be6adc5922740738f9f00acda638e229c.utu normal': 'an array of a protocol has no default',
  'baselines/corpus/910fed2be6adc5922740738f9f00acda638e229c.utu test': 'an array of a protocol has no default',
  'baselines/corpus/98095849f80e3abfc25a0e780cb801563e58652c.utu normal': 'an array of a protocol has no default',
  'baselines/corpus/98095849f80e3abfc25a0e780cb801563e58652c.utu test': 'an array of a protocol has no default',
  // Bounded module parameters (`mod Sorted[T[Ord]]`) are the self-hosted compiler's.
  'examples/bounds.utu normal': 'bounded module parameters',
  'examples/bounds.utu test': 'bounded module parameters',
  // `let value: … = f();`: stage 0 wants a literal; a global may be computed.
  'baselines/corpus/7de07dc7142443e85b80d61eeb717be007586eb4.utu normal': 'a global may be computed',
  'baselines/corpus/7de07dc7142443e85b80d61eeb717be007586eb4.utu test': 'a global may be computed',
};

if (isMainThread) await main();
else await worker();

async function main() {
  // Build once here first, so a compiler that does not build fails at once.
  await (await import('./selfhost.mjs')).loadSelfhost();
  const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const only = flag('only');
  const show = Number(flag('show') ?? 10);
  const recorded = JSON.parse(await fs.readFile(path.join(ROOT, 'baselines', 'run-differential.json'), 'utf8'));
  const files = [
    ...await programs(path.join(ROOT, 'examples')),
    ...await programs(path.join(ROOT, 'benchmarks')),
    ...await programs(path.join(ROOT, 'baselines', 'corpus')),
  ].filter(file => !only || file.includes(only));
  const queue = files.flatMap(file => ['normal', 'test'].map(target => ({ file, target })));
  const jobs = Math.min(Number(flag('jobs') ?? os.availableParallelism()), queue.length);
  const started = performance.now();
  const results = {};
  await Promise.all(Array.from({ length: jobs }, async () => {
    let thread = null;
    for (let job = queue.shift(); job; job = queue.shift()) {
      thread ??= new Worker(fileURLToPath(import.meta.url), { workerData: { ROOT, why: flag('why') } });
      const key = `${path.relative(ROOT, job.file)} ${job.target}`;
      const outcome = await new Promise(resolve => {
        let timer = null;
        thread.on('message', message => {
          clearTimeout(timer);
          if (message === 'running') timer = setTimeout(() => resolve({ timeout: true }), RUN_TIMEOUT_MS);
          else resolve({ value: message });
        });
        thread.once('error', error => { clearTimeout(timer); resolve({ value: { crash: error.message } }); });
        thread.postMessage(job);
      });
      thread.removeAllListeners('message');
      thread.removeAllListeners('error');
      if (outcome.timeout || outcome.value?.crash) {
        await thread.terminate();
        thread = null;
      }
      results[key] = outcome.timeout ? 'timeout' : outcome.value;
    }
    await thread?.terminate();
  }));

  const keys = Object.keys(results).sort();
  if (flag('json')) await fs.writeFile(flag('json'), JSON.stringify(Object.fromEntries(keys.map(key => [key, results[key]])), null, 1));
  const count = { same: 0, differ: 0, unsupported: 0, rejected: 0, intended: 0 };
  const differ = [];
  const reasons = new Map();
  const whys = [];
  for (const key of keys) {
    const result = results[key];
    if (INTENDED[key]) { count.intended++; continue; }
    // Wutu templates are the self-hosted compiler's alone: stage 0 refuses them.
    if (JSON.stringify(recorded[key] ?? '').includes('Wutu templates are compiled by the self-hosted compiler')) { count.intended++; continue; }
    if (result?.unsupported) {
      count.unsupported++;
      for (const snippet of result.snippets ?? []) whys.push(snippet);
      for (const reason of result.unsupported) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      continue;
    }
    if (result?.diagnostics) {
      // Stage 0 rejected it too (or failed to build it): the same outcome.
      if (recorded[key]?.diagnostics || recorded[key]?.compile) { count.same++; continue; }
      count.rejected++;
      differ.push(`REJECTS ${key}: ${result.diagnostics.slice(0, 3).join('; ')}`);
      continue;
    }
    if (JSON.stringify(recorded[key]) === JSON.stringify(result)) { count.same++; continue; }
    // A size build shares one import per member operation, so an engine's
    // error names `self[k]` where stage 0's per-name import named the member.
    if (OPTIMIZE === 'size'
        && JSON.stringify(recorded[key]).replace(/self\.[A-Za-z_$][\w$]*/g, 'self[k]') === JSON.stringify(result)) { count.same++; continue; }
    count.differ++;
    differ.push(`DIFFERS ${key}\n  was ${JSON.stringify(recorded[key]).slice(0, 300)}\n  now ${JSON.stringify(result).slice(0, 300)}`);
  }
  for (const line of differ.slice(0, show)) console.log(line);
  if (whys.length) console.log(`${flag('why')}, unsupported:\n${[...new Set(whys)].slice(0, Number(flag('show') ?? 30)).map(w => `  ${w}`).join('\n')}`);
  const top = [...reasons].sort((a, b) => b[1] - a[1]).slice(0, Number(flag('reasons') ?? 15));
  if (top.length) console.log(`unsupported, by what (programs):\n${top.map(([reason, n]) => `  ${n} ${reason}`).join('\n')}`);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`${keys.length} builds: ${count.same} behave as stage 0's, ${count.differ} differ, `
    + `${count.rejected} rejected that stage 0 built, ${count.intended} differ on purpose, ${count.unsupported} not supported yet, in ${seconds} s`);
  if (count.differ || count.rejected) process.exit(1);
}

async function worker() {
  process.on('unhandledRejection', () => {});
  const { loadProgram, loadSelfhost, instantiateBuilt, compileProgram, builtModule } = await import('./selfhost.mjs');
  const utu = await loadSelfhost();
  // Stage 0's runs were recorded at optimize: 'none'; how a program behaves
  // must not depend on it, so --optimize=size checks the default builds.
  utu.set_optimize({ none: 0, size: 1, speed: 2 }[OPTIMIZE]);
  parentPort.on('message', async ({ file, target }) => {
    const result = await run(file, target).catch(error => ({ crash: summarizeError(error) }));
    parentPort.postMessage(JSON.parse(JSON.stringify(result).split(workerData.ROOT).join('<root>')));
  });

  async function run(file, target) {
    const files = await loadProgram(utu, file);
    const size = await compileProgram(utu, target === 'test' ? 1 : 0);
    if (size < 0) {
      const diagnostics = [];
      const unsupported = new Set();
      const snippets = [];
      for (let i = 0; i < utu.diagnostic_count(); i++) {
        const kind = utu.diagnostic_kind(i);
        const node = utu.diagnostic_node(i);
        const what = node < 0 ? 'file' : utu.node_kind_name(new Uint8Array(utu.node_kind.buffer)[node]);
        if (kind === 'unsupported') {
          unsupported.add(what);
          if (what === workerData.why) {
            const first = new Int32Array(utu.node_first.buffer)[node];
            const last = new Int32Array(utu.node_last.buffer)[node];
            const start = new Int32Array(utu.tok_start.buffer)[first];
            const end = new Int32Array(utu.tok_end.buffer)[last - 1];
            snippets.push(new TextDecoder().decode(new Uint8Array(utu.src.buffer, start, Math.min(end - start, 120))).replace(/\s+/g, ' '));
          }
        }
        diagnostics.push(`${kind} ${what}`);
      }
      return unsupported.size ? { unsupported: [...unsupported], snippets } : { diagnostics };
    }
    const { wasm, spec } = builtModule(utu, size);
    if (!WebAssembly.validate(wasm)) {
      try { await WebAssembly.compile(wasm); } catch (error) { return { emit: summarizeError(error) }; }
    }
    let exports;
    try {
      // The exports as they are; each is called through WebAssembly.promising,
      // as stage 0's harness calls them.
      ({ instance: { exports } } = await instantiateBuilt(wasm, spec));
    } catch (error) {
      return { instantiate: summarizeError(error) };
    }
    const calls = {};
    const printed = [];
    const log = console.log;
    parentPort.postMessage('running');
    for (const [name, value] of Object.entries(exports).sort(([a], [b]) => a.localeCompare(b))) {
      if (typeof value !== 'function' || value.length !== 0) continue;
      printed.length = 0;
      console.log = (...args) => printed.push(args.map(String).join(' '));
      try {
        const result = await WebAssembly.promising(value)();
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
