// Foundry simulation: the TypeScript reference implementation of SPEC.md.
import game from '../../data/game.json';

export type Game = typeof game;
export const GAME: Game = game;
export const ITEM_COUNT = game.items.length;

export const enum Cls {
  Miner, Pump, Furnace, Assembler, Chemical, Refinery, Centrifuge,
  Belt, Splitter, Underground, Pipe, Inserter, Chest, Steam, Solar,
  Accumulator, Lab, Radar, Beacon, Combinator, Lamp, Silo,
}

const CLASS_NAMES = ['miner', 'pump', 'furnace', 'assembler', 'chemical', 'refinery', 'centrifuge',
  'belt', 'splitter', 'underground', 'pipe', 'inserter', 'chest', 'steam', 'solar',
  'accumulator', 'lab', 'radar', 'beacon', 'combinator', 'lamp', 'silo'];
export const MACHINE_CLASS: Cls[] = game.machines.map(m => CLASS_NAMES.indexOf(m.class) as Cls);
const SPEED = game.machines.map(m => m.speed);
const POWER = game.machines.map(m => m.power);
const BURNER = game.machines.map(m => m.burner);
const REACH = game.machines.map(m => (m as { reach?: number }).reach ?? 1);
const FLUID = game.items.map(i => i.fluid);
export const M = Object.fromEntries(game.machines.map((m, i) => [m.name, i])) as Record<string, number>;
export const I = Object.fromEntries(game.items.map((m, i) => [m.name, i])) as Record<string, number>;

const COAL = I['coal'], WATER = I['water'], CRUDE = I['crude-oil'];
const RED = I['red-science'], U238 = I['uranium-238'], U235 = I['uranium-235'];
const ROCKET_PART = 18;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

export const isCrafter = (c: Cls) => c >= Cls.Furnace && c <= Cls.Centrifuge;
export const isBeltLike = (c: Cls) => c >= Cls.Belt && c <= Cls.Underground;
const hasInventory = (c: Cls) => isCrafter(c) || c === Cls.Chest || c === Cls.Lab || c === Cls.Silo;

export class Entity {
  cls: Cls;
  recipe = -1; progress = 0; busy = false; fuel = 0; burn = 0; heat = 0;
  inv: number[] | null = null; out: number[] | null = null; belt: number[] | null = null;
  state = 0; timer = 0; hand = -1; held = 0; pick = -1; stack = 1; priority = 0; toggle = 0; role = 0;
  fluid = -1; amount = 0; charge = 0; condItem = 0; condOp = 0; condValue = 0; signal = false;
  crafts = 0; moved = 0;

  constructor(public id: number, public machine: number, public x: number, public y: number, public dir: number) {
    this.cls = MACHINE_CLASS[machine];
    if (hasInventory(this.cls)) this.inv = new Array(ITEM_COUNT).fill(0);
    if (isCrafter(this.cls)) this.out = new Array(ITEM_COUNT).fill(0);
    if (isBeltLike(this.cls)) this.belt = [];
    if (machine === M['stack-inserter']) this.stack = 4;
    if (machine === M['steel-furnace']) this.heat = 20;
  }
}

export type Command =
  | { kind: 'place'; machine: number; x: number; y: number; dir: number }
  | { kind: 'remove' | 'rotate' | 'launch'; x: number; y: number }
  | { kind: 'recipe' | 'filter' | 'priority' | 'stack' | 'role'; x: number; y: number; value: number }
  | { kind: 'condition'; x: number; y: number; item: number; op: number; value: number }
  | { kind: 'research'; tech: number };

export interface SaveEntity {
  id: number; machine: number; x: number; y: number; dir: number;
  recipe: number; progress: number; busy: boolean; fuel: number; burn: number; heat: number;
  inv: number[] | null; out: number[] | null; belt: number[] | null;
  state: number; timer: number; hand: number; held: number; pick: number; stack: number;
  priority: number; toggle: number; role: number; fluid: number; amount: number; charge: number;
  condItem: number; condOp: number; condValue: number; signal: boolean; crafts: number; moved: number;
}

export interface Save {
  version: number; tick: number; width: number; height: number; nextId: number;
  terrain: string; resources: number[][]; revealed: string;
  research: { current: number; progress: number; done: number[] };
  entities: SaveEntity[];
}

export class Sim {
  tick = 0;
  nextId = 1;
  satisfaction = 1000;
  light = 0;
  demand = 0;
  supply = 0;
  water: Uint8Array;
  resKind: Int32Array;
  resAmount: Int32Array;
  revealed: Uint8Array;
  chunksX: number;
  chunksY: number;
  grid: (Entity | null)[];
  entities: Entity[] = [];
  /** Entities by class, and the multi-class groups the tick visits, all in id order. */
  byClass: Entity[][] = [];
  crafterList: Entity[] = [];
  beltList: Entity[] = [];
  fluidMachineList: Entity[] = [];
  research = { current: -1, progress: 0 };
  done: boolean[] = game.techs.map(() => false);
  machineUnlocked: boolean[] = game.machines.map(() => false);
  recipeUnlocked: boolean[] = game.recipes.map(() => false);
  /** Items produced (mined, pumped, crafted), cumulative per item. */
  produced = new Float64Array(ITEM_COUNT);
  commands: Command[] = [];

  constructor(public width: number, public height: number) {
    const tiles = width * height;
    this.water = new Uint8Array(tiles);
    this.resKind = new Int32Array(tiles).fill(-1);
    this.resAmount = new Int32Array(tiles);
    this.chunksX = Math.ceil(width / 8);
    this.chunksY = Math.ceil(height / 8);
    this.revealed = new Uint8Array(this.chunksX * this.chunksY);
    this.grid = new Array(tiles).fill(null);
    for (const m of game.start.machines) this.machineUnlocked[m] = true;
    for (const r of game.start.recipes) this.recipeUnlocked[r] = true;
    this.rebuildClasses();
  }

  // ── queries ───────────────────────────────────────────────────────────────

  at(x: number, y: number): Entity | null {
    return x >= 0 && y >= 0 && x < this.width && y < this.height ? this.grid[y * this.width + x] : null;
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isRevealed(x: number, y: number) {
    return this.revealed[(y >> 3) * this.chunksX + (x >> 3)] === 1;
  }

  front(e: Entity, distance = 1) {
    return this.at(e.x + DX[e.dir] * distance, e.y + DY[e.dir] * distance);
  }

  back(e: Entity, distance = 1) {
    return this.at(e.x - DX[e.dir] * distance, e.y - DY[e.dir] * distance);
  }

  neighbors(e: Entity): (Entity | null)[] {
    return [this.at(e.x, e.y - 1), this.at(e.x + 1, e.y), this.at(e.x, e.y + 1), this.at(e.x - 1, e.y)];
  }

  // ── placing ───────────────────────────────────────────────────────────────

  canPlace(machine: number, x: number, y: number, dir: number): boolean {
    if (!this.inside(x, y) || !this.isRevealed(x, y) || this.water[y * this.width + x] || this.at(x, y)) return false;
    if (!this.machineUnlocked[machine]) return false;
    const tile = y * this.width + x;
    if (machine === M['burner-miner']) return this.resKind[tile] >= 0 && !FLUID[this.resKind[tile]] && this.resAmount[tile] > 0;
    if (machine === M['electric-miner']) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!this.inside(x + dx, y + dy)) continue;
        const t = (y + dy) * this.width + x + dx;
        if (this.resKind[t] >= 0 && !FLUID[this.resKind[t]] && this.resAmount[t] > 0) return true;
      }
      return false;
    }
    if (machine === M['pumpjack']) return this.resKind[tile] === CRUDE;
    if (machine === M['offshore-pump']) {
      const fx = x + DX[dir], fy = y + DY[dir];
      return this.inside(fx, fy) && this.water[fy * this.width + fx] === 1;
    }
    return true;
  }

  place(machine: number, x: number, y: number, dir: number): Entity {
    const e = new Entity(this.nextId++, machine, x, y, dir);
    this.entities.push(e);
    this.grid[y * this.width + x] = e;
    // The new id is the largest, so appending keeps every list in id order.
    for (const list of this.listsOf(e)) list.push(e);
    return e;
  }

  remove(e: Entity) {
    this.entities.splice(this.entities.indexOf(e), 1);
    this.grid[e.y * this.width + e.x] = null;
    for (const list of this.listsOf(e)) list.splice(list.indexOf(e), 1);
  }

  listsOf(e: Entity): Entity[][] {
    const lists = [this.byClass[e.cls]];
    if (isCrafter(e.cls)) lists.push(this.crafterList);
    if (isBeltLike(e.cls)) lists.push(this.beltList);
    if (e.cls === Cls.Chemical || e.cls === Cls.Refinery || e.cls === Cls.Steam) lists.push(this.fluidMachineList);
    return lists;
  }

  rebuildClasses() {
    this.byClass = CLASS_NAMES.map(() => []);
    this.crafterList = [];
    this.beltList = [];
    this.fluidMachineList = [];
    for (const e of this.entities) for (const list of this.listsOf(e)) list.push(e);
  }

  // ── commands ──────────────────────────────────────────────────────────────

  apply(c: Command) {
    if (c.kind === 'research') {
      const tech = game.techs[c.tech];
      if (tech && !this.done[c.tech] && tech.prereqs.every(p => this.done[p])) this.research = { current: c.tech, progress: 0 };
      return;
    }
    if (c.kind === 'place') {
      if (this.canPlace(c.machine, c.x, c.y, c.dir)) this.place(c.machine, c.x, c.y, c.dir);
      return;
    }
    const e = this.at(c.x, c.y);
    if (!e) return;
    switch (c.kind) {
      case 'remove': this.remove(e); break;
      case 'rotate': e.dir = (e.dir + 1) % 4; break;
      case 'launch': if (e.cls === Cls.Silo && e.held === 20) { e.held = 0; e.crafts += 1; } break;
      case 'recipe': if (this.recipeAllowed(e, c.value)) { e.recipe = c.value; e.busy = false; e.progress = 0; } break;
      case 'filter': e.pick = c.value; break;
      case 'priority': e.priority = c.value; break;
      case 'stack': e.stack = Math.max(1, Math.min(4, c.value)); break;
      case 'role': e.role = c.value; break;
      case 'condition': e.condItem = c.item; e.condOp = c.op; e.condValue = c.value; break;
    }
  }

  recipeAllowed(e: Entity, r: number): boolean {
    const recipe = game.recipes[r];
    if (!recipe || !this.recipeUnlocked[r]) return false;
    const category = { [Cls.Assembler]: 'crafting', [Cls.Chemical]: 'chemistry', [Cls.Refinery]: 'refining', [Cls.Centrifuge]: 'centrifuge' }[e.cls as number];
    if (recipe.category !== category) return false;
    return e.machine !== M['assembler-1'] || recipe.ingredients.length <= 2;
  }

  // ── inserting ─────────────────────────────────────────────────────────────

  /** How many of `n` `item` the entity takes; with `commit`, take them. */
  insert(e: Entity, item: number, n: number, commit: boolean): number {
    if (n <= 0) return 0;
    const c = e.cls;
    if (isBeltLike(c)) {
      const belt = e.belt!;
      if (belt.length > 0 && belt[belt.length - 1] < 64) return 0;
      if (commit) belt.push(item, 0);
      return 1;
    }
    if (c === Cls.Chest) {
      const inv = e.inv!;
      let used = 0;
      for (let i = 0; i < ITEM_COUNT; i++) used += Math.ceil(inv[i] / 50);
      const partial = inv[item] % 50;
      const room = (SPEED[e.machine] - used) * 50 + (partial > 0 ? 50 - partial : 0);
      const taken = Math.max(0, Math.min(n, room));
      if (commit) inv[item] += taken;
      return taken;
    }
    if (isCrafter(c)) {
      const inv = e.inv!;
      let recipe = e.recipe;
      if (recipe < 0 && c === Cls.Furnace && inv.every(v => v === 0)) {
        recipe = game.recipes.findIndex(r => r.category === 'smelting' && r.ingredients.length === 1 && r.ingredients[0][0] === item);
      }
      if (recipe >= 0) {
        const ingredient = game.recipes[recipe].ingredients.find(([i]) => i === item);
        if (ingredient) {
          const taken = Math.max(0, Math.min(n, 2 * ingredient[1] - inv[item]));
          if (commit && taken > 0) { inv[item] += taken; e.recipe = recipe; }
          return taken;
        }
      }
      if (BURNER[e.machine] && item === COAL) return this.fuelUp(e, n, commit);
      return 0;
    }
    if (c === Cls.Lab) {
      const r = this.research.current;
      if (r < 0 || this.done[r] || item < RED || item > RED + 2 || game.techs[r].packs[item - RED] === 0) return 0;
      const taken = Math.max(0, Math.min(n, 4 - e.inv![item]));
      if (commit) e.inv![item] += taken;
      return taken;
    }
    if (c === Cls.Silo) {
      const ingredient = game.recipes[ROCKET_PART].ingredients.find(([i]) => i === item);
      if (!ingredient) return 0;
      const taken = Math.max(0, Math.min(n, 2 * ingredient[1] - e.inv![item]));
      if (commit) e.inv![item] += taken;
      return taken;
    }
    if ((c === Cls.Steam || e.machine === M['burner-miner']) && item === COAL) return this.fuelUp(e, n, commit);
    return 0;
  }

  fuelUp(e: Entity, n: number, commit: boolean) {
    const taken = Math.max(0, Math.min(n, 5 - e.fuel));
    if (commit) e.fuel += taken;
    return taken;
  }

  pushFluid(amount: number, fluid: number, t: Entity): number {
    if (t.cls !== Cls.Pipe || (t.fluid !== fluid && t.fluid !== -1) || amount <= 0) return 0;
    const moved = Math.min(amount, SPEED[t.machine] - t.amount);
    if (moved <= 0) return 0;
    t.amount += moved;
    t.fluid = fluid;
    return moved;
  }

  // ── the tick ──────────────────────────────────────────────────────────────

  step() {
    for (const c of this.commands.splice(0)) this.apply(c);
    this.power();
    this.signals();
    this.fluids();
    for (const e of this.byClass[Cls.Miner]) this.mine(e);
    for (const e of this.crafterList) this.craft(e);
    for (const e of this.byClass[Cls.Lab]) this.lab(e);
    for (const e of this.byClass[Cls.Silo]) this.silo(e);
    for (const e of this.byClass[Cls.Radar]) this.radar(e);
    for (const e of this.byClass[Cls.Inserter]) this.insert1(e);
    for (const e of this.beltList) this.moveBelt(e);
    this.tick += 1;
  }

  power() {
    const p = this.tick % 25200;
    this.light = p < 2520 ? Math.floor(p * 1000 / 2520) : p < 12600 ? 1000 : p < 15120 ? Math.floor((15120 - p) * 1000 / 2520) : 0;
    let demand = 0;
    for (const e of this.entities) {
      if (e.busy || e.cls === Cls.Radar || e.cls === Cls.Beacon) demand += POWER[e.machine];
    }
    let supply = 0;
    for (const e of this.byClass[Cls.Steam]) {
      if (demand > 0 && e.amount >= 1 && (e.burn > 0 || e.fuel > 0)) {
        if (e.burn === 0) { e.fuel -= 1; e.burn = 900; }
        e.burn -= 1;
        e.amount -= 1;
        supply += 900;
        e.busy = true;
      } else {
        e.busy = false;
      }
    }
    supply += this.byClass[Cls.Solar].length * Math.floor(60 * this.light / 1000);
    if (supply > demand) {
      let excess = supply - demand;
      for (const e of this.byClass[Cls.Accumulator]) {
        const c = Math.min(300, 5000 - e.charge, excess);
        e.charge += c;
        excess -= c;
      }
    } else if (supply < demand) {
      let deficit = demand - supply;
      for (const e of this.byClass[Cls.Accumulator]) {
        const d = Math.min(300, e.charge, deficit);
        e.charge -= d;
        deficit -= d;
        supply += d;
      }
    }
    this.demand = demand;
    this.supply = supply;
    this.satisfaction = demand === 0 ? 1000 : Math.min(1000, Math.floor(supply * 1000 / demand));
  }

  signals() {
    for (const e of this.byClass[Cls.Combinator]) {
      const source = this.back(e);
      let count = 0;
      if (source?.inv) count = source.inv[e.condItem];
      else if (source?.belt) for (let i = 0; i < source.belt.length; i += 2) if (source.belt[i] === e.condItem) count++;
      e.signal = e.condOp === 0 ? count > e.condValue : e.condOp === 1 ? count < e.condValue : count === e.condValue;
    }
    for (const e of this.byClass[Cls.Lamp]) {
      e.signal = this.neighbors(e).some(n => n?.cls === Cls.Combinator && n.signal);
    }
  }

  fluids() {
    for (const e of this.byClass[Cls.Pump]) {
      if (e.machine === M['offshore-pump']) {
        const fx = e.x + DX[e.dir], fy = e.y + DY[e.dir];
        const target = this.back(e);
        let pushed = 0;
        if (this.inside(fx, fy) && this.water[fy * this.width + fx] && target) pushed = this.pushFluid(10, WATER, target);
        e.busy = pushed > 0;
        if (pushed) this.produced[WATER] += pushed;
        continue;
      }
      // pumpjack
      const tile = e.y * this.width + e.x;
      if (this.resKind[tile] === CRUDE) {
        const yieldPerMille = Math.max(100, Math.min(1000, Math.floor(this.resAmount[tile] / 100)));
        const rate = Math.floor(yieldPerMille * this.satisfaction / 1000);
        if (e.amount < 100 && rate > 0) {
          e.progress += rate;
          e.busy = true;
          if (e.progress >= 6000) {
            e.progress -= 6000;
            e.amount += 1;
            this.produced[CRUDE] += 1;
            if (this.resAmount[tile] > 0) this.resAmount[tile] -= 1;
          }
        } else {
          e.busy = false;
        }
      } else {
        e.busy = false;
      }
      const target = this.front(e);
      if (target) e.amount -= this.pushFluid(e.amount, CRUDE, target);
    }
    for (const a of this.byClass[Cls.Pipe]) {
      for (const b of this.neighbors(a)) {
        if (!b || b.cls !== Cls.Pipe || b.id <= a.id) continue;
        if (a.fluid >= 0 && b.fluid >= 0 && a.fluid !== b.fluid) continue;
        const f = a.fluid >= 0 ? a.fluid : b.fluid;
        if (f < 0) continue;
        const capA = SPEED[a.machine], capB = SPEED[b.machine];
        const total = a.amount + b.amount;
        a.amount = Math.floor(total * capA / (capA + capB));
        b.amount = total - a.amount;
        a.fluid = a.amount > 0 ? f : -1;
        b.fluid = b.amount > 0 ? f : -1;
      }
    }
    for (const e of this.fluidMachineList) {
      const neighbors = this.neighbors(e);
      if (e.cls === Cls.Steam) {
        for (const n of neighbors) {
          if (!n || n.cls !== Cls.Pipe || n.fluid !== WATER) continue;
          const take = Math.min(n.amount, 100 - e.amount);
          if (take <= 0) continue;
          n.amount -= take;
          e.amount += take;
          if (n.amount === 0) n.fluid = -1;
        }
        continue;
      }
      if (e.recipe < 0) continue;
      const recipe = game.recipes[e.recipe];
      for (const [f, need] of recipe.ingredients) {
        if (!FLUID[f]) continue;
        for (const n of neighbors) {
          if (!n || n.cls !== Cls.Pipe || n.fluid !== f) continue;
          const take = Math.min(n.amount, 2 * need - e.inv![f]);
          if (take <= 0) continue;
          n.amount -= take;
          e.inv![f] += take;
          if (n.amount === 0) n.fluid = -1;
        }
      }
      for (const [f] of recipe.products) {
        if (!FLUID[f]) continue;
        for (const n of neighbors) if (n) e.out![f] -= this.pushFluid(e.out![f], f, n);
      }
    }
  }

  miningTile(e: Entity): number {
    const ok = (t: number) => this.resKind[t] >= 0 && !FLUID[this.resKind[t]] && this.resAmount[t] > 0 && (e.held === 0 || this.resKind[t] === e.hand);
    if (e.machine === M['burner-miner']) {
      const t = e.y * this.width + e.x;
      return ok(t) ? t : -1;
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.inside(e.x + dx, e.y + dy)) continue;
        const t = (e.y + dy) * this.width + e.x + dx;
        if (ok(t)) return t;
      }
    }
    return -1;
  }

  mine(e: Entity) {
    const tile = this.miningTile(e);
    if (tile >= 0 && e.held < 5) {
      let rate: number;
      if (BURNER[e.machine]) {
        if (e.burn === 0 && e.fuel > 0) { e.fuel -= 1; e.burn = 3600; }
        rate = 0;
        if (e.burn > 0) { rate = SPEED[e.machine]; e.burn -= 1; }
      } else {
        rate = Math.floor(SPEED[e.machine] * this.satisfaction / 1000);
      }
      e.progress += rate;
      e.busy = rate > 0;
      if (e.progress >= 60000) {
        e.progress = 0;
        e.hand = this.resKind[tile];
        this.produced[e.hand] += 1;
        this.resAmount[tile] -= 1;
        if (this.resAmount[tile] === 0) this.resKind[tile] = -1;
        e.held += 1;
      }
    } else {
      e.busy = false;
    }
    if (e.held > 0) {
      const target = this.front(e);
      if (target && this.insert(target, e.hand, 1, true) === 1) {
        e.held -= 1;
        if (e.held === 0) e.hand = -1;
      }
    }
  }

  beacons(e: Entity): number {
    let count = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const b = this.at(e.x + dx, e.y + dy);
      if (b && b.cls === Cls.Beacon) count++;
    }
    return count;
  }

  craft(e: Entity) {
    const inv = e.inv!, out = e.out!;
    if (!e.busy && e.recipe >= 0) {
      const recipe = game.recipes[e.recipe];
      if (recipe.ingredients.every(([i, n]) => inv[i] >= n) && recipe.products.every(([p, n]) => out[p] <= n)
        && (e.cls !== Cls.Centrifuge || (out[U238] <= 1 && out[U235] <= 1))) {
        for (const [i, n] of recipe.ingredients) inv[i] -= n;
        e.busy = true;
        e.progress = 0;
      }
    }
    if (e.busy) {
      const bonus = Math.floor(250 * this.beacons(e) * this.satisfaction / 1000);
      let rate: number;
      if (BURNER[e.machine]) {
        if (e.burn === 0 && e.fuel > 0) { e.fuel -= 1; e.burn = 3600; }
        rate = 0;
        if (e.burn > 0) { e.burn -= 1; rate = SPEED[e.machine] + bonus; }
      } else {
        rate = Math.floor((SPEED[e.machine] + bonus) * this.satisfaction / 1000);
      }
      e.progress += rate;
      const recipe = game.recipes[e.recipe];
      if (e.progress >= recipe.time * 1000) {
        if (e.cls === Cls.Centrifuge) {
          const product = e.crafts % 7 === 6 ? U235 : U238;
          out[product] += 1;
          this.produced[product] += 1;
        } else {
          for (const [p, n] of recipe.products) { out[p] += n; this.produced[p] += n; }
        }
        e.crafts += 1;
        e.busy = false;
        e.progress = 0;
      }
    }
    if (e.cls === Cls.Furnace && !e.busy && inv.every(v => v === 0) && out.every(v => v === 0)) e.recipe = -1;
    if (e.machine === M['steel-furnace']) e.heat = e.busy ? Math.min(1500, e.heat + 3) : Math.max(20, e.heat - 1);
  }

  lab(e: Entity) {
    const r = this.research.current;
    if (r < 0 || this.done[r]) { e.busy = false; e.progress = 0; return; }
    const tech = game.techs[r];
    const inv = e.inv!;
    if (!e.busy && inv[RED] >= tech.packs[0] && inv[RED + 1] >= tech.packs[1] && inv[RED + 2] >= tech.packs[2]) {
      for (let k = 0; k < 3; k++) inv[RED + k] -= tech.packs[k];
      e.busy = true;
      e.progress = 0;
    }
    if (e.busy) {
      e.progress += this.satisfaction;
      if (e.progress >= tech.time * 1000) {
        e.busy = false;
        e.progress = 0;
        this.research.progress += 1;
        if (this.research.progress >= tech.units) this.complete(r);
      }
    }
  }

  complete(r: number) {
    this.done[r] = true;
    for (const m of game.techs[r].machines) this.machineUnlocked[m] = true;
    for (const recipe of game.techs[r].recipes) this.recipeUnlocked[recipe] = true;
    this.research = { current: -1, progress: 0 };
  }

  silo(e: Entity) {
    if (e.held >= 20) { e.busy = false; return; }
    const inv = e.inv!;
    const recipe = game.recipes[ROCKET_PART];
    if (!e.busy && recipe.ingredients.every(([i, n]) => inv[i] >= n)) {
      for (const [i, n] of recipe.ingredients) inv[i] -= n;
      e.busy = true;
      e.progress = 0;
    }
    if (e.busy) {
      e.progress += Math.floor(SPEED[e.machine] * this.satisfaction / 1000);
      if (e.progress >= recipe.time * 1000) {
        e.held += 1;
        e.busy = false;
        e.progress = 0;
      }
    }
  }

  radar(e: Entity) {
    e.busy = true;
    e.progress += this.satisfaction;
    if (e.progress < 300000) return;
    e.progress = 0;
    const cx = e.x >> 3, cy = e.y >> 3;
    for (let r = 0; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= this.chunksX || y >= this.chunksY) continue;
          const chunk = y * this.chunksX + x;
          if (!this.revealed[chunk]) {
            this.revealed[chunk] = 1;
            e.crafts += 1;
            return;
          }
        }
      }
    }
  }

  disabled(e: Entity) {
    return this.neighbors(e).some(n => n?.cls === Cls.Combinator && !n.signal);
  }

  insert1(e: Entity) {
    const reach = REACH[e.machine];
    const swing = SPEED[e.machine];
    if (e.state === 0) {
      if (this.disabled(e)) return;
      const source = this.back(e, reach), target = this.front(e, reach);
      if (!source || !target) return;
      const chosen = this.choose(e, source, target);
      if (!chosen) return;
      const [item, n] = chosen;
      this.takeFrom(source, item, n);
      e.hand = item;
      e.held = n;
      e.state = 1;
      e.timer = swing;
      return;
    }
    if (e.state === 1) {
      if (e.timer > 0) e.timer -= 1;
      if (e.timer === 0) {
        const target = this.front(e, reach);
        const accepted = target ? this.insert(target, e.hand, e.held, true) : 0;
        e.held -= accepted;
        e.moved += accepted;
        if (e.held === 0) {
          e.hand = -1;
          e.state = 2;
          e.timer = swing;
        }
      }
      return;
    }
    e.timer -= 1;
    if (e.timer === 0) e.state = 0;
  }

  /** The item an inserter would take from `source`, and how many. */
  choose(e: Entity, source: Entity, target: Entity): [number, number] | null {
    const filter = e.machine === M['filter-inserter'] ? e.pick : -2;
    if (filter === -1) return null;
    const allowed = (item: number) => filter === -2 || item === filter;
    const c = source.cls;
    if (isBeltLike(c)) {
      const belt = source.belt!;
      if (!belt.length || !allowed(belt[0])) return null;
      return this.insert(target, belt[0], 1, false) >= 1 ? [belt[0], 1] : null;
    }
    const counts = c === Cls.Chest ? source.inv : isCrafter(c) ? source.out : null;
    if (counts) {
      for (let item = 0; item < ITEM_COUNT; item++) {
        if (counts[item] <= 0 || !allowed(item) || FLUID[item]) continue;
        const accepted = this.insert(target, item, Math.min(e.stack, counts[item]), false);
        if (accepted >= 1) return [item, accepted];
      }
      return null;
    }
    if (c === Cls.Miner && source.held > 0 && allowed(source.hand)) {
      const accepted = this.insert(target, source.hand, Math.min(e.stack, source.held), false);
      return accepted >= 1 ? [source.hand, accepted] : null;
    }
    return null;
  }

  takeFrom(source: Entity, item: number, n: number) {
    const c = source.cls;
    if (isBeltLike(c)) source.belt!.splice(0, 2);
    else if (c === Cls.Chest) source.inv![item] -= n;
    else if (isCrafter(c)) source.out![item] -= n;
    else if (c === Cls.Miner) {
      source.held -= n;
      if (source.held === 0) source.hand = -1;
    }
  }

  moveBelt(e: Entity) {
    const belt = e.belt!;
    const speed = SPEED[e.machine];
    for (let i = 0; i < belt.length; i += 2) {
      const limit = i === 0 ? 256 : belt[i - 1] - 64;
      const pos = belt[i + 1];
      belt[i + 1] = Math.max(pos, Math.min(pos + speed, limit));
    }
    if (!belt.length || belt[1] < 256) return;
    const item = belt[0];
    const pass = (t: Entity | null) => {
      if (!t || t === e || !isBeltLike(t.cls)) return false;
      const tb = t.belt!;
      if (tb.length > 0 && tb[tb.length - 1] < 64) return false;
      belt.splice(0, 2);
      tb.push(item, 0);
      return true;
    };
    if (e.cls === Cls.Belt) { pass(this.front(e)); return; }
    if (e.cls === Cls.Underground) {
      if (e.role === 1) { pass(this.front(e)); return; }
      for (let d = 1; d <= 5; d++) {
        const t = this.front(e, d);
        if (t && t.cls === Cls.Underground && t.dir === e.dir && t.role === 1) { pass(t); return; }
      }
      return;
    }
    // splitter
    const front = this.front(e);
    const side = this.at(e.x + DX[e.dir] + DX[(e.dir + 1) % 4], e.y + DY[e.dir] + DY[(e.dir + 1) % 4]);
    let order: (Entity | null)[];
    if (e.pick >= 0) order = item === e.pick ? [side] : [front];
    else if (e.priority === 1) order = [front, side];
    else if (e.priority === 2) order = [side, front];
    else order = e.toggle === 0 ? [front, side] : [side, front];
    for (const t of order) {
      if (pass(t)) {
        e.toggle = t === front ? 1 : 0;
        return;
      }
    }
  }

  // ── hash, save, load ──────────────────────────────────────────────────────

  hash(): number {
    let h = 2166136261;
    const feed = (v: number) => {
      for (let k = 0; k < 4; k++) {
        h = Math.imul(h ^ ((v >>> (8 * k)) & 255), 16777619) >>> 0;
      }
    };
    const feedList = (list: number[] | null) => {
      if (!list) { feed(0); return; }
      feed(list.length);
      for (const v of list) feed(v);
    };
    let doneMask = 0;
    this.done.forEach((d, i) => { if (d) doneMask |= 1 << i; });
    let revealed = 0;
    for (const r of this.revealed) revealed += r;
    let resources = 0;
    for (const a of this.resAmount) resources = (resources + a) | 0;
    for (const v of [this.tick, this.satisfaction, this.research.current, this.research.progress, doneMask, revealed, resources]) feed(v);
    for (const e of this.entities) {
      for (const v of [e.id, e.machine, e.x, e.y, e.dir, e.recipe, e.progress, e.busy ? 1 : 0, e.fuel, e.burn, e.heat]) feed(v);
      feedList(e.inv); feedList(e.out); feedList(e.belt);
      for (const v of [e.state, e.timer, e.hand, e.held, e.pick, e.stack, e.priority, e.toggle, e.role, e.fluid,
        e.amount, e.charge, e.condItem, e.condOp, e.condValue, e.signal ? 1 : 0, e.crafts, e.moved]) feed(v);
    }
    return h >>> 0;
  }

  save(): Save {
    let terrain = '';
    for (let i = 0; i < this.water.length; i++) terrain += this.water[i] ? '~' : '.';
    const resources: number[][] = [];
    for (let i = 0; i < this.resKind.length; i++) {
      if (this.resKind[i] >= 0) resources.push([i % this.width, Math.floor(i / this.width), this.resKind[i], this.resAmount[i]]);
    }
    return {
      version: 1, tick: this.tick, width: this.width, height: this.height, nextId: this.nextId,
      terrain, resources, revealed: Array.from(this.revealed).join(''),
      research: { current: this.research.current, progress: this.research.progress, done: this.done.flatMap((d, i) => (d ? [i] : [])) },
      entities: this.entities.map(e => ({
        id: e.id, machine: e.machine, x: e.x, y: e.y, dir: e.dir, recipe: e.recipe, progress: e.progress, busy: e.busy,
        fuel: e.fuel, burn: e.burn, heat: e.heat, inv: e.inv && [...e.inv], out: e.out && [...e.out], belt: e.belt && [...e.belt],
        state: e.state, timer: e.timer, hand: e.hand, held: e.held, pick: e.pick, stack: e.stack, priority: e.priority,
        toggle: e.toggle, role: e.role, fluid: e.fluid, amount: e.amount, charge: e.charge, condItem: e.condItem,
        condOp: e.condOp, condValue: e.condValue, signal: e.signal, crafts: e.crafts, moved: e.moved,
      })),
    };
  }

  static load(save: Save): Sim {
    const sim = new Sim(save.width, save.height);
    sim.tick = save.tick;
    sim.nextId = save.nextId;
    for (let i = 0; i < save.terrain.length; i++) sim.water[i] = save.terrain[i] === '~' ? 1 : 0;
    for (const [x, y, kind, amount] of save.resources) {
      sim.resKind[y * save.width + x] = kind;
      sim.resAmount[y * save.width + x] = amount;
    }
    for (let i = 0; i < save.revealed.length; i++) sim.revealed[i] = save.revealed[i] === '1' ? 1 : 0;
    sim.research = { current: save.research.current, progress: save.research.progress };
    for (const t of save.research.done) sim.complete(t);
    sim.research = { current: save.research.current, progress: save.research.progress };
    for (const s of [...save.entities].sort((a, b) => a.id - b.id)) {
      const e = new Entity(s.id, s.machine, s.x, s.y, s.dir);
      Object.assign(e, { ...s, inv: s.inv && [...s.inv], out: s.out && [...s.out], belt: s.belt && [...s.belt] });
      e.cls = MACHINE_CLASS[e.machine];
      sim.entities.push(e);
      sim.grid[e.y * sim.width + e.x] = e;
    }
    sim.rebuildClasses();
    return sim;
  }
}
