// Ticks per second for the simulation in each implementation, on one save.
// Usage: node tools/bench-sim.mjs save.json ticks
import fs from 'node:fs';
import { Sim } from '../js/dist/sim.mjs';
import { createRequire } from 'node:module';
import { compileFoundry } from './compile-utu.mjs';

const { Foundry } = createRequire(import.meta.url)('../rust/pkg-node/foundry.js');

const [file, ticksArg = '1200'] = process.argv.slice(2);
const ticks = Number(ticksArg);
const text = fs.readFileSync(file, 'utf8');
const gameText = fs.readFileSync(new URL('../data/game.json', import.meta.url), 'utf8');

function measure(label, make, run, hash) {
  // Warm up on a separate world, then time a fresh one.
  const warm = make();
  run(warm, Math.min(600, ticks));
  const world = make();
  const start = performance.now();
  run(world, ticks);
  const ms = performance.now() - start;
  console.log(`${label.padEnd(12)} ${(ms / ticks).toFixed(3)} ms/tick  hash ${(hash(world) >>> 0).toString(16)}`);
  return ms / ticks;
}

const results = {};
results.rust = measure('Rust (wasm)', () => new Foundry(gameText, text), (w, n) => w.run(n), w => w.hash());
results.ts = measure('TypeScript', () => Sim.load(JSON.parse(text)), (w, n) => { for (let i = 0; i < n; i++) w.step(); }, w => w.hash());
for (const optimize of ['size', 'speed']) {
  const { exports: u } = await compileFoundry('headless.utu', { optimize });
  results[optimize] = measure(`utu ${optimize === 'size' ? '-Oz' : '-O3'}`, () => u.create(gameText, text), (w, n) => u.run(w, n), w => u.state_hash(w));
}
console.log(JSON.stringify(results));
