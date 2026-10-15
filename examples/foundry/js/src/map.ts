// The map canvas and the minimap (utu/app.utu's drawing).
import { type Entity, Cls, isBeltLike } from './sim';
import { type Game, COLORS, GLYPHS, ITEM_COLORS, TOOL_NONE, TOOL_REMOVE } from './model';

const tilePx = (game: Game, tile: number, camera: number) => (tile - camera) * game.zoom;

export function drawMap(game: Game, ctx: CanvasRenderingContext2D, width: number, height: number) {
  const w = game.sim;
  const zoom = game.zoom;
  ctx.fillStyle = '#0c0e11';
  ctx.fillRect(0, 0, width, height);
  const x0 = Math.max(0, Math.floor(game.camX));
  const y0 = Math.max(0, Math.floor(game.camY));
  const x1 = Math.min(w.width, Math.ceil(game.camX + width / zoom) + 1);
  const y1 = Math.min(w.height, Math.ceil(game.camY + height / zoom) + 1);
  const glyphs = zoom >= 20;
  if (glyphs) {
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  }
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const px = tilePx(game, tx, game.camX);
      const py = tilePx(game, ty, game.camY);
      const tile = ty * w.width + tx;
      if (w.revealed[(ty >> 3) * w.chunksX + (tx >> 3)] === 0) {
        ctx.fillStyle = '#05060a';
        ctx.fillRect(px, py, zoom, zoom);
        continue;
      }
      if (w.water[tile] === 1) {
        ctx.fillStyle = '#1d4f7a';
        ctx.fillRect(px, py, zoom, zoom);
      } else if (w.resKind[tile] >= 0) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = ITEM_COLORS[w.resKind[tile]];
        ctx.fillRect(px, py, zoom, zoom);
        ctx.globalAlpha = 1;
      }
      const e = w.grid[tile];
      if (e) drawEntity(game, ctx, e, px, py, glyphs);
    }
  }
  drawOverlay(game, ctx);
}

function drawEntity(game: Game, ctx: CanvasRenderingContext2D, e: Entity, px: number, py: number, glyphs: boolean) {
  const zoom = game.zoom;
  ctx.fillStyle = e.cls === Cls.Lamp && e.signal ? '#ffe066' : COLORS[e.machine];
  ctx.fillRect(px + 1, py + 1, zoom - 2, zoom - 2);
  // Direction tick on the side the entity faces.
  const half = zoom / 2;
  const tick = zoom / 5;
  ctx.fillStyle = '#111111';
  if (e.dir === 0) ctx.fillRect(px + half - 2, py + 1, 4, tick);
  else if (e.dir === 1) ctx.fillRect(px + zoom - 1 - tick, py + half - 2, tick, 4);
  else if (e.dir === 2) ctx.fillRect(px + half - 2, py + zoom - 1 - tick, 4, tick);
  else ctx.fillRect(px + 1, py + half - 2, tick, 4);
  if (glyphs) ctx.fillText(GLYPHS[e.machine], px + half, py + half);
  if (e.busy) {
    ctx.fillStyle = '#4cc38a';
    ctx.fillRect(px + 2, py + zoom - 4, zoom - 4, 2);
  }
  if (isBeltLike(e.cls)) {
    const belt = e.belt!;
    for (let k = 0; k < belt.length; k += 2) {
      const along = belt[k + 1] / 256 * (zoom - 6) + 3;
      const ix = e.dir === 1 ? px + along : e.dir === 3 ? px + zoom - along : px + half;
      const iy = e.dir === 2 ? py + along : e.dir === 0 ? py + zoom - along : py + half;
      ctx.fillStyle = ITEM_COLORS[belt[k]];
      ctx.fillRect(ix - 3, iy - 3, 6, 6);
    }
  }
}

function drawOverlay(game: Game, ctx: CanvasRenderingContext2D) {
  const zoom = game.zoom;
  const w = game.sim;
  if (w.inside(game.hoverX, game.hoverY) && game.tool !== TOOL_NONE) {
    const ok = game.tool === TOOL_REMOVE || w.canPlace(game.tool, game.hoverX, game.hoverY, game.dir);
    ctx.strokeStyle = ok ? '#4cc38a' : '#e5534b';
    ctx.lineWidth = 2;
    ctx.strokeRect(tilePx(game, game.hoverX, game.camX) + 1, tilePx(game, game.hoverY, game.camY) + 1, zoom - 2, zoom - 2);
  }
  const selected = game.entity(game.selected);
  if (selected) {
    ctx.strokeStyle = '#f0a73a';
    ctx.lineWidth = 2;
    ctx.strokeRect(tilePx(game, selected.x, game.camX), tilePx(game, selected.y, game.camY), zoom, zoom);
  }
}

/** One pixel per tile. */
export function drawMinimap(game: Game) {
  const canvas = document.querySelector<HTMLCanvasElement>('#minimap');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const w = game.sim;
  ctx.fillStyle = '#0c0e11';
  ctx.fillRect(0, 0, w.width, w.height);
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      const tile = y * w.width + x;
      const e = w.grid[tile];
      const color = e ? COLORS[e.machine] : w.water[tile] === 1 ? '#1d4f7a' : w.resKind[tile] >= 0 ? ITEM_COLORS[w.resKind[tile]] : null;
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}
