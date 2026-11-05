// Source-anchored relationships from the self-hosted compiler's tables.
// The renderer is standalone HTML: it needs no extension scripts or assets.
import { programIndex } from './query.js';
import { placer } from './compiler.js';

const COLORS = { binding: '#2563eb', call: '#059669', import: '#d97706', type: '#7c3aed' };
const LABELS = {
  binding: 'name resolves to declaration', call: 'call reaches function',
  import: 'module imports file', type: 'expression uses type',
};

/** Edges and source locations for a loaded file. Cross-file edges remain in the data. */
export function graphData(utu, files, key) {
  const index = programIndex(utu, files);
  const where = placer(files);
  const source = files.find(file => file.key === key);
  if (!source) throw new Error(`no loaded file ${key}`);
  const edges = [];
  const seen = new Set();
  const add = (kind, from, to, label = '') => {
    if (!from || !to) return;
    const id = `${kind}:${from.file}:${from.start}:${to.file}:${to.start}`;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ kind, from, to, label: label || LABELS[kind] });
  };
  for (const { decl, at } of index.names(key)) {
    const to = index.definition(decl);
    if (to && !(at.file === to.file && at.start === to.start)) add('binding', at, to);
  }
  const kinds = new Uint8Array(utu.node_kind.buffer);
  const first = new Int32Array(utu.node_first.buffer);
  const last = new Int32Array(utu.node_last.buffer);
  const tokStart = new Int32Array(utu.tok_start.buffer);
  const firstChild = new Int32Array(utu.node_child.buffer);
  const lastSibling = new Int32Array(utu.node_next.buffer);
  const nodeDecl = new Int32Array(utu.node_decl.buffer);
  for (let n = 0, count = utu.node_count(); n < count; n++) {
    if (first[n] >= last[n] || tokStart[first[n]] < source.offset || tokStart[first[n]] >= source.offset + source.bytes.length) continue;
    const at = index.at(n);
    if (!at || at.file !== key) continue;
    if (utu.node_kind_name(kinds[n]) === 'call_expr') {
      let callee = firstChild[n];
      if (callee >= 0) {
        let d = nodeDecl[callee];
        if (d < 0) {
          for (let c = firstChild[callee]; c >= 0; c = lastSibling[c]) if (nodeDecl[c] >= 0) d = nodeDecl[c];
        }
        if (d >= 0) add('call', at, index.definition(d));
      }
    }
    const typeDecl = utu.node_type_decl?.(n, 1) ?? -1;
    if (typeDecl >= 0) add('type', at, index.definition(typeDecl));
  }
  // The host has resolved parsed imports into `files`, while host-only paths
  // stay as their own labels. import_target is internal to the compiler.
  for (let i = 0, count = utu.import_count(); i < count; i++) {
    const sourceFile = files[utu.import_from(i)];
    if (sourceFile?.key !== key) continue;
    const start = where(utu.import_path_start(i));
    const end = where(utu.import_path_end(i));
    const from = start && { file: start.file.key, start: start.offset, end: end?.offset ?? start.offset };
    const raw = new TextDecoder().decode(new Uint8Array(utu.src.buffer, utu.import_path_start(i), utu.import_path_end(i) - utu.import_path_start(i))).replace(/^['"]|['"]$/g, '');
    const toFile = files.find(file => file.key === raw || file.key.endsWith(`/${raw.replace(/^\.\//, '')}`));
    const to = { file: toFile?.key ?? raw, start: 0, end: 0 };
    add('import', from, to, `imports ${to.file}`);
  }
  return { key, source: source.text, edges };
}

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

/** Standalone SVG-over-source graph page, with switches for each edge kind. */
export function renderGraphHtml(utu, files, key) {
  const { source, edges } = graphData(utu, files, key);
  const lines = source.split('\n');
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  const pos = offset => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return { x: 64 + (offset - starts[lo]) * 8.4, y: 24 + lo * 20 };
  };
  const local = edges.filter(edge => edge.from.file === key && edge.to.file === key);
  const external = edges.filter(edge => edge.from.file === key && edge.to.file !== key);
  const width = Math.max(720, 64 + Math.max(40, ...lines.map(line => line.length)) * 8.4 + 180);
  const height = 32 + lines.length * 20;
  const paths = local.map(edge => {
    const a = pos(edge.from.start), b = pos(edge.to.start);
    const bend = Math.min(120, 24 + Math.abs(a.y - b.y) * .35);
    return `<path class="edge ${edge.kind}" d="M${a.x} ${a.y - 5} C${a.x + bend} ${a.y - 24},${b.x + bend} ${b.y - 24},${b.x} ${b.y - 5}" stroke="${COLORS[edge.kind]}"><title>${escape(edge.label)}</title></path>`;
  }).join('\n');
  const text = lines.map((line, i) => `<text class="ln" x="8" y="${24 + i * 20}">${i + 1}</text><text class="src" x="64" y="${24 + i * 20}">${escape(line)}</text>`).join('\n');
  const counts = Object.keys(COLORS).map(kind => `<label><input type="checkbox" data-kind="${kind}" checked><span style="color:${COLORS[kind]}">●</span> ${escape(LABELS[kind])} (${edges.filter(edge => edge.kind === kind).length})</label>`).join(' ');
  const links = external.map(edge => `<li>${escape(edge.label)} — ${escape(edge.to.file)}</li>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>utu graphs — ${escape(key)}</title>
<style>body{font:13px system-ui,sans-serif;color:CanvasText;background:Canvas;margin:24px}h1{font-size:16px}.legend{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}.wrap{overflow:auto;border:1px solid #8886;border-radius:6px}svg{display:block;font:12px ui-monospace,monospace;white-space:pre}.ln{fill:#888}.src{fill:CanvasText}.edge{fill:none;stroke-width:1.5;opacity:.7}.edge:hover{opacity:1;stroke-width:2.5}.edge.off{display:none}</style>
<h1>Compiler graphs</h1><p>${escape(key)}</p><div class="legend">${counts}</div>
<div class="wrap"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths}${text}</svg></div>
${links ? `<h2>Other files</h2><ul>${links}</ul>` : ''}
<script>for(const box of document.querySelectorAll('input[data-kind]'))box.addEventListener('change',()=>{for(const edge of document.querySelectorAll('.edge.'+box.dataset.kind))edge.classList.toggle('off',!box.checked)})</script>`;
}
