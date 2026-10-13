// The self-hosted compiler's diagnostics against stage 0's: for every
// program (examples/, benchmarks/, baselines/corpus, and the negative
// corpus), for its exports and its tests, the diagnostics' kinds, messages,
// and spans must be stage 0's.
//
//   node scripts/selfhost-diagnostics-differential.mjs [--only=substring] [--show=N] [--dump=file.json]
//   node scripts/selfhost-diagnostics-differential.mjs --record
//
// Stage 0's are in baselines/diagnostics.json.gz (--record writes them). A
// program the self-hosted compiler cannot build yet (it reports something
// unsupported) is counted, not compared.
//
// One difference is on purpose: a program that does not parse. Stage 0
// reports where tree-sitter's error recovery put its error nodes; the
// self-hosted parser reports one error, at the furthest token it reached.
// Both must reject the program with parse errors alone. The others are
// listed in INTENDED, each with what the self-hosted compiler does.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'baselines', 'diagnostics.json.gz');
const SCRATCH = path.join(ROOT, '.tmp', 'diagnostics-negative');

const both = (file, reason) => ({ [`${file} normal`]: reason, [`${file} test`]: reason });
const INTENDED = {
  // `fn Box.make` with no type Box: stage 0 says nothing while the method is
  // not called (here, from an export the test build leaves out).
  'baselines/corpus/77da748f79742cd3ec50d3942f5519b93c53d800.utu test': 'a method of an unknown type is reported',
  'negative/negative-012.utu test': 'a method of an unknown type is reported',
  // `fn f() ?Nope { Nope.null; }`: stage 0 takes Nope for a type once
  // `Nope.null` names it.
  ...both('baselines/corpus/61a23f4f9972b16194f2eaa17f55d78f0d0e7f5d.utu', 'an unknown type is reported wherever it is named'),
  // A copy of the prelude, importing std:Bool and the rest again: stage 0
  // loads them a second time, and reports each member twice.
  ...both('baselines/corpus/5aabd8136804de511d3694a2bbd4878ea74032ba.utu', 'a standard module imported again is the same module'),
  // A copy of std:U64 (std:U32) beside the standard one: stage 0 merges the
  // two, and reports a literal of the merged module's out of range.
  ...both('baselines/corpus/7e83ae64a131f755c065e24dfd0da2700a8194d4.utu', 'a module named like a standard one keeps its own members'),
  ...both('baselines/corpus/c02ee1fa0bf1ffbd68045c13ca9ab0871d172597.utu', 'a module named like a standard one keeps its own members'),
};

if (isMainThread) await main();
else await worker();

async function programs() {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', '.utu'].includes(entry.name)) walk(file);
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
  if (!record) await (await import('./selfhost.mjs')).buildSelfhost();
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
  const count = { same: 0, differ: 0, intended: 0, unsupported: 0 };
  const onlyParseErrors = list => list.length > 0 && list.every(d => d[0] === 'parse-error');
  const lines = [];
  for (const key of Object.keys(results).sort()) {
    const got = results[key];
    if (got === 'unsupported') { count.unsupported++; continue; }
    if (INTENDED[key]) { count.intended++; continue; }
    const want = baseline[key] ?? [];
    if (JSON.stringify(want) === JSON.stringify(got)) { count.same++; continue; }
    if (onlyParseErrors(want) && onlyParseErrors(got)) { count.intended++; continue; }
    count.differ++;
    if (lines.length < show) lines.push(`DIFFERS ${key}\n  stage 0: ${JSON.stringify(want).slice(0, 300)}\n  now:     ${JSON.stringify(got).slice(0, 300)}`);
  }
  for (const line of lines) console.log(line);
  const dump = flag('dump');
  if (dump) fs.writeFileSync(dump, JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { want: baseline[k] ?? [], got: v }]))));
  console.log(`${Object.keys(results).length} builds: ${count.same} diagnose as stage 0 does, ${count.differ} differ, ${count.intended} differ on purpose, ${count.unsupported} not supported yet, in ${seconds} s`);
  if (count.differ) process.exit(1);
}

// One build's diagnostics: [kind, message, file, start, end] each, sorted.
async function worker() {
  const { ROOT, record } = workerData;
  const relative = file => file.startsWith('std:') ? file : path.relative(ROOT, file).replace(/^\.tmp\/diagnostics-negative\//, 'negative/');
  if (record) {
    const { createCompiler, initParser, collectAnalysisDiagnostics } = await import('../src/index.js');
    const { nodePackageResolver } = await import('../tools/dts/packages.mjs');
    const parser = await initParser({ wasmDir: `${ROOT}/` });
    const compilers = {};
    const compilerFor = target => compilers[target] ??= createCompiler({
      parser, target, optimize: 'none',
      readFile: file => fs.promises.readFile(file, 'utf8'),
      readBinaryFile: file => fs.promises.readFile(file),
      resolvePath: (from, rel) => path.resolve(path.dirname(from), rel),
      resolvePackage: nodePackageResolver({ root: ROOT }),
    });
    parentPort.on('message', async ({ file, target }) => {
      let diagnostics;
      try {
        diagnostics = collectAnalysisDiagnostics(await compilerFor(target).compileFile(file));
      } catch (error) {
        diagnostics = error.artifacts?.diagnostics ?? [{ kind: 'compile', message: String(error.message).split('\n')[0] }];
      }
      parentPort.postMessage(diagnostics.filter(d => (d.severity ?? 'error') === 'error')
        .map(d => [d.kind, d.message, d.primary?.file ? relative(d.primary.file) : null, d.primary?.start ?? null, d.primary?.end ?? null])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    });
    return;
  }
  const { loadProgram, loadSelfhost, compileProgram } = await import('./selfhost.mjs');
  const utu = await loadSelfhost();
  parentPort.on('message', async ({ file, target }) => {
    try {
      const files = loadProgram(utu, file);
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
