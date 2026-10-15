// One panel per machine type (UI.md's table; utu/ui.utu's panel functions).
import type { ComponentType } from 'react';
import { type Entity, GAME, Cls, isCrafter } from './sim';
import { BURNER, IS_FLUID, ITEM_COLORS, REACH, SPEED, div, itemName, percent } from './model';
import { Bar, Dot, FluidGauge, Lane, MeterRow, ProgressRing, Row, Slot, Slots, cx, stateName, useGame } from './widgets';

type PanelProps = { e: Entity };
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const recipeName = (r: number) => (r < 0 ? 'none' : GAME.recipes[r].name);
const recipeTime = (e: Entity) => (e.recipe >= 0 ? GAME.recipes[e.recipe].time : 0);
const firstItem = (counts: number[]) => counts.findIndex(c => c > 0);
const COAL = 2;

/** Set an entity's field through the simulation's commands. */
function useCommand() {
  const { game, refresh } = useGame();
  return (kind: 'recipe' | 'filter' | 'priority' | 'stack' | 'role', e: Entity, value: number) => {
    game.sim.apply({ kind, x: e.x, y: e.y, value });
    refresh();
  };
}

function FuelRow({ e, burn }: { e: Entity; burn: number }) {
  return (
    <div className="row">
      <span className="muted">Fuel</span>
      <Slot item={e.fuel > 0 ? COAL : -1} count={e.fuel} />
      <Bar value={e.burn} max={burn} kind="" />
    </div>
  );
}

function OutputRow({ e, label = 'Output' }: { e: Entity; label?: string }) {
  return <div className="row"><span className="muted">{label}</span><Slot item={e.hand} count={e.held} /></div>;
}

// ── extraction ───────────────────────────────────────────────────────────

function BurnerMiner({ e }: PanelProps) {
  const { game } = useGame();
  return (
    <div>
      <FuelRow e={e} burn={3600} />
      <Row label="Under the drill" value={`${itemName(game.tileOre(e.x, e.y))} × ${game.tileAmount(e.x, e.y)}`} />
      <MeterRow label="Mining" value={e.progress} max={60000} kind="info" />
      <OutputRow e={e} />
    </div>
  );
}

function ElectricMiner({ e }: PanelProps) {
  const { game } = useGame();
  return (
    <div>
      <div className="grid3">
        {Array.from({ length: 9 }, (_, k) => {
          const x = e.x + (k % 3) - 1, y = e.y + Math.floor(k / 3) - 1;
          const ore = game.tileOre(x, y);
          return <div key={k} style={{ background: ore >= 0 ? ITEM_COLORS[ore] : '#2a2f36' }}>{game.tileAmount(x, y)}</div>;
        })}
      </div>
      <MeterRow label="Power" value={game.sim.satisfaction} max={1000} kind="good" />
      <MeterRow label="Mining" value={e.progress} max={60000} kind="info" />
      <OutputRow e={e} />
    </div>
  );
}

function OffshorePump({ e }: PanelProps) {
  const { game } = useGame();
  const target = game.sim.back(e, 1);
  return (
    <div>
      <Row label="Flow" value={e.busy ? '600 / s' : '0 / s'} />
      <MeterRow label="Target pipe" value={target ? target.amount : 0} max={target ? SPEED[target.machine] : 100} kind="info" />
    </div>
  );
}

function Pumpjack({ e }: PanelProps) {
  const { game } = useGame();
  const field = game.tileAmount(e.x, e.y);
  return (
    <div>
      <Row label="Yield" value={`${div(Math.max(100, Math.min(1000, div(field, 100))), 10)}%`} />
      <Row label="Oil field" value={field} />
      <div className="gauges"><FluidGauge item={23} amount={e.amount} max={100} /></div>
      <MeterRow label="Pumping" value={e.progress} max={6000} kind="info" />
    </div>
  );
}

// ── smelting ─────────────────────────────────────────────────────────────

function FurnaceSlots({ e }: PanelProps) {
  const input = firstItem(e.inv!), output = firstItem(e.out!);
  return (
    <div>
      <div className="row">
        <span className={cx('flame', (e.burn > 0 || (e.busy && !BURNER[e.machine])) && 'on')} />
        <span>{recipeName(e.recipe)}</span>
      </div>
      <div className="slots">
        <Slot item={input} count={input >= 0 ? e.inv![input] : 0} />
        <span>→</span>
        <Slot item={output} count={output >= 0 ? e.out![output] : 0} />
      </div>
      <MeterRow label="Progress" value={e.progress} max={e.recipe >= 0 ? GAME.recipes[e.recipe].time * 1000 : 1} kind="" />
    </div>
  );
}

function StoneFurnace({ e }: PanelProps) {
  return <div><FuelRow e={e} burn={3600} /><FurnaceSlots e={e} /></div>;
}

function SteelFurnace({ e }: PanelProps) {
  return (
    <div>
      <FuelRow e={e} burn={3600} />
      <FurnaceSlots e={e} />
      <div className="row">
        <span className="muted">Temperature</span>
        <div className="gauge"><i style={{ height: percent(e.heat, 1500), background: e.heat > 1000 ? '#ff6a3a' : '#f0a73a' }} /></div>
        <b>{`${e.heat} °C`}</b>
      </div>
    </div>
  );
}

function ElectricFurnace({ e }: PanelProps) {
  const { game } = useGame();
  return (
    <div>
      <Row label="Power draw" value={e.busy ? `${div(180 * game.sim.satisfaction, 1000)} kW` : 'idle'} />
      <FurnaceSlots e={e} />
      <Row label="Crafts" value={e.crafts} />
    </div>
  );
}

// ── production ───────────────────────────────────────────────────────────

function Ingredients({ e }: PanelProps) {
  const recipe = e.recipe >= 0 ? GAME.recipes[e.recipe] : null;
  return (
    <table>
      <tbody>
        {recipe?.ingredients.map(([item, need]) => (
          <tr key={`in${item}`}>
            <td><Dot item={item} />{` ${itemName(item)}`}</td>
            <td className="num">{`${e.inv![item]} / ${need}`}</td>
          </tr>
        ))}
        {recipe?.products.map(([item]) => (
          <tr key={`out${item}`}>
            <td>{`→ ${itemName(item)}`}</td>
            <td className="num">{e.out![item]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecipeGrid({ e, recipes }: { e: Entity; recipes: number[] }) {
  const command = useCommand();
  return (
    <div className="recipe-grid">
      {recipes.map(r => (
        <button key={r} className={cx(e.recipe === r && 'active')} onClick={() => command('recipe', e, r)}>
          {GAME.recipes[r].name}
        </button>
      ))}
    </div>
  );
}

function RecipeSelect({ e }: PanelProps) {
  const { game } = useGame();
  const command = useCommand();
  return (
    <select aria-label="Recipe" value={e.recipe} onChange={event => command('recipe', e, Number.parseInt(event.target.value, 10))}>
      <option value="-1">Choose a recipe</option>
      {game.allowedRecipes(e).map(r => <option key={r} value={r}>{GAME.recipes[r].name}</option>)}
    </select>
  );
}

function Assembler1({ e }: PanelProps) {
  const { game } = useGame();
  return (
    <div>
      <RecipeGrid e={e} recipes={game.allowedRecipes(e)} />
      <div className="row"><Ingredients e={e} /><ProgressRing e={e} time={recipeTime(e)} /></div>
    </div>
  );
}

function Assembler2({ e }: PanelProps) {
  const { game } = useGame();
  return (
    <div>
      <RecipeSelect e={e} />
      <Ingredients e={e} />
      <Row label="Crafts" value={e.crafts} />
      <Row label="Speed" value={`${div(game.effectiveSpeed(e), 10)}%`} />
      <MeterRow label="Progress" value={e.progress} max={Math.max(1, recipeTime(e) * 1000)} kind="" />
    </div>
  );
}

function Assembler3({ e }: PanelProps) {
  const { game, refresh } = useGame();
  const recipes = game.allowedRecipes(e).filter(r => game.search.length === 0 || GAME.recipes[r].name.includes(game.search));
  return (
    <div>
      <input type="search" placeholder="Search recipes" value={game.search}
        onChange={event => { game.search = event.target.value; refresh(); }} />
      <RecipeGrid e={e} recipes={recipes} />
      <Row label="Beacons in range" value={game.sim.beacons(e)} />
      <Row label="Effective speed" value={`${div(game.effectiveSpeed(e), 10)}%`} />
      <MeterRow label="Progress" value={e.progress} max={Math.max(1, recipeTime(e) * 1000)} kind="" />
    </div>
  );
}

function FluidSide({ e }: PanelProps) {
  const recipe = e.recipe >= 0 ? GAME.recipes[e.recipe] : null;
  return (
    <div className="gauges">
      {recipe && <>
        {recipe.ingredients.filter(([item]) => IS_FLUID[item]).map(([item, need]) =>
          <FluidGauge key={`fi${item}`} item={item} amount={e.inv![item]} max={need * 2} />)}
        <span>→</span>
        {recipe.products.filter(([item]) => IS_FLUID[item]).map(([item, n]) =>
          <FluidGauge key={`fo${item}`} item={item} amount={e.out![item]} max={n * 2} />)}
      </>}
    </div>
  );
}

function ChemicalPlant({ e }: PanelProps) {
  return (
    <div>
      <RecipeSelect e={e} />
      <FluidSide e={e} />
      <Slots counts={e.inv!} />
      <Slots counts={e.out!} />
      <MeterRow label="Progress" value={e.progress} max={Math.max(1, recipeTime(e) * 1000)} kind="" />
    </div>
  );
}

function OilRefinery({ e }: PanelProps) {
  return (
    <div>
      <div className="gauges">
        <FluidGauge item={23} amount={e.inv![23]} max={200} />
        <span>→</span>
        <FluidGauge item={24} amount={e.out![24]} max={90} />
      </div>
      <Row label="Crafts" value={e.crafts} />
      <MeterRow label="Progress" value={e.progress} max={300000} kind="" />
    </div>
  );
}

function Centrifuge({ e }: PanelProps) {
  return (
    <div>
      <div className="row">
        <ProgressRing e={e} time={720} />
        <div><Row label="Uranium-238" value={e.out![20]} /><Row label="Uranium-235" value={e.out![21]} /></div>
      </div>
      <Row label="Next U-235 in" value={`${((6 - (e.crafts % 7) + 7) % 7) + 1} crafts`} />
      <Slots counts={e.inv!} />
    </div>
  );
}

// ── logistics ────────────────────────────────────────────────────────────

function BeltItems({ e }: PanelProps) {
  const belt = e.belt!;
  const items = [];
  for (let k = 0; k < belt.length / 2; k++) {
    const item = belt[k * 2];
    items.push(<span key={k} title={itemName(item)}><Dot item={item} />{` ${itemName(item)}`}</span>);
  }
  return <div className="items">{items}</div>;
}

function Belt({ e }: PanelProps) {
  return <div><Lane e={e} /><BeltItems e={e} /><Row label="Speed" value={`${SPEED[e.machine]} / tick`} /></div>;
}

function FastBelt({ e }: PanelProps) {
  return (
    <div>
      <Lane e={e} />
      <MeterRow label="Compression" value={div(e.belt!.length, 2) * 64} max={256} kind="info" />
      <BeltItems e={e} />
    </div>
  );
}

function ExpressBelt({ e }: PanelProps) {
  const belt = e.belt!;
  return (
    <div>
      <Lane e={e} />
      <Row label="State" value={belt.length > 0 && belt[1] >= 256 ? 'blocked' : 'moving'} />
      <BeltItems e={e} />
    </div>
  );
}

function ItemSelect({ label, none, value, onPick }: { label: string; none?: string; value: number; onPick: (item: number) => void }) {
  return (
    <select aria-label={label} value={value} onChange={event => onPick(Number.parseInt(event.target.value, 10))}>
      {none && <option value="-1">{none}</option>}
      {Array.from({ length: 22 }, (_, i) => <option key={i} value={i}>{itemName(i)}</option>)}
    </select>
  );
}

function Splitter({ e }: PanelProps) {
  const command = useCommand();
  return (
    <div>
      <div className="row">
        {['Alternate', 'Front', 'Side'].map((name, p) => (
          <button key={p} className={cx(e.priority === p && 'active')} onClick={() => command('priority', e, p)}>{name}</button>
        ))}
      </div>
      <ItemSelect label="Filter" none="No filter" value={e.pick} onPick={item => command('filter', e, item)} />
      <Row label="Next output" value={e.toggle === 0 ? 'front' : 'side'} />
      <Lane e={e} />
    </div>
  );
}

function exitDistance(game: ReturnType<typeof useGame>['game'], e: Entity): string {
  for (let d = 1; d <= 5; d++) {
    const t = game.sim.front(e, d);
    if (t && t.cls === Cls.Underground && t.dir === e.dir && t.role === 1) return `${d} tiles`;
  }
  return 'no exit';
}

function Underground({ e }: PanelProps) {
  const { game } = useGame();
  const command = useCommand();
  return (
    <div>
      <div className="row">
        <button className={cx(e.role === 0 && 'active')} onClick={() => command('role', e, 0)}>Entrance</button>
        <button className={cx(e.role === 1 && 'active')} onClick={() => command('role', e, 1)}>Exit</button>
      </div>
      <Row label="Linked exit" value={e.role === 0 ? exitDistance(game, e) : 'this is an exit'} />
      <Lane e={e} />
    </div>
  );
}

function Pipe({ e }: PanelProps) {
  const { game } = useGame();
  const arrows = ['↑', '→', '↓', '←'].map((arrow, side) => (game.neighbor(e, side)?.cls === Cls.Pipe ? arrow : '·')).join('');
  return (
    <div>
      <Row label="Fluid" value={e.fluid >= 0 ? itemName(e.fluid) : 'empty'} />
      <MeterRow label="Amount" value={e.amount} max={100} kind="info" />
      <div className="row"><span className="muted">Connections</span><b>{arrows}</b></div>
    </div>
  );
}

function StorageTank({ e }: PanelProps) {
  return (
    <div>
      <div className="tank"><i style={{ height: percent(e.amount, 2500), background: e.fluid >= 0 ? ITEM_COLORS[e.fluid] : '#333' }} /></div>
      <Row label="Fluid" value={e.fluid >= 0 ? itemName(e.fluid) : 'empty'} />
      <Row label="Fill" value={`${percent(e.amount, 2500)} of 2500`} />
    </div>
  );
}

function InserterCommon({ e }: PanelProps) {
  const { game } = useGame();
  const reach = REACH[e.machine];
  return (
    <div>
      <Row label="State" value={stateName(e)} />
      <MeterRow label="Swing" value={e.timer} max={SPEED[e.machine]} kind="info" />
      <OutputRow e={e} label="Hand" />
      <Row label="Moved" value={e.moved} />
      <Row label="From" value={game.neighborName(e.x - DX[e.dir] * reach, e.y - DY[e.dir] * reach)} />
      <Row label="To" value={game.neighborName(e.x + DX[e.dir] * reach, e.y + DY[e.dir] * reach)} />
    </div>
  );
}

function LongInserter({ e }: PanelProps) {
  const roles = ['src', '', 'me', '', 'dst'];
  return (
    <div>
      <div className="reach">{roles.map((role, k) => <div key={k} className={cx(role)} />)}</div>
      <InserterCommon e={e} />
    </div>
  );
}

function FastInserter({ e }: PanelProps) {
  const { game } = useGame();
  return (
    <div>
      <Row label="State" value={stateName(e)} />
      <OutputRow e={e} label="Hand" />
      <Row label="Moved" value={e.moved} />
      <Row label="Average" value={`${div(e.moved * 3600, Math.max(1, game.sim.tick))} / min`} />
    </div>
  );
}

function FilterInserter({ e }: PanelProps) {
  const command = useCommand();
  return (
    <div>
      <div className="items">
        {Array.from({ length: 22 }, (_, i) => (
          <button key={i} className={cx(e.pick === i && 'active')} title={itemName(i)}
            onClick={() => command('filter', e, e.pick === i ? -1 : i)}>
            <Dot item={i} />
          </button>
        ))}
      </div>
      <Row label="Filter" value={itemName(e.pick)} />
      <Row label="State" value={stateName(e)} />
      <Row label="Moved" value={e.moved} />
    </div>
  );
}

function StackInserter({ e }: PanelProps) {
  const command = useCommand();
  return (
    <div>
      <label className="row">
        <span className="muted">{`Stack size ${e.stack}`}</span>
        <input type="range" min="1" max="4" value={e.stack}
          onChange={event => command('stack', e, Number.parseInt(event.target.value, 10))} />
      </label>
      <OutputRow e={e} label="Hand" />
      <Row label="Moved" value={e.moved} />
    </div>
  );
}

// ── storage ──────────────────────────────────────────────────────────────

const usedSlots = (counts: number[]) => counts.reduce((a, c) => a + div(c + 49, 50), 0);

function ChestGrid({ e }: PanelProps) {
  const stacks = e.inv!.flatMap((count, i) => Array.from({ length: div(count + 49, 50) }, () => i));
  return (
    <div className="chest-grid">
      {Array.from({ length: SPEED[e.machine] }, (_, s) => (
        <div key={s}>{s < stacks.length && <Dot item={stacks[s]} />}</div>
      ))}
    </div>
  );
}

function WoodenChest({ e }: PanelProps) {
  return <div><ChestGrid e={e} /><Row label="Used" value={`${usedSlots(e.inv!)} of 16 slots`} /></div>;
}

function SteelChest({ e }: PanelProps) {
  const inv = e.inv!;
  const items = inv.map((_, i) => i).filter(i => inv[i] > 0).sort((a, b) => inv[b] - inv[a]);
  return (
    <div>
      <ChestGrid e={e} />
      <MeterRow label="Used" value={usedSlots(inv)} max={48} kind="" />
      <table>
        <tbody>
          {items.map(i => <tr key={i}><td>{itemName(i)}</td><td className="num">{inv[i]}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function RequesterChest({ e }: PanelProps) {
  const inv = e.inv!;
  return (
    <table>
      <tbody>
        {inv.map((count, i) => count > 0 && (
          <tr key={i}>
            <td>{itemName(i)}</td>
            <td className="num">{count}</td>
            <td><Bar value={(count % 50) + (count % 50 === 0 ? 50 : 0)} max={50} kind="" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── energy ───────────────────────────────────────────────────────────────

function SteamEngine({ e }: PanelProps) {
  return (
    <div>
      <FuelRow e={e} burn={900} />
      <MeterRow label="Water" value={e.amount} max={100} kind="info" />
      <Row label="Running" value={e.busy ? 'yes' : 'no'} />
      <Row label="Output" value={e.busy ? '900 kW' : '0 kW'} />
    </div>
  );
}

function SolarPanel(_: PanelProps) {
  const { game } = useGame();
  const light = game.sim.light;
  const angle = (game.sim.tick % 25200) / 25200 * 6.2832;
  return (
    <div>
      <svg viewBox="0 0 100 50" style={{ width: '100%', height: '60px' }}>
        <path d="M 5 48 A 45 45 0 0 1 95 48" style={{ fill: 'none', stroke: '#2f3843', strokeWidth: 2 }} />
        <circle cx={(50 - 45 * Math.cos(angle)).toFixed(1)} cy={(48 - 45 * Math.sin(angle)).toFixed(1)} r="5"
          style={{ fill: light > 0 ? '#ffd54a' : '#55606e' }} />
      </svg>
      <MeterRow label="Light" value={light} max={1000} kind="" />
      <Row label="Output" value={`${div(60 * light, 1000)} kW`} />
    </div>
  );
}

function Accumulator({ e }: PanelProps) {
  const { game } = useGame();
  const { supply, demand } = game.sim;
  const state = supply > demand && e.charge < 5000 ? 'charging' : supply < demand && e.charge > 0 ? 'discharging' : 'idle';
  return (
    <div>
      <MeterRow label="Charge" value={e.charge} max={5000} kind="good" />
      <Row label="Stored" value={`${e.charge} / 5000`} />
      <Row label="State" value={state} />
    </div>
  );
}

// ── science ──────────────────────────────────────────────────────────────

function Lab({ e }: PanelProps) {
  const { game } = useGame();
  const r = game.sim.research.current;
  return (
    <div>
      <Row label="Research" value={game.researchName()} />
      <div className="slots">
        <Slot item={17} count={e.inv![17]} />
        <Slot item={18} count={e.inv![18]} />
        <Slot item={19} count={e.inv![19]} />
      </div>
      <MeterRow label="Unit" value={e.progress} max={r >= 0 ? GAME.techs[r].time * 1000 : 1} kind="info" />
      <MeterRow label="Research" value={game.sim.research.progress} max={r >= 0 ? GAME.techs[r].units : 1} kind="good" />
    </div>
  );
}

function Radar({ e }: PanelProps) {
  return <div><MeterRow label="Sweep" value={e.progress} max={300000} kind="info" /><Row label="Chunks revealed" value={e.crafts} /></div>;
}

function Beacon({ e }: PanelProps) {
  const { game } = useGame();
  let count = 0;
  for (let k = 0; k < 25; k++) {
    const n = game.sim.at(e.x + (k % 5) - 2, e.y + Math.floor(k / 5) - 2);
    if (n && isCrafter(n.cls)) count++;
  }
  return (
    <div>
      <Row label="Crafters in range" value={count} />
      <Row label="Bonus each" value={`+${div(25 * game.sim.satisfaction, 1000)}% speed`} />
    </div>
  );
}

function Combinator({ e }: PanelProps) {
  const { game, refresh } = useGame();
  const condition = (item: number, op: number, value: number) => {
    game.sim.apply({ kind: 'condition', x: e.x, y: e.y, item, op, value });
    refresh();
  };
  const source = game.sim.back(e, 1);
  return (
    <div>
      <div className="row">
        <ItemSelect label="Item" value={e.condItem} onPick={item => condition(item, e.condOp, e.condValue)} />
        <select aria-label="Operator" value={e.condOp}
          onChange={event => condition(e.condItem, Number.parseInt(event.target.value, 10), e.condValue)}>
          {['>', '<', '='].map((op, o) => <option key={o} value={o}>{op}</option>)}
        </select>
        <input type="number" aria-label="Value" value={e.condValue} style={{ width: '70px' }}
          onChange={event => condition(e.condItem, e.condOp, Number.parseInt(event.target.value, 10) || 0)} />
      </div>
      <Row label="Source count" value={source?.inv ? source.inv[e.condItem] : 0} />
      <Row label="Signal" value={e.signal ? 'on' : 'off'} />
    </div>
  );
}

function Lamp({ e }: PanelProps) {
  const { game } = useGame();
  const controlled = [0, 1, 2, 3].some(side => game.neighbor(e, side)?.cls === Cls.Combinator);
  return (
    <div>
      <div className={cx('lamp', e.signal && 'on')} />
      <Row label="Controlled by" value={controlled ? 'combinator' : 'nothing'} />
    </div>
  );
}

function Silo({ e }: PanelProps) {
  const { game, refresh } = useGame();
  return (
    <div>
      <MeterRow label="Rocket" value={e.held} max={20} kind="good" />
      <MeterRow label="Part" value={e.progress} max={180000} kind="info" />
      <div className="slots">
        <Slot item={7} count={e.inv![7]} />
        <Slot item={12} count={e.inv![12]} />
        <Slot item={16} count={e.inv![16]} />
      </div>
      <button disabled={e.held < 20} onClick={() => { game.sim.apply({ kind: 'launch', x: e.x, y: e.y }); refresh(); }}>
        Launch
      </button>
      <Row label="Rockets launched" value={e.crafts} />
    </div>
  );
}

/** The panel body for each machine, by machine id (data/game.json's order). */
export const PANELS: ComponentType<PanelProps>[] = [
  BurnerMiner, ElectricMiner, OffshorePump, Pumpjack,
  StoneFurnace, SteelFurnace, ElectricFurnace,
  Assembler1, Assembler2, Assembler3, ChemicalPlant, OilRefinery, Centrifuge,
  Belt, FastBelt, ExpressBelt, Splitter, Underground, Pipe, StorageTank,
  InserterCommon, LongInserter, FastInserter, FilterInserter, StackInserter,
  WoodenChest, SteelChest, RequesterChest,
  SteamEngine, SolarPanel, Accumulator,
  Lab, Radar, Beacon, Combinator, Lamp, Silo,
];
