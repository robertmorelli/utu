// The bootstrap: the self-hosted compiler builds itself, and the compiler it
// builds builds itself to the same bytes.
//
//   node scripts/selfhost-bootstrap.mjs [--out=utu.wasm]
//
// Stage 0 (the JavaScript compiler) builds stage 1 from selfhost/; stage 1
// builds stage 2; stage 2 builds stage 3. Stages 2 and 3 must be identical:
// a compiler that changes what it builds when it is rebuilt by itself is
// miscompiling itself. --out writes stage 2, the compiler to ship, and beside
// it (as NAME.host.json) the spec of what it needs from its host.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildWith, instantiateBuilt, joinSelfhost, loadSelfhost } from './selfhost.mjs';
import { sourcesHash } from '../src/selfhost/node.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/**
 * Stages 1 to 3, timed. Returns stage 2 (its bytes and spec) when it builds
 * itself to the same module; throws otherwise.
 */
export async function bootstrap({ log = console.log } = {}) {
  let started = performance.now();
  const stage1 = await loadSelfhost({ stage: 1 });
  const stage1Time = performance.now() - started;
  started = performance.now();
  const stage2 = await buildWith(stage1);
  const stage2Time = performance.now() - started;
  const compiler = (await instantiateBuilt(stage2.wasm, stage2.spec)).instance.exports;
  started = performance.now();
  const stage3 = await buildWith(compiler);
  const stage3Time = performance.now() - started;
  log(`stage 1: built by stage 0 in ${stage1Time.toFixed(0)} ms`);
  log(`stage 2: ${stage2.wasm.length} bytes (${hash(stage2.wasm)}), built by stage 1 in ${stage2Time.toFixed(0)} ms`);
  log(`stage 3: ${stage3.wasm.length} bytes (${hash(stage3.wasm)}), built by stage 2 in ${stage3Time.toFixed(0)} ms`);
  if (Buffer.compare(Buffer.from(stage2.wasm), Buffer.from(stage3.wasm)) !== 0
      || JSON.stringify(stage2.spec) !== JSON.stringify(stage3.spec)) {
    throw new Error('stage 2 and stage 3 differ: the compiler does not build itself to the same bytes');
  }
  return stage2;
}

/**
 * Write a built compiler: NAME.wasm, and beside it NAME.host.json (its
 * spec) and NAME.sources (the hash of the sources it was built from, so a
 * compiler older than selfhost/ is not loaded).
 */
export function writeCompiler(out, { wasm, spec }) {
  const base = out.replace(/\.wasm$/, '');
  fs.writeFileSync(out, wasm);
  fs.writeFileSync(`${base}.host.json`, JSON.stringify(spec));
  fs.writeFileSync(`${base}.sources`, `${sourcesHash(joinSelfhost().text)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
  try {
    const stage2 = await bootstrap();
    if (out) writeCompiler(out, stage2);
    console.log('stage 2 and stage 3 are identical');
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }
}
