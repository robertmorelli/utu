// The HUD, build palette, inspector, footer, and windows (utu/ui.utu).
import type { ComponentType } from 'react';
import { GAME, ITEM_COUNT, type Entity } from './sim';
import {
  CATEGORIES, COLORS, DIRS, GLYPHS, TOOL_NONE, TOOL_REMOVE, WINDOWS,
  div, itemName, percent, windowTitle,
} from './model';
import { PANELS } from './panels';
import { Bar, Dot, Row, cx, useGame } from './widgets';

const HUD_ITEMS = [5, 6, 7, 9, 11, 13, 17, 18];

function clock(tick: number): string {
  const minutes = div((tick % 25200) * 1440, 25200);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(div(minutes, 60))}:${pad(minutes % 60)}`;
}

// ── HUD ──────────────────────────────────────────────────────────────────

export function Hud() {
  const { game, refresh } = useGame();
  const w = game.sim;
  return (
    <header className="hud">
      <span className="hud-title">FOUNDRY</span>
      <div className="hud-group">
        <span>{w.light > 0 ? '☀' : '☾'}</span>
        <b>{clock(w.tick)}</b>
      </div>
      <div className="hud-group" title={`Supply ${w.supply} / demand ${w.demand}`}>
        <span className="muted">Power</span>
        <div className={cx('meter', w.satisfaction < 500 && 'low')}><i style={{ width: percent(w.satisfaction, 1000) }} /></div>
        <small>{`${div(w.satisfaction, 10)}%`}</small>
      </div>
      <div className="hud-group">
        <span className="muted">{game.researchName()}</span>
        <div className="meter research"><i style={{ width: game.researchPercent() }} /></div>
      </div>
      {HUD_ITEMS.map(item => (
        <div key={item} className="counter" title={`${itemName(item)} per minute`}>
          <b>{game.perMinute(item)}</b>
          <small>{itemName(item)}</small>
        </div>
      ))}
      <div className="hud-group">
        {[0, 1, 2, 4].map(s => (
          <button key={s} className={cx(game.speed === s && 'active')} onClick={() => { game.speed = s; refresh(); }}>
            {s === 0 ? '❚❚' : `${s}×`}
          </button>
        ))}
      </div>
      <div className="hud-group">
        {WINDOWS.map(name => (
          <button key={name} className={cx(game.isOpen(name) && 'active')} onClick={() => { game.toggleWindow(name); refresh(); }}>
            {windowTitle(name)}
          </button>
        ))}
      </div>
    </header>
  );
}

// ── palette ──────────────────────────────────────────────────────────────

export function Palette() {
  const { game, refresh } = useGame();
  const set = (change: () => void) => () => { change(); refresh(); };
  return (
    <nav className="palette">
      <div className="tabs">
        {CATEGORIES.map((name, index) => (
          <button key={name} className={cx(game.tab === index && 'active')} onClick={set(() => { game.tab = index; })}>{name}</button>
        ))}
      </div>
      <div className="machines">
        {GAME.machines.map((m, index) => m.category === CATEGORIES[game.tab] && (
          <button key={index} className={cx('machine-btn', game.tool === index && 'active')}
            disabled={!game.sim.machineUnlocked[index]} title={`${m.label} · speed ${m.speed} · power ${m.power}`}
            onClick={set(() => { game.tool = game.tool === index ? TOOL_NONE : index; })}>
            <span className="glyph" style={{ background: COLORS[index] }}>{GLYPHS[index]}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>
      <div className="tools">
        <button title="Rotate (R)" onClick={set(() => { game.dir = (game.dir + 1) % 4; })}>{`Facing ${DIRS[game.dir]}`}</button>
        <button className={cx(game.tool === TOOL_REMOVE && 'active')} title="Remove (X)"
          onClick={set(() => { game.tool = game.tool === TOOL_REMOVE ? TOOL_NONE : TOOL_REMOVE; })}>Remove</button>
        <button title="Clear tool (Esc)" onClick={set(() => { game.tool = TOOL_NONE; })}>Select</button>
      </div>
    </nav>
  );
}

// ── inspector ────────────────────────────────────────────────────────────

function MachinePanel({ e }: { e: Entity }) {
  const { game, refresh } = useGame();
  const pinned = game.isPinned(e.id);
  const Body = PANELS[e.machine];
  const command = (kind: 'rotate' | 'remove') => {
    game.sim.apply({ kind, x: e.x, y: e.y });
    if (kind === 'remove') {
      game.pinned = game.pinned.filter(p => p !== e.id);
      if (game.selected === e.id) game.selected = -1;
      game.changed();
    }
    refresh();
  };
  return (
    <section className={cx('panel', e.id === game.selected && 'selected')}>
      <div className="panel-head">
        <span className="glyph" style={{ background: COLORS[e.machine] }}>{GLYPHS[e.machine]}</span>
        <h3>{GAME.machines[e.machine].label}</h3>
        <small className="muted">{`#${e.id} (${e.x}, ${e.y}) ${DIRS[e.dir]}`}</small>
        <button title="Rotate" onClick={() => command('rotate')}>↻</button>
        <button title={pinned ? 'Unpin' : 'Pin'} className={cx(pinned && 'active')}
          onClick={() => { game.togglePin(e.id); refresh(); }}>📌</button>
        <button title="Remove" onClick={() => command('remove')}>✕</button>
      </div>
      <div className="panel-body"><Body e={e} /></div>
    </section>
  );
}

export function Inspector() {
  const { game } = useGame();
  return (
    <aside className="inspector">
      {game.inspected().map(e => <MachinePanel key={`panel-${e.id}`} e={e} />)}
      {game.selected <= 0 && game.pinned.length === 0 &&
        <p className="muted">Click a machine to inspect it. Pick a machine on the left to build.</p>}
    </aside>
  );
}

// ── footer ───────────────────────────────────────────────────────────────

function TileInfo() {
  const { game } = useGame();
  const { hoverX: x, hoverY: y, sim } = game;
  if (!sim.inside(x, y)) return <div><span className="muted">Hover the map.</span></div>;
  const ore = game.tileOre(x, y);
  return (
    <div>
      <Row label="Tile" value={`(${x}, ${y})`} />
      <Row label="Terrain" value={sim.water[y * sim.width + x] === 1 ? 'water' : 'land'} />
      <Row label="Resource" value={ore >= 0 ? `${itemName(ore)} × ${game.tileAmount(x, y)}` : 'none'} />
      <Row label="Entity" value={game.neighborName(x, y)} />
    </div>
  );
}

export function Footer() {
  const { game } = useGame();
  return (
    <footer className="footer">
      <div className="alerts">
        {game.alerts.map((a, index) => <div key={a.text + index} className={cx('alert', a.kind)}>{a.text}</div>)}
        {game.alerts.length === 0 && <span className="muted">No alerts.</span>}
      </div>
      <div className="minimap"><canvas id="minimap" width={game.sim.width} height={game.sim.height} /></div>
      <div className="tileinfo"><TileInfo /></div>
    </footer>
  );
}

// ── windows ──────────────────────────────────────────────────────────────

function unlocks(t: number): string {
  const tech = GAME.techs[t];
  return [...tech.machines.map(m => GAME.machines[m].label), ...tech.recipes.map(r => GAME.recipes[r].name)].join(', ');
}

function ResearchWindow() {
  const { game, refresh } = useGame();
  const w = game.sim;
  return (
    <div className="techs">
      {GAME.techs.map((tech, t) => {
        const state = game.techState(t);
        return (
          <button key={t} className={cx('tech', state)} disabled={state !== 'available'}
            onClick={() => { w.apply({ kind: 'research', tech: t }); refresh(); }}>
            <b>{tech.label}</b>
            <small className="muted">{`${tech.units} × ${tech.packs.reduce((a, b) => a + b, 0)} packs`}</small>
            <small>{unlocks(t)}</small>
            {w.research.current === t && <Bar value={w.research.progress} max={tech.units} kind="info" />}
          </button>
        );
      })}
    </div>
  );
}

function sparkPath(values: number[]): string {
  const high = Math.max(1, ...values);
  return values.map((v, k) => `${k === 0 ? 'M' : ' L'}${k} ${20 - div(v * 18, high)}`).join('');
}

function ProductionWindow() {
  const { game, refresh } = useGame();
  const series = (item: number) => Array.from({ length: 60 }, (_, k) => {
    const s = (game.samples + k) % 60;
    return (game.range10 ? game.prod10 : game.prod)[s * ITEM_COUNT + item];
  });
  return (
    <div>
      <div className="row">
        <button className={cx(!game.range10 && 'active')} onClick={() => { game.range10 = false; refresh(); }}>1 min</button>
        <button className={cx(game.range10 && 'active')} onClick={() => { game.range10 = true; refresh(); }}>10 min</button>
      </div>
      <table>
        <tbody>
          {GAME.items.map((_, i) => (
            <tr key={i}>
              <td><Dot item={i} />{` ${itemName(i)}`}</td>
              <td className="num">{`${game.perMinute(i)} / min`}</td>
              <td><svg className="spark" viewBox="0 0 60 22" preserveAspectRatio="none"><path d={sparkPath(series(i))} /></svg></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function graphPath(values: number[], start: number, high: number): string {
  let d = '';
  for (let k = 0; k < 60; k++) d += `${k === 0 ? 'M' : ' L'}${k * 10} ${118 - div(values[(start + k) % 60] * 110, Math.max(1, high))}`;
  return d;
}

function PowerWindow() {
  const { game } = useGame();
  const w = game.sim;
  const high = Math.max(0, ...game.supply, ...game.demand);
  const totals = game.demandByMachine();
  return (
    <div>
      <Row label="Satisfaction" value={`${div(w.satisfaction, 10)}%`} />
      <Row label="Supply / demand" value={`${w.supply} / ${w.demand} kW`} />
      <svg className="graph" viewBox="0 0 600 120" preserveAspectRatio="none">
        <path className="supply" d={graphPath(game.supply, game.samples, high)} />
        <path className="demand" d={graphPath(game.demand, game.samples, high)} />
      </svg>
      <table>
        <tbody>
          <tr><th>Machine</th><th className="num">Demand (kW)</th></tr>
          {totals.map((total, m) => total > 0 && (
            <tr key={m}><td>{GAME.machines[m].label}</td><td className="num">{total}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SavesWindow() {
  const { game, refresh } = useGame();
  const act = (change: () => void) => () => { change(); refresh(); };
  return (
    <div className="saves">
      {[1, 2, 3].map(n => (
        <div key={n} className="row">
          <b>{`Slot ${n}`}</b>
          <button onClick={act(() => {
            localStorage.setItem(`foundry-slot-${n}`, game.saveText());
            game.notice = `Saved to slot ${n}.`;
          })}>Save</button>
          <button onClick={act(() => {
            const text = localStorage.getItem(`foundry-slot-${n}`);
            if (text === null) game.notice = `Slot ${n} is empty.`;
            else game.load(text);
          })}>Load</button>
        </div>
      ))}
      <div className="row">
        <button onClick={act(() => { game.text = game.saveText(); })}>Export</button>
        <button onClick={act(() => game.load(game.text))}>Import</button>
        <button onClick={act(() => game.load(game.starterText))}>New starter game</button>
      </div>
      <textarea aria-label="Save JSON" value={game.text} onChange={event => { game.text = event.target.value; refresh(); }} />
      <p className="muted">{game.notice}</p>
    </div>
  );
}

const WINDOW_BODIES: Record<string, ComponentType> = {
  research: ResearchWindow, production: ProductionWindow, power: PowerWindow, saves: SavesWindow,
};

/** The open windows, side by side. */
export function Windows() {
  const { game, refresh } = useGame();
  return (
    <div>
      {game.windows.length > 0 && (
        <div className="windows">
          {game.windows.map(name => {
            const Body = WINDOW_BODIES[name] ?? SavesWindow;
            return (
              <section key={name} className="window">
                <div className="window-head">
                  <h2>{windowTitle(name)}</h2>
                  <button onClick={() => { game.toggleWindow(name); refresh(); }}>Close</button>
                </div>
                <div className="window-body"><Body /></div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
