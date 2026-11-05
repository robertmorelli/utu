// Golden fingerprints of self-hosted editor answers across the program corpus.
// node scripts/editor-query-fingerprints.mjs [--only=substring] [--record]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { compileFile, loadNodeCompiler } from '../src/selfhost/node.js';
import { programIndex, renderEditorHover } from '../src/selfhost/query.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'baselines', 'editor-query-fingerprints.json.gz');
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
const record = process.argv.includes('--record');
const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
const relative = key => key?.startsWith(ROOT + path.sep) ? path.relative(ROOT, key) : key;
const place = at => at ? { file: relative(at.file), start: at.start, end: at.end } : null;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const files = execFileSync('git', ['ls-files', 'examples/*.utu', 'examples/**/*.utu', 'benchmarks/*.utu', 'benchmarks/**/*.utu', 'baselines/corpus/*.utu'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(file => file && (!only || file.includes(only)) && !file.includes('/node_modules/'));
const utu = await loadNodeCompiler();
const results = {};
for (const entry of files) {
  const built = await compileFile(utu, path.join(ROOT, entry), { root: ROOT, target: 'analysis' });
  if (built.diagnostics.some(d => d.severity === 'error')) {
    results[entry] = { names: 0, hints: 0, hash: hash(built.diagnostics.map(d => [relative(d.file), d.kind, d.start, d.end])) };
    continue;
  }
  const index = programIndex(utu, built.files);
  const own = built.files.filter(file => file.role !== 2);
  const names = own.flatMap(file => index.names(file.key));
  const answers = names.map(({ at, decl }) => {
    const explain = index.explainAt(at.file, at.start);
    const hierarchy = index.prepareCallHierarchy(at.file, at.start);
    return {
      at: place(at), declaration: place(index.definition(decl)),
      references: index.references(decl).map(place),
      hover: renderEditorHover(explain),
      explain: explain && { type: explain.type, expectedType: explain.expectedType, wasmType: explain.wasmType,
        callTarget: explain.callTarget >= 0 ? place(index.definition(explain.callTarget)) : null, field: explain.field, captures: explain.captures.length,
        conversions: explain.conversions.map(co => [co.from, co.to, co.kind]), effects: explain.effects.labels },
      hierarchy: hierarchy.map(item => ({ name: item.name, incoming: index.incomingCalls(item.decl).map(call => [call.from.name, call.sites.map(place)]),
        outgoing: index.outgoingCalls(item.decl).map(call => [call.to.name, call.sites.map(place)]) })),
    };
  });
  const inlays = own.flatMap(file => index.inlayHints(file.key).map(hint => [relative(file.key), hint.position, hint.kind, hint.label]));
  results[entry] = { names: names.length, hints: inlays.length,
    hash: hash({ answers, inlays, diagnostics: built.diagnostics.map(d => [relative(d.file), d.kind, d.start, d.end]) }) };
}
if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`); }
if (record) {
  if (only) throw new Error('--record requires the full corpus');
  fs.writeFileSync(BASELINE, gzipSync(Buffer.from(`${JSON.stringify(results, null, 2)}\n`), { mtime: 0 }));
  console.log(`recorded ${Object.keys(results).length} editor query fingerprints`);
} else if (fs.existsSync(BASELINE)) {
  const expected = JSON.parse(gunzipSync(fs.readFileSync(BASELINE)));
  const differing = Object.entries(results).filter(([key, value]) => JSON.stringify(expected[key]) !== JSON.stringify(value));
  for (const [key] of differing.slice(0, 20)) console.error(`differ: ${key}`);
  console.log(`${Object.keys(results).length} programs, ${differing.length} editor query fingerprints differ`);
  if (differing.length) process.exitCode = 1;
} else {
  console.log(`${Object.keys(results).length} programs fingerprinted; record the golden after the baseline handoff`);
}
