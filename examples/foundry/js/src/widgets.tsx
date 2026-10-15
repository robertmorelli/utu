// Small widgets shared by the panels and windows (utu/ui.utu's "small widgets").
import { createContext, useContext, type ReactNode } from 'react';
import type { Entity } from './sim';
import { type Game, ITEM_COLORS, itemName, percent } from './model';

/** The game, and a function that re-renders after an event changed it. */
export interface GameContextValue { game: Game; refresh: () => void }
export const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame outside the game');
  return value;
}

/** Class names, the empty ones left out. */
export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ') || undefined;

export function Bar({ value, max, kind }: { value: number; max: number; kind: string }) {
  return <div className={cx('bar', kind)}><i style={{ width: percent(value, max) }} /></div>;
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return <div className="row"><span className="muted">{label}</span><b>{value}</b></div>;
}

export function MeterRow({ label, value, max, kind }: { label: string; value: number; max: number; kind: string }) {
  return <div className="row"><span className="muted">{label}</span><Bar value={value} max={max} kind={kind} /></div>;
}

export function Dot({ item }: { item: number }) {
  return <span className="dot" style={{ background: ITEM_COLORS[item] }} />;
}

export function Slot({ item, count }: { item: number; count: number }) {
  return (
    <div className="slot" title={itemName(item)}>
      {item >= 0 && <><Dot item={item} /><b>{count}</b></>}
    </div>
  );
}

/** Nonzero counts as slots. */
export function Slots({ counts }: { counts: number[] }) {
  return (
    <div className="slots">
      {counts.map((count, i) => (count > 0 ? <Slot key={i} item={i} count={count} /> : null))}
    </div>
  );
}

export function Lane({ e }: { e: Entity }) {
  const belt = e.belt!;
  const items = [];
  for (let k = 0; k < belt.length / 2; k++) {
    items.push(<i key={k} style={{ left: percent(Math.trunc(belt[k * 2 + 1] * 90 / 100), 256), background: ITEM_COLORS[belt[k * 2]] }} />);
  }
  return <div className="lane">{items}</div>;
}

export function FluidGauge({ item, amount, max }: { item: number; amount: number; max: number }) {
  return (
    <div title={`${itemName(item)}: ${amount}`}>
      <div className="gauge"><i style={{ height: percent(amount, max), background: ITEM_COLORS[item] }} /></div>
      <small className="muted">{amount}</small>
    </div>
  );
}

export function ProgressRing({ e, time }: { e: Entity; time: number }) {
  const fraction = time <= 0 ? 0 : e.progress / (time * 1000);
  return (
    <svg viewBox="0 0 40 40" style={{ width: '40px', height: '40px' }}>
      <circle cx="20" cy="20" r="16" style={{ fill: 'none', stroke: '#2f3843', strokeWidth: 5 }} />
      <circle cx="20" cy="20" r="16" style={{
        fill: 'none', stroke: '#f0a73a', strokeWidth: 5, strokeDasharray: `${(fraction * 100.5).toFixed(1)} 100.5`,
        transform: 'rotate(-90deg)', transformOrigin: 'center',
      }} />
    </svg>
  );
}

export const stateName = (e: Entity) => (e.state === 0 ? 'idle' : e.state === 1 ? 'carrying' : 'returning');
