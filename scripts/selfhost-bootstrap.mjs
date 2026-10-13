// The bootstrap: the self-hosted compiler builds itself, and the compiler it
// builds builds itself to the same bytes.
//
//   node scripts/selfhost-bootstrap.mjs [--out=utu.wasm]
//
// Stage 0 (the JavaScript compiler) builds stage 1 from selfhost/; stage 1
// builds stage 2; stage 2 builds stage 3. Stages 2 and 3 must be identical:
// a compiler that changes what it builds when it is rebuilt by itself is
// miscompiling itself. --out writes stage 2, the compiler to ship.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { buildWith, instantiateBuilt, loadSelfhost } from './selfhost.mjs';

const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
const hash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

let started = performance.now();
const stage1 = await loadSelfhost({ stage: 1 });
const stage1Time = performance.now() - started;
started = performance.now();
const stage2Bytes = await buildWith(stage1);
const stage2Time = performance.now() - started;
const stage2 = (await instantiateBuilt(stage2Bytes)).instance.exports;
started = performance.now();
const stage3Bytes = await buildWith(stage2);
const stage3Time = performance.now() - started;

console.log(`stage 1: built by stage 0 in ${stage1Time.toFixed(0)} ms`);
console.log(`stage 2: ${stage2Bytes.length} bytes (${hash(stage2Bytes)}), built by stage 1 in ${stage2Time.toFixed(0)} ms`);
console.log(`stage 3: ${stage3Bytes.length} bytes (${hash(stage3Bytes)}), built by stage 2 in ${stage3Time.toFixed(0)} ms`);
if (out) fs.writeFileSync(out, stage2Bytes);
if (Buffer.compare(Buffer.from(stage2Bytes), Buffer.from(stage3Bytes)) !== 0) {
  console.log('stage 2 and stage 3 differ: the compiler does not build itself to the same bytes');
  process.exit(1);
}
console.log('stage 2 and stage 3 are identical');
