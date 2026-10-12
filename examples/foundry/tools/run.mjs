// Run a save headlessly with the reference simulation.
// Usage: node tools/run.mjs save.json ticks [checkpoint]
import fs from 'node:fs';
import { Sim, GAME, Cls } from '../js/dist/sim.mjs';

const [file, ticksArg = '3600', everyArg = '600'] = process.argv.slice(2);
const sim = Sim.load(JSON.parse(fs.readFileSync(file, 'utf8')));
const ticks = Number(ticksArg), every = Number(everyArg);
const start = performance.now();
for (let t = 1; t <= ticks; t++) {
  sim.step();
  if (t % every === 0) console.log(`tick ${sim.tick} hash ${sim.hash().toString(16).padStart(8, '0')}`);
}
const ms = performance.now() - start;
console.log(`${sim.entities.length} entities, ${ticks} ticks in ${ms.toFixed(0)} ms (${(ms / ticks).toFixed(3)} ms/tick)`);
const busy = new Map();
for (const e of sim.entities) if (e.busy) busy.set(GAME.machines[e.machine].name, (busy.get(GAME.machines[e.machine].name) ?? 0) + 1);
console.log('satisfaction', sim.satisfaction, 'demand', sim.demand, 'supply', sim.supply, 'research', JSON.stringify(sim.research));
console.log('busy:', [...busy].map(([k, v]) => `${k} ${v}`).join(', '));
console.log('produced:', GAME.items.map((it, i) => [it.name, sim.produced[i]]).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', '));
