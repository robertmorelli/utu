// The loop-match JSON parser (examples/json/json.utu) against the same state
// machine written as `while` + `match`, generated from the same source so the
// only difference is the dispatch. JSON.parse is shown for reference only: it
// builds objects, the utu parsers only validate and count.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, compileUtu, engine, row, time } from './bench-lib.mjs';

const source = await fs.readFile(path.join(ROOT, 'examples/json/json.utu'), 'utf8');
// `continue N;` re-dispatches; a finished arm leaves the loop, so the while
// version breaks after its match.
const whileSource = source
  .replace('loop match 0 {', 'let state = 0;\n    while (true) {\n    match state {')
  .replace('        ~> {},\n    };', '        ~> {},\n    };\n    break;\n    };')
  .replace(/continue (\d+);/g, '{ state = $1; continue; };');
if (whileSource.includes('loop match 0') || !whileSource.includes('state = 6')) throw new Error('rewrite failed');

// Deterministic document: records with nested arrays, escaped strings, numbers.
let seed = 5;
const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const word = () => Array.from({ length: 3 + Math.floor(random() * 8) }, () => String.fromCharCode(97 + Math.floor(random() * 26))).join('');
const records = [];
while (JSON.stringify(records).length < Number(process.env.BYTES ?? 3_000_000)) {
  records.push({
    id: records.length, name: `${word()} "${word()}"\n${word()}`, score: (random() - 0.5) * 1e6,
    active: random() < 0.5, tags: Array.from({ length: Math.floor(random() * 5) }, word), parent: random() < 0.3 ? null : Math.floor(random() * 1000),
    position: { x: random(), y: -random() * 100, z: Math.floor(random() * 1e9) },
  });
}
const text = JSON.stringify({ version: 1, records }, null, random() < 2 ? 1 : 0);
console.log(`${engine}: ${(text.length / 1e6).toFixed(2)} MB of JSON`);

const values = (v) => (v === null || typeof v !== 'object' ? 1 : 1 + (Array.isArray(v) ? v : Object.values(v)).reduce((a, x) => a + values(x), 0));
const expected = values(JSON.parse(text));
for (const optimize of ['size', 'speed']) {
  for (const [label, code] of [['loop match', source], ['while + match', whileSource]]) {
    const { exports, bytes, gzip } = await compileUtu(`json-${label.replace(/\W/g, '')}-${optimize}`, code, optimize);
    const result = exports.parse(text);
    if (result !== expected) throw new Error(`${label}: ${result} values, expected ${expected}`);
    const ms = time(() => exports.parse(text));
    row(`${label} (${optimize === 'size' ? '-Oz' : '-O3'})`, ms, `${(text.length / 1e6 / (ms / 1000)).toFixed(0).padStart(4)} MB/s   ${bytes} B wasm, ${gzip} B gzip`);
  }
}
const ms = time(() => JSON.parse(text));
row('JSON.parse (builds objects)', ms, `${(text.length / 1e6 / (ms / 1000)).toFixed(0).padStart(4)} MB/s`);
