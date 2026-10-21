// The invariant for everything the compiler shows besides wasm: diagnostics,
// editor ranges, every editor query at every node, and the graph views.
//
//   node scripts/behavior-fingerprints.mjs --record   record baselines/behavior-fingerprints.json
//   node scripts/behavior-fingerprints.mjs            compare against it
//   ... --only=substring   just the matching programs
//   ... --jobs=N           worker threads (default: one per core)
//
// Full outputs go to .tmp/behavior/recorded (on --record) and
// .tmp/behavior/current (on a check), one gzipped JSON file per program, so a
// difference can be diffed (scripts/behavior-diff.mjs). Internal node ids are replaced by stable names
// (`tag@file:start-end#n`), so a compiler that numbers nodes differently but
// behaves the same still matches.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORD = path.join(ROOT, 'baselines', 'behavior-fingerprints.json');
const DUMPS = path.join(ROOT, '.tmp', 'behavior');

if (isMainThread) await main();
else await worker();

async function main() {
  const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const record = process.argv.includes('--record');
  const only = flag('only');
  const programs = (await corpus()).filter(program => !only || program.name.includes(only));
  const queue = programs.flatMap(program => ['analysis', 'normal'].map(target => ({ ...program, target })));
  const jobs = Math.min(Number(flag('jobs') ?? os.availableParallelism()), queue.length);
  const out = path.join(DUMPS, record ? 'recorded' : 'current');
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });

  const started = performance.now();
  const results = {};
  await Promise.all(Array.from({ length: jobs }, () => new Promise((resolve, reject) => {
    const thread = new Worker(fileURLToPath(import.meta.url), { workerData: { ROOT, out } });
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
    await fs.writeFile(RECORD, JSON.stringify(Object.fromEntries(Object.entries(recorded).sort()), null, 1));
    console.log(`recorded ${keys.length} behaviors in ${seconds} s on ${jobs} threads`);
    return;
  }
  const differ = keys.filter(key => JSON.stringify(recorded[key]) !== JSON.stringify(results[key]));
  for (const key of differ) {
    const parts = Object.keys({ ...recorded[key], ...results[key] }).filter(part => recorded[key]?.[part] !== results[key]?.[part]);
    console.log(`DIFFERS ${key}: ${parts.join(', ')}`);
  }
  if (differ.length) console.log('  node scripts/behavior-diff.mjs <program> shows the first differences');
  console.log(`${keys.length - differ.length}/${keys.length} behaviors identical in ${seconds} s on ${jobs} threads`);
  if (differ.length) process.exit(1);
}

/** Every program: example and benchmark files, std modules, bindings, and the negative corpus. */
async function corpus() {
  const files = [];
  for (const dir of ['examples', 'benchmarks', 'std', 'hand_written_bindings']) files.push(...await utuFiles(path.join(ROOT, dir)));
  const programs = files.sort().map(file => ({ name: path.relative(ROOT, file), file }));
  const { negativeDiagnosticCases } = await import('./negative-diagnostic-cases.mjs');
  negativeDiagnosticCases.forEach(([name, source], i) => {
    programs.push({ name: `negative/${String(i).padStart(3, '0')} ${name}`, source, file: `negative-${String(i).padStart(3, '0')}.utu` });
  });
  return programs;
}

async function utuFiles(directory) {
  const out = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.utu'].includes(entry.name)) continue;
      // The error catalog (examples/error_demo/<category>/) has its own test, test-error-messages.mjs.
      if (path.basename(directory) === 'error_demo') continue;
      out.push(...await utuFiles(file));
    } else if (entry.name.endsWith('.utu')) {
      out.push(file);
    }
  }
  return out;
}

async function worker() {
  const { createCompiler, initParser, formatDiagnostics } = await import('../src/index.js');
  const { extractGraphs } = await import('../src/compiler/graph-view.js');
  const { nodePackageResolver } = await import('../tools/dts/packages.mjs');
  const { ROOT, out } = workerData;
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const scratch = path.join(ROOT, '.tmp', `behavior-scratch-${process.pid}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(scratch, { recursive: true });
  const compilers = {};
  const compilerFor = target => compilers[target] ??= createCompiler({
    parser, target, optimize: 'none',
    readFile: file => fs.readFile(file, 'utf8'),
    readBinaryFile: file => fs.readFile(file),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
    resolvePackage: nodePackageResolver({ root: ROOT }),
  });

  parentPort.on('message', async ({ name, file, source, target }) => {
    const key = `${name} ${target}`;
    let entry = file;
    if (source != null) {
      entry = path.join(scratch, file);
      await fs.writeFile(entry, source);
    }
    let dump;
    try {
      dump = await describe(compilerFor(target), entry, target);
    } catch (error) {
      dump = { throws: String(error?.message ?? error).split('\n')[0] };
    }
    // Paths are reported relative to the repository, and scratch files by name.
    const text = JSON.stringify(dump, null, 1).replaceAll(scratch + path.sep, '').replaceAll(ROOT + path.sep, '');
    const parsed = JSON.parse(text);
    const value = Object.fromEntries(Object.entries(parsed).map(([part, content]) =>
      [part, createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16)]));
    await fs.writeFile(path.join(out, `${key.replace(/[^a-zA-Z0-9._-]+/g, '_')}.json.gz`), gzipSync(text));
    parentPort.postMessage({ key, value });
  });

  async function describe(compiler, entry, target) {
    let analysis;
    try {
      analysis = await compiler.analyzeFile(entry);
    } catch (error) {
      const diagnostics = error.artifacts?.diagnostics ?? [];
      if (!diagnostics.length) throw error;
      return { diagnostics: diagnostics.map(item => plain(item)), formatted: await format(diagnostics, error.snapshot) };
    }
    const { doc, artifacts } = analysis;
    const diagnostics = artifacts.diagnostics;
    const dump = { diagnostics: diagnostics.map(item => plain(item)), formatted: await format(diagnostics, analysis.snapshot) };
    if (target !== 'analysis') return dump;

    const snapshot = analysis.snapshot;
    const names = stableNames(doc);
    const canon = value => canonicalize(value, names);
    dump.entries = canon(snapshot.entries.map(item => plain(item)));

    // Every editor query at every node of the program's own files.
    const files = new Set([...(doc.__utuSourceTexts?.keys() ?? [])].filter(file => !file.startsWith('std:')));
    const queries = [];
    for (const file of [...files].sort()) {
      const offsets = [...new Set(snapshot.entries.filter(e => e.file === file && e.kind === 'ir').map(e => e.start))].sort((a, b) => a - b);
      for (const offset of offsets) {
        const hierarchy = snapshot.prepareCallHierarchy(file, offset);
        queries.push({
          file, offset,
          explain: snapshot.explainAt(file, offset),
          definition: snapshot.definitionAt(file, offset),
          references: snapshot.referencesAt(file, offset, { includeDeclaration: true }),
          hierarchy,
          incoming: hierarchy?.map?.(item => snapshot.incomingCalls(item.id)) ?? null,
          outgoing: hierarchy?.map?.(item => snapshot.outgoingCalls(item.id)) ?? null,
        });
      }
      queries.push({ file, inlayHints: snapshot.inlayHintsForFile(file) });
    }
    dump.queries = canon(queries.map(item => plain(item)));

    const { nodes, edges } = extractGraphs(doc);
    dump.graphs = canon({ nodes: [...nodes.values()].map(item => plain(item)), edges: edges.map(item => plain(item)) });
    return dump;
  }

  async function format(diagnostics, snapshot) {
    if (!diagnostics.length) return '';
    return formatDiagnostics(diagnostics, { readFile: file => fs.readFile(file, 'utf8').catch(() => ''), snapshot, color: false });
  }
}

/** JSON-safe copy: drops functions and live nodes, turns Maps and Sets into arrays. */
function plain(value, seen = new Set()) {
  if (value == null || typeof value !== 'object') return typeof value === 'function' ? undefined : value;
  if (value.nodeType) return `<node ${value.id || value.localName}>`;
  if (seen.has(value)) return '<cycle>';
  seen.add(value);
  let result;
  if (value instanceof Map) result = [...value].map(([k, v]) => [plain(k, seen), plain(v, seen)]);
  else if (value instanceof Set) result = [...value].map(v => plain(v, seen));
  else if (Array.isArray(value)) result = value.map(v => plain(v, seen));
  else result = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v, seen)]).filter(([, v]) => v !== undefined));
  seen.delete(value);
  return result;
}

/** Map every node id (and origin id) in the document to `tag@file:start-end#n`. */
function stableNames(doc) {
  const names = new Map();
  const counts = new Map();
  const root = doc?.body?.firstChild;
  if (!root) return names;
  const origins = new Map();
  for (const node of [root, ...root.querySelectorAll('*')]) {
    const base = `${node.localName}@${node.getAttribute('data-origin-file') ?? ''}:${node.getAttribute('data-start') ?? ''}-${node.getAttribute('data-end') ?? ''}`;
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    const name = n ? `${base}#${n}` : base;
    if (node.id) names.set(node.id, name);
    const origin = node.getAttribute('data-origin-id');
    if (origin && !origins.has(origin)) origins.set(origin, name);
  }
  for (const [origin, name] of origins) if (!names.has(origin)) names.set(origin, `origin(${name})`);
  return names;
}

const ID = /^n\d+$/;
const ID_KEYS = new Set(['id', 'originId', 'rewriteOf', 'sourceId', 'from', 'to', 'bindingId', 'fnId', 'declarationId', 'target', 'source']);

function canonicalize(value, names) {
  const rename = id => names.get(id) ?? `?${id.startsWith('n') ? 'gone' : id}`;
  const walk = (value, key) => {
    if (typeof value === 'string') {
      if (ID_KEYS.has(key) && ID.test(value)) return rename(value);
      // Ids inside composite strings: `suspect:n12`, `<node n12>`.
      return value.replace(/(suspect:|<node )(n\d+)/g, (_, prefix, id) => prefix + rename(id));
    }
    if (Array.isArray(value)) return value.map(item => walk(item, key));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    return value;
  };
  return walk(value, '');
}
