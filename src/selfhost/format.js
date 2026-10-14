// src/selfhost/format.js — diagnostics as a person reads them.
//
//   main.utu:7:13: error: Unknown variable 'nope'
//    6 |     let total = p.sum();
//    7 |     total * nope;
//      |             ^^^^
//
// The line before gives the place its context; a span over several lines
// shows each (the first and last two of a long one), underlined. With
// `highlight` (src/selfhost/highlight.js: the classes the compiler gives
// each token and name) and `color`, the code is colored as the compiler
// reads it.

import { paintLine } from './highlight.js';

const LONG = 6;

/**
 * How many columns a terminal gives `text`: a tab four, a wide (East
 * Asian, emoji) character two, a combining mark none, any other one.
 */
function columns(text) {
  let n = 0;
  for (const c of text) {
    const cp = c.codePointAt(0);
    if (c === '\t') n += 4;
    else if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) continue;
    else if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3)
      || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60)
      || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1f64f) || (cp >= 0x1f900 && cp <= 0x1f9ff)
      || (cp >= 0x20000 && cp <= 0x3fffd)) n += 2;
    else n += 1;
  }
  return n;
}

/**
 * Each diagnostic with where it is and its lines, underlined. `files` maps
 * a file key to its text; `relative` shortens a key for display;
 * `highlight(key, start, end)` gives the colored pieces of a range.
 */
export function formatDiagnostics(diagnostics, files, { color = false, relative = key => key, highlight = null } = {}) {
  const paint = (code, text) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
  return diagnostics.map(d => {
    const severity = d.severity ?? 'error';
    const label = paint(severity === 'warning' ? '1;33' : '1;31', `${severity}:`);
    const text = d.file != null ? files.get(d.file) : null;
    if (text == null || d.start == null) return `${d.file != null ? `${relative(d.file)}: ` : ''}${label} ${paint('1', d.message)}`;
    const head = `${paint('1', `${relative(d.file)}:${d.line}:${d.column}:`)} ${label} ${paint('1', d.message)}`;
    const starts = [0];
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
    const lineOf = offset => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; } return lo; };
    const first = d.line - 1;
    // A span ending at a line's start ends on the line before.
    const last = Math.max(first, lineOf(Math.max(d.start, d.end - 1)));
    const lineText = i => text.slice(starts[i], (starts[i + 1] ?? text.length + 1) - 1).replace(/\r$/, '');
    const shown = [];
    if (first > 0 && lineText(first - 1).trim()) shown.push({ line: first - 1, context: true });
    for (let i = first; i <= last; i++) {
      if (last - first + 1 > LONG && i === first + 2) { shown.push({ gap: true }); i = last - 2; continue; }
      shown.push({ line: i });
    }
    const gutter = String(last + 1).length;
    const tabs = s => s.replace(/\t/g, '    ');
    const bar = mark => paint('2', `${mark.padStart(gutter + 1)} |`);
    const out = [head];
    for (const row of shown) {
      if (row.gap) { out.push(paint('2', `${' '.repeat(gutter)}...`)); continue; }
      const raw = lineText(row.line);
      // Painted, then widened: the colors' escapes have no tabs.
      const code = tabs(color && highlight ? paintLine(raw, starts[row.line], highlight(d.file, starts[row.line], starts[row.line] + raw.length)) : raw);
      out.push(`${bar(String(row.line + 1))} ${row.context && color ? `\x1b[2m${tabs(raw)}\x1b[0m` : code}`);
      if (row.context) continue;
      // The part of this line the span covers.
      const from = row.line === first ? d.start - starts[row.line] : raw.length - raw.trimStart().length;
      const to = row.line === last ? Math.min(raw.length, Math.max(from + 1, d.end - starts[row.line])) : raw.length;
      if (to <= from && row.line !== first) continue;
      const pad = columns(raw.slice(0, from));
      const width = Math.max(1, columns(raw.slice(0, to)) - pad);
      out.push(`${bar('')} ${' '.repeat(pad)}${paint('1;31', '^'.repeat(width))}`);
    }
    return out.join('\n');
  }).join('\n\n');
}
