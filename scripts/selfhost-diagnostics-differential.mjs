// The self-hosted compiler's diagnostics, against what they were when
// recorded: for every program (examples/, benchmarks/, baselines/corpus, and
// the negative corpus), for its exports and its tests, the diagnostics'
// kinds and spans.
//
//   node scripts/selfhost-diagnostics-differential.mjs [--only=substring] [--show=N] [--dump=file.json]
//   node scripts/selfhost-diagnostics-differential.mjs --record
//
// They are in baselines/diagnostics.json.gz (--record writes them; stage -1
// recorded them until the handoff, see baselines/README.md). A program the
// compiler cannot build yet (it reports something unsupported) is counted,
// not compared.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'baselines', 'diagnostics.json.gz');
const SCRATCH = path.join(ROOT, '.tmp', 'diagnostics-negative');


if (isMainThread) await main();
else await worker();

async function programs() {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // The error catalog's folders (examples/error_demo/<category>/) say what
        // the self-hosted compiler says, on purpose: test-error-messages.mjs
        // keeps them, not stage 0.
        const catalog = path.basename(dir) === 'error_demo';
        if (!['node_modules', 'dist', '.utu'].includes(entry.name) && !catalog) walk(file);
      } else if (entry.name.endsWith('.utu')) {
        out.push({ name: path.relative(ROOT, file), file });
      }
    }
  };
  for (const dir of ['examples', 'benchmarks', 'baselines/corpus']) walk(path.join(ROOT, dir));
  const { negativeDiagnosticCases } = await import('./negative-diagnostic-cases.mjs');
  fs.mkdirSync(SCRATCH, { recursive: true });
  negativeDiagnosticCases.forEach(([, source], i) => {
    const name = `negative-${String(i).padStart(3, '0')}.utu`;
    const file = path.join(SCRATCH, name);
    fs.writeFileSync(file, source);
    out.push({ name: `negative/${name}`, file });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const record = process.argv.includes('--record');
  const only = flag('only');
  const show = Number(flag('show') ?? 10);
  const list = (await programs()).filter(p => !only || p.name.includes(only));
  const queue = list.flatMap(p => ['normal', 'test'].map(target => ({ ...p, target })));
  const jobs = Math.min(Number(flag('jobs') ?? os.availableParallelism()), queue.length);
  // Built once here, so the workers load it from the cache.
  await (await import('./selfhost.mjs')).loadSelfhost();
  const results = {};
  const started = performance.now();
  await Promise.all(Array.from({ length: jobs }, async () => {
    const thread = new Worker(fileURLToPath(import.meta.url), { workerData: { ROOT, record } });
    for (let job = queue.shift(); job; job = queue.shift()) {
      const key = `${job.name} ${job.target}`;
      if (process.env.UTU_TRACE) fs.appendFileSync(process.env.UTU_TRACE, key + '\n');
      results[key] = await new Promise(resolve => {
        thread.once('message', resolve);
        thread.postMessage(job);
      });
    }
    await thread.terminate();
  }));
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  if (record) {
    const kept = Object.fromEntries(Object.entries(results).filter(([, v]) => v?.length).sort());
    fs.writeFileSync(BASELINE, zlib.gzipSync(JSON.stringify(kept), { level: 9 }));
    console.log(`recorded the diagnostics of ${Object.keys(kept).length} builds in ${seconds} s`);
    return;
  }
  const baseline = JSON.parse(zlib.gunzipSync(fs.readFileSync(BASELINE)));
  const count = { same: 0, differ: 0, unsupported: 0 };
  // Kinds and places, not words: examples/error_demo/messages.txt keeps the
  // words (scripts/test-error-messages.mjs).
  const where = list => JSON.stringify(list.map(([kind, , file, start, end]) => [kind, file, start, end]));
  const lines = [];
  for (const key of Object.keys(results).sort()) {
    const got = results[key];
    if (got === 'unsupported') { count.unsupported++; continue; }
    const want = baseline[key] ?? [];
    if (where(want) === where(got)) { count.same++; continue; }
    count.differ++;
    if (lines.length < show) lines.push(`DIFFERS ${key}\n  was: ${JSON.stringify(want).slice(0, 300)}\n  now: ${JSON.stringify(got).slice(0, 300)}`);
  }
  for (const line of lines) console.log(line);
  const dump = flag('dump');
  if (dump) fs.writeFileSync(dump, JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { want: baseline[k] ?? [], got: v }]))));
  console.log(`${Object.keys(results).length} builds: ${count.same} diagnose as recorded, ${count.differ} differ, ${count.unsupported} not supported yet, in ${seconds} s`);
  if (count.differ) process.exit(1);
}

// One build's diagnostics: [kind, message, file, start, end] each, sorted.
async function worker() {
  const { ROOT } = workerData;
  const relative = file => file.startsWith('std:') ? file : path.relative(ROOT, file).replace(/^\.tmp\/diagnostics-negative\//, 'negative/');
  const { loadProgram, loadSelfhost, compileProgram } = await import('./selfhost.mjs');
  const utu = await loadSelfhost();
  utu.set_optimize(0);
  parentPort.on('message', async ({ file, target }) => {
    try {
      const files = await loadProgram(utu, file);
      const size = await compileProgram(utu, target === 'test' ? 1 : 0);
      if (size >= 0) { parentPort.postMessage([]); return; }
      const out = [];
      let unsupported = false;
      for (let i = 0; i < utu.diagnostic_count(); i++) {
        const kind = utu.diagnostic_kind(i);
        if (kind === 'unsupported') unsupported = true;
        const f = utu.diagnostic_file(i);
        const at = f >= 0 ? files[f] : null;
        const toUnits = byte => {
          if (!at) return null;
          const prefix = new TextDecoder().decode(at.bytes.subarray(0, byte - at.offset));
          return prefix.length;
        };
        out.push([kind, utu.diagnostic_message(i), at ? relative(at.key) : null,
          at ? toUnits(utu.diagnostic_start(i)) : null, at ? toUnits(utu.diagnostic_end(i)) : null]);
      }
      parentPort.postMessage(unsupported ? 'unsupported' : out.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    } catch (error) {
      parentPort.postMessage([['crash', String(error.message), null, null, null]]);
    }
  });
}
