// The UI's state beside the simulation: tools, camera, selection, open
// windows, production and power samples, alerts. Mirrors utu/ui.utu's `Ui`.
import { Sim, Entity, GAME, ITEM_COUNT, Cls, isCrafter } from './sim';

export const TOOL_NONE = -1;
export const TOOL_REMOVE = -2;
export const CATEGORIES = ['extraction', 'smelting', 'production', 'logistics', 'storage', 'energy', 'science', 'circuits'];
const CATEGORY_COLORS = ['#a1887f', '#e67e22', '#4da3ff', '#f1c40f', '#95a5a6', '#4cc38a', '#b388ff', '#ff6fa5'];
export const DIRS = ['N', 'E', 'S', 'W'];
export const WINDOWS = ['research', 'production', 'power', 'saves'];
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

export interface Alert { text: string; kind: string; entity: number }

/** Two capital letters from a machine name: "electric-miner" → "EM". */
export function glyph(name: string): string {
  const dash = name.indexOf('-');
  return (name[0] + (dash > 0 && dash + 1 < name.length ? name[dash + 1] : name[1])).toUpperCase();
}

export function categoryColor(category: string): string {
  const i = CATEGORIES.indexOf(category);
  return i >= 0 ? CATEGORY_COLORS[i] : '#888888';
}

export const GLYPHS = GAME.machines.map(m => glyph(m.name));
export const COLORS = GAME.machines.map(m => categoryColor(m.category));
export const ITEM_COLORS = GAME.items.map(i => i.color);
export const SPEED = GAME.machines.map(m => m.speed);
export const POWER = GAME.machines.map(m => m.power);
export const BURNER = GAME.machines.map(m => m.burner);
export const REACH = GAME.machines.map(m => (m as { reach?: number }).reach ?? 1);
export const IS_FLUID = GAME.items.map(i => i.fluid);

/** Integer division as utu's I32 does it (toward zero). */
export const div = (a: number, b: number) => Math.trunc(a / b);
export const percent = (value: number, max: number) =>
  `${max <= 0 ? 0 : Math.min(100, Math.max(0, div(value * 100, max)))}%`;
export const itemName = (item: number) => (item < 0 ? 'empty' : GAME.items[item].label);
export const windowTitle = (name: string) => name.slice(0, 1).toUpperCase() + name.slice(1);

export class Game {
  speed = 1;
  tool = TOOL_NONE;
  dir = 1;
  tab = 0;
  camX = 0;
  camY = 0;
  zoom = 24;
  selected = -1;
  pinned: number[] = [];
  hoverX = -1;
  hoverY = -1;
  windows: string[] = [];
  prod = new Array<number>(60 * ITEM_COUNT).fill(0);
  prod10 = new Array<number>(60 * ITEM_COUNT).fill(0);
  last = new Array<number>(ITEM_COUNT).fill(0);
  last10 = new Array<number>(ITEM_COUNT).fill(0);
  samples: number;
  supply = new Array<number>(60).fill(0);
  demand = new Array<number>(60).fill(0);
  alerts: Alert[] = [];
  doneCount = 0;
  range10 = false;
  search = '';
  text = '';
  notice = '';
  drag = false;
  dragX = 0;
  dragY = 0;
  dragged = false;
  frame = 0;
  private byId: Map<number, Entity> | null = null;

  constructor(public sim: Sim, public starterText: string) {
    this.samples = Math.floor(sim.tick / 60);
  }

  /** The entity with this id, from an index rebuilt once per frame. */
  entity(id: number): Entity | undefined {
    this.byId ??= new Map(this.sim.entities.map(e => [e.id, e]));
    return this.byId.get(id);
  }

  /** The simulation changed: forget the id index. */
  changed() { this.byId = null; }

  isPinned(id: number) { return this.pinned.includes(id); }

  togglePin(id: number) {
    this.pinned = this.isPinned(id) ? this.pinned.filter(p => p !== id) : [...this.pinned, id];
  }

  isOpen(name: string) { return this.windows.includes(name); }

  toggleWindow(name: string) {
    this.windows = this.isOpen(name) ? this.windows.filter(w => w !== name) : [...this.windows, name];
  }

  /** The selected entity (unless pinned) and the pinned ones. */
  inspected(): Entity[] {
    const ids = this.selected > 0 && !this.isPinned(this.selected) ? [this.selected, ...this.pinned] : this.pinned;
    return ids.map(id => this.entity(id)).filter((e): e is Entity => e !== undefined);
  }

  addAlert(text: string, kind: string, entity: number) {
    const kept = this.alerts.filter(a => !(a.text === text && a.entity === entity)).slice(0, 7);
    this.alerts = [{ text, kind, entity }, ...kept];
  }

  /** Take the 1-second (and every tenth, the 10-second) production and power samples. */
  sample() {
    const w = this.sim;
    while (this.samples < Math.floor(w.tick / 60)) {
      const slot = this.samples % 60;
      for (let i = 0; i < ITEM_COUNT; i++) {
        this.prod[slot * ITEM_COUNT + i] = w.produced[i] - this.last[i];
        this.last[i] = w.produced[i];
      }
      this.supply[slot] = w.supply;
      this.demand[slot] = w.demand;
      if (this.samples % 10 === 0) {
        const slot10 = Math.floor(this.samples / 10) % 60;
        for (let i = 0; i < ITEM_COUNT; i++) {
          this.prod10[slot10 * ITEM_COUNT + i] = w.produced[i] - this.last10[i];
          this.last10[i] = w.produced[i];
        }
      }
      this.samples += 1;
      this.checkAlerts();
    }
  }

  checkAlerts() {
    const w = this.sim;
    if (w.satisfaction < 500) this.addAlert(`No power: ${div(w.satisfaction, 10)}% satisfaction`, 'bad', -1);
    const done = w.done.filter(Boolean).length;
    if (done > this.doneCount) {
      if (this.doneCount > 0 || w.tick > 60) this.addAlert('Research complete', 'good', -1);
      this.doneCount = done;
    }
    for (const e of w.crafterList) {
      if (e.busy || e.recipe < 0) continue;
      if (GAME.recipes[e.recipe].products.some(([p, n]) => e.out![p] > n)) {
        this.addAlert(`${GAME.machines[e.machine].label} #${e.id} output full`, '', e.id);
      }
    }
  }

  perMinute(item: number): number {
    let total = 0;
    for (let s = 0; s < 60; s++) total += (this.range10 ? this.prod10 : this.prod)[s * ITEM_COUNT + item];
    return this.range10 ? div(total, 10) : total;
  }

  researchName(): string {
    const r = this.sim.research.current;
    return r < 0 ? 'No research' : GAME.techs[r].label;
  }

  researchPercent(): string {
    const r = this.sim.research.current;
    return r < 0 ? '0%' : percent(this.sim.research.progress, GAME.techs[r].units);
  }

  tileOre(x: number, y: number) { return this.sim.inside(x, y) ? this.sim.resKind[y * this.sim.width + x] : -1; }
  tileAmount(x: number, y: number) { return this.sim.inside(x, y) ? this.sim.resAmount[y * this.sim.width + x] : 0; }

  neighborName(x: number, y: number): string {
    const n = this.sim.at(x, y);
    return n ? GAME.machines[n.machine].label : 'nothing';
  }

  neighbor(e: Entity, side: number) { return this.sim.at(e.x + DX[side], e.y + DY[side]); }

  techState(t: number): string {
    const w = this.sim;
    if (w.done[t]) return 'done';
    if (w.research.current === t) return 'current';
    return GAME.techs[t].prereqs.every(p => w.done[p]) ? 'available' : 'locked';
  }

  /** Each machine type's demand: busy machines, and radars and beacons always. */
  demandByMachine(): number[] {
    const totals = new Array<number>(GAME.machines.length).fill(0);
    for (const e of this.sim.entities) {
      if (e.busy || e.cls === Cls.Radar || e.cls === Cls.Beacon) totals[e.machine] += POWER[e.machine];
    }
    return totals;
  }

  effectiveSpeed(e: Entity): number {
    const s = this.sim.satisfaction;
    return div((SPEED[e.machine] + div(250 * this.sim.beacons(e) * s, 1000)) * s, 1000);
  }

  allowedRecipes(e: Entity): number[] {
    return GAME.recipes.map((_, r) => r).filter(r => this.sim.recipeAllowed(e, r));
  }

  /** Pin panels for the first n entities of distinct machine types. */
  pinPanels(n: number) {
    const seen = new Set<number>();
    for (const e of this.sim.entities) {
      if (this.pinned.length < n && !seen.has(e.machine)) {
        seen.add(e.machine);
        this.pinned = [...this.pinned, e.id];
      }
    }
  }

  load(text: string) {
    try {
      this.sim = Sim.load(JSON.parse(text));
      this.changed();
      this.selected = -1;
      this.pinned = [];
      this.samples = Math.floor(this.sim.tick / 60);
      this.notice = 'Loaded.';
    } catch (error) {
      this.notice = `Could not load: ${(error as Error).message}`;
    }
  }

  saveText() { return JSON.stringify(this.sim.save()); }

  pan(dx: number, dy: number) {
    this.camX = Math.max(-4, Math.min(this.sim.width, this.camX + dx));
    this.camY = Math.max(-4, Math.min(this.sim.height, this.camY + dy));
  }

  clickTile(x: number, y: number) {
    if (!this.sim.inside(x, y)) return;
    if (this.tool === TOOL_REMOVE) this.sim.apply({ kind: 'remove', x, y });
    else if (this.tool >= 0) this.sim.apply({ kind: 'place', machine: this.tool, x, y, dir: this.dir });
    else this.selected = this.sim.at(x, y)?.id ?? -1;
    this.changed();
  }
}

export { isCrafter };
