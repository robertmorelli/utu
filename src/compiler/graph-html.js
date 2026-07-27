// graph-html.js — render the compiler's graphs as a self-contained page
//
// The graphs are anchored to source positions, so the layout is the source
// itself: every node sits where its code sits, and edges arc between them. A
// generic node-link layout would throw that away and is much harder to read —
// the question these graphs answer is always "why does *this* bit of code have
// this type", and that question is positional.
//
// No external assets, matching PRINCIPLES #1: one file, opens anywhere.

import { extractGraphs, countByKind, EDGE_KINDS } from './graph-view.js';

const KIND_STYLE = {
  binding:     { colour: '#2563eb', label: 'binding — a use resolves to its declaration' },
  expectation: { colour: '#b45309', label: 'expectation — a value must satisfy a declared type' },
  provenance:  { colour: '#7c3aed', label: 'provenance — a node was rewritten from another' },
};

const CHAR_W = 8.4;
const LINE_H = 20;
const GUTTER = 62;

/**
 * @param {Document} doc      compiled IR
 * @param {string}   source   the original source text
 * @param {string}   file     path, for the heading
 * @returns {string} a complete HTML document
 */
export function renderGraphHtml(doc, source, file) {
  const { nodes, edges } = extractGraphs(doc);
  const lines = source.split('\n');

  // Only nodes that actually take part in an edge, and only those with a
  // position in this file — the prelude contributes thousands otherwise.
  const involved = new Set(edges.flatMap(edge => [edge.from, edge.to]));
  const placed = new Map();
  for (const id of involved) {
    const node = nodes.get(id);
    if (node?.row != null && node.col != null && node.file === file) placed.set(id, node);
  }
  const drawn = edges.filter(edge => placed.has(edge.from) && placed.has(edge.to));

  const width = Math.max(720, GUTTER + Math.max(...lines.map(l => l.length), 40) * CHAR_W + 260);
  const height = lines.length * LINE_H + 40;

  return `<!doctype html>
<meta charset="utf-8">
<title>utu graphs — ${escapeHtml(file.split('/').pop())}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 24px; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         background: Canvas; color: CanvasText; }
  h1 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
  .path { color: #6b7280; font-size: 12px; margin-bottom: 16px; word-break: break-all; }
  .legend { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
  .legend label { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
  .swatch { width: 22px; height: 3px; border-radius: 2px; }
  .count { color: #6b7280; }
  .wrap { overflow-x: auto; border: 1px solid color-mix(in srgb, CanvasText 15%, transparent);
          border-radius: 6px; }
  svg { display: block; font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .ln { fill: #9ca3af; }
  .src { fill: CanvasText; white-space: pre; }
  .node { fill: color-mix(in srgb, CanvasText 8%, transparent); }
  .node.err { fill: color-mix(in srgb, #dc2626 22%, transparent); }
  .edge { fill: none; stroke-width: 1.4; opacity: .75; }
  .edge:hover { opacity: 1; stroke-width: 2.4; }
  .edge.off { display: none; }
  .tip { font-size: 11px; fill: #6b7280; }
  .empty { color: #6b7280; padding: 24px; }
</style>
<h1>Compiler graphs</h1>
<div class="path">${escapeHtml(file)}</div>
<div class="legend">${legend(countByKind(drawn))}</div>
<div class="wrap">
${drawn.length === 0
  ? '<div class="empty">No graph edges anchored in this file.</div>'
  : svg(lines, placed, drawn, width, height)}
</div>
<script>
for (const box of document.querySelectorAll('input[data-kind]')) {
  box.addEventListener('change', () => {
    for (const e of document.querySelectorAll('.edge.k-' + box.dataset.kind)) {
      e.classList.toggle('off', !box.checked);
    }
  });
}
</script>
`;
}

function legend(counts) {
  return EDGE_KINDS.map((kind) => {
    const { colour, label } = KIND_STYLE[kind];
    return `<label><input type="checkbox" data-kind="${kind}" checked>` +
      `<span class="swatch" style="background:${colour}"></span>` +
      `${escapeHtml(label)} <span class="count">(${counts[kind] ?? 0})</span></label>`;
  }).join('');
}

function svg(lines, placed, edges, width, height) {
  const text = lines.map((line, i) => {
    const y = (i + 1) * LINE_H;
    return `<text class="ln" x="8" y="${y}">${String(i + 1).padStart(3)}</text>` +
           `<text class="src" x="${GUTTER}" y="${y}">${escapeHtml(line)}</text>`;
  }).join('\n');

  const boxes = [...placed.values()].map((node) => {
    const { x, y, w } = box(node);
    return `<rect class="node${node.error ? ' err' : ''}" x="${x - 1}" y="${y - 12}" ` +
           `width="${w + 2}" height="16" rx="3"><title>${escapeHtml(describe(node))}</title></rect>`;
  }).join('\n');

  // Edges are drawn from the head (the node that has the attribute) back to the
  // tail, which is the direction blame is read in.
  const arcs = edges.map((edge) => {
    const from = anchor(placed.get(edge.from));
    const to = anchor(placed.get(edge.to));
    const bow = Math.min(90, 18 + Math.abs(from.y - to.y) * 0.35);
    const dir = from.x <= to.x ? 1 : -1;
    const path = `M ${from.x} ${from.y} C ${from.x + bow * dir} ${from.y}, ` +
                 `${to.x - bow * dir} ${to.y}, ${to.x} ${to.y}`;
    return `<path class="edge k-${edge.kind}" stroke="${KIND_STYLE[edge.kind].colour}" d="${path}">` +
           `<title>${escapeHtml(edge.label ?? edge.kind)}</title></path>`;
  }).join('\n');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${text}
${boxes}
${arcs}
</svg>`;
}

function box(node) {
  const sameLine = node.endRow === node.row;
  const chars = sameLine ? Math.max(1, node.endCol - node.col) : 1;
  return {
    x: GUTTER + (node.col - 1) * CHAR_W,
    y: node.row * LINE_H,
    w: chars * CHAR_W,
  };
}

function anchor(node) {
  const { x, y, w } = box(node);
  return { x: x + w / 2, y: y - 4 };
}

function describe(node) {
  const parts = [`<${node.tag}>`];
  if (node.name) parts.push(node.name);
  if (node.type) parts.push(`type ${node.type}`);
  if (node.expect) parts.push(`expects ${node.expect}`);
  if (node.pass) parts.push(`from ${node.pass}`);
  if (node.error) parts.push(`error ${node.error}`);
  return parts.join('  ·  ');
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}
