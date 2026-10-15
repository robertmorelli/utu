// Foundry in TypeScript + React: the entry point, frame loop, map input, and
// the benchmark protocol from UI.md (the counterpart of utu/app.utu).
import { type RefObject, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Sim } from './sim';
import { Game, TOOL_NONE, TOOL_REMOVE } from './model';
import { drawMap, drawMinimap } from './map';
import { Footer, Hud, Inspector, Palette, Windows } from './ui';
import { GameContext, useGame } from './widgets';
import css from '../../data/style.css';

const params = new URL(location.href).searchParams;
const paramInt = (name: string, fallback: number) => {
  const text = params.get(name);
  return text === null ? fallback : Number.parseInt(text, 10);
};

const average = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, v) => a + v, 0) / values.length);
function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.trunc(sorted.length * fraction))];
}

function report(game: Game, intervals: number[], work: number[]) {
  const pre = document.createElement('pre');
  pre.id = 'bench-result';
  pre.textContent = `{"frames":${intervals.length},"intervalAvg":${average(intervals).toFixed(3)},"intervalP95":${percentile(intervals, 0.95).toFixed(3)}`
    + `,"workAvg":${average(work).toFixed(3)},"workP95":${percentile(work, 0.95).toFixed(3)},"hash":${game.sim.hash()}}`;
  document.body.append(pre);
}

function MapCanvas({ canvas }: { canvas: RefObject<HTMLCanvasElement | null> }) {
  const { game } = useGame();
  // React's wheel listener is passive: zooming must prevent the page's scroll.
  useEffect(() => {
    const map = canvas.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const before = game.zoom;
      game.zoom = Math.max(12, Math.min(48, game.zoom * (event.deltaY < 0 ? 1.15 : 0.87)));
      game.camX += event.offsetX / before - event.offsetX / game.zoom;
      game.camY += event.offsetY / before - event.offsetY / game.zoom;
    };
    map.addEventListener('wheel', wheel, { passive: false });
    return () => map.removeEventListener('wheel', wheel);
  }, [canvas, game]);
  return (
    <main className="map">
      <canvas id="map" ref={canvas}
        onMouseDown={event => {
          game.drag = true;
          game.dragged = false;
          game.dragX = event.nativeEvent.offsetX;
          game.dragY = event.nativeEvent.offsetY;
        }}
        onMouseMove={event => {
          const { offsetX, offsetY } = event.nativeEvent;
          game.hoverX = Math.floor(game.camX + offsetX / game.zoom);
          game.hoverY = Math.floor(game.camY + offsetY / game.zoom);
          if (game.drag && (game.tool === TOOL_NONE || event.buttons === 2)) {
            const dx = offsetX - game.dragX, dy = offsetY - game.dragY;
            if (Math.abs(dx) + Math.abs(dy) > 3) game.dragged = true;
            if (game.dragged) {
              game.pan(-dx / game.zoom, -dy / game.zoom);
              game.dragX = offsetX;
              game.dragY = offsetY;
            }
          }
        }}
        onMouseUp={() => {
          if (!game.dragged) game.clickTile(game.hoverX, game.hoverY);
          game.drag = false;
        }}
        onMouseLeave={() => {
          game.drag = false;
          game.hoverX = -1;
        }}
        onContextMenu={event => event.preventDefault()} />
    </main>
  );
}

function App({ game }: { game: Game }) {
  const [, setVersion] = useState(0);
  const refresh = () => setVersion(v => v + 1);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key;
      if (key === 'r' || key === 'R') game.dir = (game.dir + 1) % 4;
      else if (key === 'x' || key === 'X') game.tool = TOOL_REMOVE;
      else if (key === 'Escape') { game.tool = TOOL_NONE; game.windows = []; }
      else {
        if (key === 'w' || key === 'ArrowUp') game.pan(0, -2);
        if (key === 's' || key === 'ArrowDown') game.pan(0, 2);
        if (key === 'a' || key === 'ArrowLeft') game.pan(-2, 0);
        if (key === 'd' || key === 'ArrowRight') game.pan(2, 0);
        if (key === ' ') game.speed = game.speed === 0 ? 1 : 0;
      }
      refresh();
    };
    document.addEventListener('keydown', keydown);

    // Every frame: the ticks, the map, the minimap every 30 frames, then every panel.
    const map = canvas.current!;
    const ctx = map.getContext('2d')!;
    const bench = { frames: paramInt('bench', 0), lastTime: -1, intervals: [] as number[], work: [] as number[] };
    let request = 0;
    const frame = (time: number) => {
      const started = performance.now();
      if (map.width !== map.clientWidth || map.height !== map.clientHeight) {
        map.width = map.clientWidth;
        map.height = map.clientHeight;
      }
      for (let k = 0; k < game.speed; k++) game.sim.step();
      game.changed();
      game.sample();
      drawMap(game, ctx, map.width, map.height);
      if (game.frame % 30 === 0) drawMinimap(game);
      game.frame += 1;
      // Every panel updates in this frame, and is part of its work.
      flushSync(refresh);
      if (bench.frames > 0 && bench.intervals.length < bench.frames) {
        if (bench.lastTime >= 0) {
          bench.intervals.push(time - bench.lastTime);
          bench.work.push(performance.now() - started);
          if (bench.intervals.length === bench.frames) report(game, bench.intervals, bench.work);
        }
        bench.lastTime = time;
      }
      request = requestAnimationFrame(frame);
    };
    request = requestAnimationFrame(frame);
    return () => {
      document.removeEventListener('keydown', keydown);
      cancelAnimationFrame(request);
    };
  }, [game]);

  return (
    <GameContext value={{ game, refresh }}>
      <div className="app">
        <Hud />
        <Palette />
        <MapCanvas canvas={canvas} />
        <Inspector />
        <Footer />
        <Windows />
      </div>
    </GameContext>
  );
}

function start(saveText: string, starterText: string) {
  const game = new Game(Sim.load(JSON.parse(saveText)), starterText);
  game.speed = paramInt('speed', 1);
  game.pinPanels(paramInt('panels', 0));
  for (const name of params.get('windows')?.split(',') ?? []) game.toggleWindow(name);
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  const root = document.createElement('div');
  root.style.display = 'contents';
  document.body.append(root);
  createRoot(root).render(<App game={game} />);
}

const starter = document.getElementById('starter')!.textContent!;
const save = params.get('save');
if (save) fetch(save).then(response => response.text()).then(text => start(text, starter));
else start(starter, starter);
