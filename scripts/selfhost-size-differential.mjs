// How large the modules the self-hosted compiler builds are.
//
//   node scripts/selfhost-size-differential.mjs            compare with both baselines
//   node scripts/selfhost-size-differential.mjs --record   record today's sizes (baselines/sizes.json)
//
// Every program of the run differential that builds (its exports, at -Oz),
// against two baselines: the size stage -1's build of it was
// (baselines/stage0-sizes.json, fixed since stage -1 is gone), and the size
// the self-hosted compiler's own build was when last recorded
// (baselines/sizes.json, a ratchet: record it on a deliberate change). None
// may be more than SLACK bytes larger than either, and all of them must be
// smaller than stage -1's in sum.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'baselines', 'stage0-sizes.json');
const RATCHET = path.join(ROOT, 'baselines', 'sizes.json');
const SLACK = 3;
// Larger on purpose, and why.
const INTENDED = {
  // Engines read a negative index differently (V8 unsigned, JSC clamped): the range is checked.
  'baselines/corpus/468d92cae4849195775dfadf5aef4636071b6e4b.utu': 'a Str slice of a variable range is made empty when out of order',
  'baselines/corpus/57940c7e7d169dd2167180f2d2ab427288c58114.utu': 'a Str slice of a variable range is made empty when out of order',
  'benchmarks/suite/strings.utu': 'a Str slice of a variable range is made empty when out of order',
  // Through the host, each level of a closure's recursion held JS frames: the stack overflowed at a tenth of the depth.
  'baselines/corpus/b53a6f3724f67a6c591fd0aea8fa1bc5a76bb444.utu': 'closures that recurse are called by call_ref, not through the host',
};

const programs = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'baselines', 'run-differential.json'), 'utf8')))
  .filter(key => key.endsWith(' normal')).map(key => key.slice(0, -' normal'.length));

const { compileFile, loadNodeCompiler } = await import('../src/selfhost/node.js');
const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const utu = await loadNodeCompiler();
const started = performance.now();
const sizes = {};
for (const rel of programs) {
  const built = await compileFile(utu, path.join(ROOT, rel), { optimize: 'size', root: ROOT });
  if (built.wasm) sizes[rel] = built.wasm.length;
}
if (process.argv.includes('--record')) {
  fs.writeFileSync(RATCHET, `${JSON.stringify(sizes, null, 1)}\n`);
  console.log(`recorded the sizes of ${Object.keys(sizes).length} programs`);
  process.exit(0);
}
let ratchet = {};
try { ratchet = JSON.parse(fs.readFileSync(RATCHET, 'utf8')); } catch {}
const grown = Object.entries(sizes).filter(([rel, now]) => rel in ratchet && now - ratchet[rel] > SLACK);
for (const [rel, now] of grown) console.log(`GREW ${rel}: ${ratchet[rel]} → ${now} bytes since baselines/sizes.json`);
let before = 0, after = 0, smaller = 0, same = 0;
const larger = [];
for (const [rel, size] of Object.entries(baseline)) {
  const built = sizes[rel] == null ? {} : { wasm: { length: sizes[rel] } };
  if (!built.wasm) continue;
  before += size;
  after += built.wasm.length;
  if (built.wasm.length < size) smaller++;
  else if (built.wasm.length === size) same++;
  else larger.push({ rel, size, now: built.wasm.length });
}
const seconds = ((performance.now() - started) / 1000).toFixed(1);
const count = smaller + same + larger.length;
const over = larger.filter(({ rel, size, now }) => now - size > SLACK && !INTENDED[rel]);
for (const { rel, size, now } of over) console.log(`LARGER ${rel}: ${size} → ${now} bytes`);
console.log(`${count} programs: ${smaller} smaller than stage -1's, ${same} the same, ${larger.length} larger `
  + `(${over.length} by more than ${SLACK} bytes); ${after} bytes against ${before} `
  + `(${((1 - after / before) * 100).toFixed(1)}% smaller); ${grown.length} grown since recorded, in ${seconds} s`);
process.exit(over.length || grown.length || after > before ? 1 : 0);
