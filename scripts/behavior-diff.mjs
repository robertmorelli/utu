// Show where a program's recorded and current behavior dumps differ.
//
//   node scripts/behavior-diff.mjs <substring of the program key> [--limit=N]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, '.tmp', 'behavior');
const wanted = process.argv[2] ?? '';
const limit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.slice(8) ?? 20);
const read = async file => JSON.parse(gunzipSync(await fs.readFile(file)).toString());
const files = (await fs.readdir(path.join(dir, 'current'))).filter(file => file.includes(wanted.replace(/[^a-zA-Z0-9._-]+/g, '_')));
let shown = 0;
for (const file of files) {
  const [was, now] = await Promise.all([read(path.join(dir, 'recorded', file)).catch(() => null), read(path.join(dir, 'current', file))]);
  const walk = (a, b, at) => {
    if (shown >= limit) return;
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], `${at}.${key}`);
      return;
    }
    shown++;
    console.log(`${file} ${at}\n  was ${JSON.stringify(a)?.slice(0, 300)}\n  now ${JSON.stringify(b)?.slice(0, 300)}`);
  };
  walk(was, now, '');
}
if (!shown) console.log('no differences');
