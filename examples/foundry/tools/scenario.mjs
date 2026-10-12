// Deterministic Foundry scenarios, built with the reference simulation's own
// placement rules. Usage: node tools/scenario.mjs <name> [blocks] > save.json
//   starter    — an empty 96×96 map with ore, oil, and a lake
//   factory    — `blocks` (default 600) self-contained production blocks
import { Sim, M, I, GAME } from '../js/dist/sim.mjs';

const [name = 'factory', blocksArg = '600'] = process.argv.slice(2);
const E = 1, S = 2, W = 3, N = 0;

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
}

function revealAll(sim) { sim.revealed.fill(1); }
function ore(sim, x, y, item, amount) {
  sim.resKind[y * sim.width + x] = item;
  sim.resAmount[y * sim.width + x] = amount;
}
function unlockEverything(sim) {
  for (let t = 0; t < GAME.techs.length - 1; t++) sim.complete(t);
}
function put(sim, machine, x, y, dir, setup) {
  if (!sim.canPlace(M[machine], x, y, dir)) throw new Error(`cannot place ${machine} at ${x},${y}`);
  const e = sim.place(M[machine], x, y, dir);
  setup?.(e);
  return e;
}
const fill = (e, item, count) => { e.inv[item] = count; };

// ── blocks (12 × 4 tiles each) ───────────────────────────────────────────────

function smeltingLine(sim, bx, by, oreItem, recipe) {
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) ore(sim, bx + dx, by + dy, oreItem, 4000);
  put(sim, 'electric-miner', bx + 1, by + 1, E);
  put(sim, 'belt', bx + 2, by + 1, E);
  put(sim, 'belt', bx + 3, by + 1, E);
  put(sim, 'fast-belt', bx + 4, by + 1, E);
  put(sim, 'inserter', bx + 5, by + 1, E);
  put(sim, 'electric-furnace', bx + 6, by + 1, E);
  put(sim, 'fast-inserter', bx + 7, by + 1, E);
  put(sim, 'assembler-2', bx + 8, by + 1, E, e => { e.recipe = recipe; });
  put(sim, 'beacon', bx + 8, by, E);
  put(sim, 'inserter', bx + 9, by + 1, E);
  put(sim, 'steel-chest', bx + 10, by + 1, E);
  // The output inserter runs while the control chest holds more than 10 coal.
  put(sim, 'wooden-chest', bx + 10, by + 2, E, e => fill(e, I['coal'], 30));
  put(sim, 'decider-combinator', bx + 9, by + 2, W, e => { e.condItem = I['coal']; e.condOp = 0; e.condValue = 10; });
  put(sim, 'lamp', bx + 9, by + 3, E);
}

function scienceBlock(sim, bx, by) {
  for (let row = 0; row < 3; row++) {
    put(sim, 'steel-chest', bx + 1, by + row, E, e => { fill(e, I['red-science'], 600); fill(e, I['green-science'], 600); fill(e, I['blue-science'], 600); });
    put(sim, row === 1 ? 'stack-inserter' : 'fast-inserter', bx + 2, by + row, E);
    put(sim, 'lab', bx + 3, by + row, E);
  }
  put(sim, 'radar', bx + 5, by + 1, E);
  put(sim, 'assembler-1', bx + 7, by + 1, E, e => { e.recipe = 4; fill(e, I['iron-plate'], 4); });
  put(sim, 'long-inserter', bx + 9, by + 1, E);
  put(sim, 'wooden-chest', bx + 11, by + 1, E);
  put(sim, 'filter-inserter', bx + 8, by + 1, E, e => { e.pick = I['iron-gear']; });
}

function oilBlock(sim, bx, by) {
  ore(sim, bx + 1, by + 1, I['crude-oil'], 60000);
  put(sim, 'pumpjack', bx + 1, by + 1, E);
  put(sim, 'pipe', bx + 2, by + 1, E);
  put(sim, 'pipe', bx + 3, by + 1, E);
  put(sim, 'oil-refinery', bx + 4, by + 1, E, e => { e.recipe = 16; });
  put(sim, 'pipe', bx + 5, by + 1, E);
  put(sim, 'storage-tank', bx + 6, by + 1, E);
  put(sim, 'pipe', bx + 6, by + 2, E);
  put(sim, 'chemical-plant', bx + 7, by + 1, E, e => { e.recipe = 13; });
  put(sim, 'inserter', bx + 7, by + 2, N);
  put(sim, 'wooden-chest', bx + 7, by + 3, E, e => fill(e, I['coal'], 400));
  put(sim, 'inserter', bx + 8, by + 1, E);
  put(sim, 'steel-chest', bx + 9, by + 1, E);
  put(sim, 'centrifuge', bx + 10, by + 2, E, e => { e.recipe = 17; fill(e, I['uranium-ore'], 20); });
}

function powerBlock(sim, bx, by) {
  for (let y = by; y < by + 4; y++) sim.water[y * sim.width + bx] = 1;
  put(sim, 'offshore-pump', bx + 1, by + 1, W);
  put(sim, 'pipe', bx + 2, by + 1, E);
  put(sim, 'pipe', bx + 3, by + 1, E);
  put(sim, 'pipe', bx + 3, by + 2, E);
  put(sim, 'steam-engine', bx + 4, by + 1, E);
  put(sim, 'steam-engine', bx + 4, by + 2, E);
  put(sim, 'inserter', bx + 5, by + 1, W);
  put(sim, 'inserter', bx + 5, by + 2, W);
  put(sim, 'steel-chest', bx + 6, by + 1, E, e => fill(e, I['coal'], 2000));
  put(sim, 'steel-chest', bx + 6, by + 2, E, e => fill(e, I['coal'], 2000));
  for (let dx = 7; dx < 12; dx++) {
    put(sim, 'solar-panel', bx + dx, by, E);
    put(sim, 'solar-panel', bx + dx, by + 3, E);
  }
  for (let dx = 7; dx < 11; dx++) put(sim, 'accumulator', bx + dx, by + 1, E);
}

function beltBlock(sim, bx, by) {
  for (let dy = 0; dy < 2; dy++) ore(sim, bx, by + dy, I['stone'], 3000);
  put(sim, 'burner-miner', bx, by, S, e => { e.fuel = 5; });
  put(sim, 'burner-miner', bx, by + 1, E, e => { e.fuel = 5; });
  put(sim, 'belt', bx + 1, by + 1, E);
  put(sim, 'splitter', bx + 2, by + 1, E);
  put(sim, 'underground-belt', bx + 3, by + 1, E);
  put(sim, 'underground-belt', bx + 6, by + 1, E, e => { e.role = 1; });
  put(sim, 'express-belt', bx + 7, by + 1, E);
  put(sim, 'inserter', bx + 8, by + 1, E);
  put(sim, 'stone-furnace', bx + 9, by + 1, E, e => { e.fuel = 5; });
  put(sim, 'inserter', bx + 10, by + 1, E);
  put(sim, 'wooden-chest', bx + 11, by + 1, E);
  // The splitter's side output loops back into a chest.
  put(sim, 'belt', bx + 3, by + 2, E);
  put(sim, 'inserter', bx + 4, by + 2, E);
  put(sim, 'wooden-chest', bx + 5, by + 2, E);
  put(sim, 'steel-furnace', bx + 9, by + 3, E, e => { e.fuel = 5; fill(e, I['iron-plate'], 10); e.recipe = 3; });
  put(sim, 'requester-chest', bx + 11, by + 3, E);
}

function factory(blocks) {
  const columns = 8;
  const rows = Math.ceil(blocks / columns);
  const sim = new Sim(columns * 12, rows * 4);
  revealAll(sim);
  unlockEverything(sim);
  const kinds = [
    (x, y) => smeltingLine(sim, x, y, I['iron-ore'], 4),
    (x, y) => smeltingLine(sim, x, y, I['copper-ore'], 5),
    (x, y) => powerBlock(sim, x, y),
    (x, y) => smeltingLine(sim, x, y, I['iron-ore'], 4),
    (x, y) => scienceBlock(sim, x, y),
    (x, y) => powerBlock(sim, x, y),
    (x, y) => oilBlock(sim, x, y),
    (x, y) => beltBlock(sim, x, y),
  ];
  for (let b = 0; b < blocks; b++) kinds[b % kinds.length]((b % columns) * 12, Math.floor(b / columns) * 4);
  sim.research = { current: GAME.techs.length - 1, progress: 0 };
  return sim;
}

function starter() {
  const size = 96;
  const sim = new Sim(size, size);
  const random = lcg(7);
  const patch = (cx, cy, item, radius, amount) => {
    for (let y = cy - radius; y <= cy + radius; y++) for (let x = cx - radius; x <= cx + radius; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius && sim.inside(x, y)) ore(sim, x, y, item, amount + Math.floor(random() * 500));
    }
  };
  patch(30, 30, I['iron-ore'], 6, 3000);
  patch(60, 28, I['copper-ore'], 5, 3000);
  patch(40, 60, I['coal'], 5, 3000);
  patch(66, 62, I['stone'], 4, 2000);
  patch(20, 70, I['uranium-ore'], 3, 1500);
  for (const [x, y] of [[75, 40], [78, 44], [72, 46]]) ore(sim, x, y, I['crude-oil'], 60000);
  for (let y = 40; y < 56; y++) for (let x = 6; x < 14; x++) if ((x - 10) ** 2 / 16 + (y - 48) ** 2 / 64 <= 1) sim.water[y * size + x] = 1;
  for (let cy = 2; cy < 10; cy++) for (let cx = 0; cx < 10; cx++) sim.revealed[cy * sim.chunksX + cx] = 1;
  return sim;
}

const sim = name === 'starter' ? starter() : factory(Number(blocksArg));
process.stdout.write(JSON.stringify(sim.save()));
