// Update stage 0, the checked-in compiler that builds stage 1 (stage0/utu.wasm,
// and its host spec beside it): it becomes the compiler `bun run build` last
// built (dist/utu.wasm), which must be built from selfhost/ as it is.
//
//   node scripts/stage0.mjs
//
// Run it when stage 0 can no longer build selfhost/ (the build then says so
// and falls back to stage -1, the JavaScript compiler), or to keep stage 0
// near the compiler it builds.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { joinSelfhost, STAGE0 } from './selfhost.mjs';
import { sourcesRecord } from '../src/selfhost/node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const hash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

let built;
try { built = JSON.parse(fs.readFileSync(path.join(DIST, 'utu.sources'), 'utf8')); } catch {}
if (built?.hash !== sourcesRecord(joinSelfhost().text).hash) {
  console.error('dist/utu.wasm is not built from selfhost/ as it is: run `bun run build` first');
  process.exit(1);
}
const wasm = fs.readFileSync(path.join(DIST, 'utu.wasm'));
const old = fs.existsSync(STAGE0) ? fs.readFileSync(STAGE0) : null;
fs.mkdirSync(path.dirname(STAGE0), { recursive: true });
fs.writeFileSync(STAGE0, wasm);
fs.copyFileSync(path.join(DIST, 'utu.host.json'), STAGE0.replace(/\.wasm$/, '.host.json'));
console.log(old && Buffer.compare(old, wasm) === 0
  ? `stage 0 is already dist/utu.wasm (${hash(wasm)})`
  : `stage 0: ${old ? `${old.length} bytes (${hash(old)}) → ` : ''}${wasm.length} bytes (${hash(wasm)})`);
