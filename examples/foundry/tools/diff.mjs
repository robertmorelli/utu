// Run a save in the reference simulation and in utu; compare state hashes.
// Usage: node tools/diff.mjs save.json ticks every
import fs from 'node:fs';
import { Sim } from '../js/dist/sim.mjs';
import { createRequire } from 'node:module';
import { compileFoundry } from './compile-utu.mjs';

const { Foundry } = createRequire(import.meta.url)('../rust/pkg-node/foundry.js');

const [file, ticksArg = '600', everyArg = '60'] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8');
const gameText = fs.readFileSync(new URL('../data/game.json', import.meta.url), 'utf8');
const { exports: u, wasm, compileMs } = await compileFoundry();
console.log(`utu module ${wasm.length} B, compiled in ${compileMs.toFixed(0)} ms`);
const world = u.create(gameText, text);
if (!world) throw new Error(u.load_error(gameText, text));
const ref = Sim.load(JSON.parse(text));
const rust = new Foundry(gameText, text);
const check = label => {
  const a = ref.hash() >>> 0, b = u.state_hash(world) >>> 0, c = rust.hash() >>> 0;
  if (a !== c) {
    console.log(`MISMATCH (Rust) at ${label}: reference ${a.toString(16)} rust ${c.toString(16)}`);
    const mine = JSON.parse(rust.save()), theirs = ref.save();
    let shown = 0;
    for (let i = 0; i < theirs.entities.length && shown < 5; i++) {
      const x = theirs.entities[i], y = mine.entities[i];
      for (const k of Object.keys(x)) {
        if (JSON.stringify(x[k]) !== JSON.stringify(y?.[k])) { console.log(`  entity ${x.id} (machine ${x.machine}) ${k}: ${JSON.stringify(x[k])} ≠ ${JSON.stringify(y?.[k])}`); shown++; }
      }
    }
    process.exit(1);
  }
  if (a !== b) {
    console.log(`MISMATCH at ${label}: reference ${a.toString(16)} utu ${b.toString(16)}`);
    const mine = JSON.parse(u.save_text(world)), theirs = ref.save();
    for (const key of ['tick', 'nextId', 'research']) if (JSON.stringify(mine[key]) !== JSON.stringify(theirs[key])) console.log(' ', key, JSON.stringify(theirs[key]), '≠', JSON.stringify(mine[key]));
    let shown = 0;
    for (let i = 0; i < theirs.entities.length && shown < 5; i++) {
      const x = theirs.entities[i], y = mine.entities[i];
      for (const k of Object.keys(x)) {
        if (JSON.stringify(x[k]) !== JSON.stringify(y?.[k])) { console.log(`  entity ${x.id} (machine ${x.machine}) ${k}: ${JSON.stringify(x[k])} ≠ ${JSON.stringify(y?.[k])}`); shown++; }
      }
    }
    process.exit(1);
  }
};
check('load');
const ticks = Number(ticksArg), every = Number(everyArg);
for (let t = every; t <= ticks; t += every) {
  for (let k = 0; k < every; k++) ref.step();
  u.run(world, every);
  rust.run(every);
  check(`tick ${t}`);
}
console.log(`TypeScript, utu, and Rust identical through ${ticks} ticks (${u.entity_count(world)} entities, hash ${(ref.hash() >>> 0).toString(16)})`);
