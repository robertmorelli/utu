// src/selfhost/format.js — diagnostics as a person reads them.
//
//    ERROR  Unknown variable 'nope'
//           unknown-variable · main.utu:7:13
//
//    6 │     let total = p.sum();
//    7 │     total * nope;
//      │             ╰─ a label, when the compiler gives one
//
//     note  one sentence on the rule, when the compiler gives one
//
//     fix   what the fix does
//    7 │     total * note;
//
// The severity stands in a filled pill beside the problem; the kind and
// place follow, quiet. Each mark is a tint laid over the code itself, not
// an underline: the error in the severity's color, where a requirement came
// from in blue, where a value came from in amber, other context in grey,
// each label hanging below. A fix is the corrected line, its edit
// highlighted. With `highlight` (src/selfhost/highlight.js: the classes the
// compiler gives each token and name) the code is colored as the compiler
// reads it. Without color, marks are thin rules under the code.

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

// ── Colors ───────────────────────────────────────────────────────────────────

const PALETTES = {
  dark: {
    bg: [18, 20, 26], fg: [215, 218, 224], dim: [118, 124, 138], rail: [62, 67, 80],
    error: [255, 107, 107], warning: [245, 185, 66], trap: [199, 146, 234],
    expected: [108, 182, 255], found: [240, 166, 74], related: [154, 163, 178], add: [95, 211, 141], del: [255, 123, 123],
    keyword: [179, 157, 243], string: [158, 206, 106], number: [232, 169, 106], type: [125, 207, 255],
    function: [130, 170, 255], comment: [100, 108, 122], dsl: [158, 206, 106],
  },
  light: {
    bg: [253, 252, 249], fg: [43, 46, 54], dim: [128, 133, 144], rail: [200, 196, 186],
    error: [214, 58, 58], warning: [183, 121, 31], trap: [142, 68, 173],
    expected: [31, 111, 209], found: [184, 98, 11], related: [107, 114, 128], add: [31, 138, 76], del: [192, 57, 43],
    keyword: [124, 77, 204], string: [77, 124, 15], number: [180, 83, 9], type: [14, 116, 144],
    function: [37, 99, 235], comment: [156, 163, 175], dsl: [77, 124, 15],
  },
};

/** Light or dark: UTU_THEME says, else COLORFGBG (a light background is 7 or 15), else dark. */
export function terminalTheme(env = globalThis.process?.env ?? {}) {
  if (env.UTU_THEME === 'light' || env.UTU_THEME === 'dark') return env.UTU_THEME;
  const bg = Number(env.COLORFGBG?.split(';').pop());
  return bg === 7 || bg === 15 ? 'light' : 'dark';
}

/** 24-bit color where the terminal says it has it (COLORTERM), else the 256-color palette. */
export function trueColor(env = globalThis.process?.env ?? {}) {
  return /truecolor|24bit/i.test(env.COLORTERM ?? '') || ['iTerm.app', 'WezTerm', 'vscode', 'ghostty', 'kitty'].includes(env.TERM_PROGRAM);
}

/** The nearest of the 256-color palette's 6×6×6 cube and grey ramp. */
function to256([r, g, b]) {
  const level = v => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.floor((v - 35) / 40)));
  const cube = 16 + 36 * level(r) + 6 * level(g) + level(b);
  const value = l => (l === 0 ? 0 : 55 + l * 40);
  const cubeDistance = (value(level(r)) - r) ** 2 + (value(level(g)) - g) ** 2 + (value(level(b)) - b) ** 2;
  const grey = Math.round(((r + g + b) / 3 - 8) / 10);
  const greyIndex = 232 + Math.max(0, Math.min(23, grey));
  const greyValue = 8 + 10 * (greyIndex - 232);
  const greyDistance = (greyValue - r) ** 2 + (greyValue - g) ** 2 + (greyValue - b) ** 2;
  return greyDistance < cubeDistance ? greyIndex : cube;
}

/**
 * The pen everything is drawn with: colors from the palette (24-bit or 256),
 * or none at all.
 */
export function pen({ color = false, theme = terminalTheme(), truecolor = trueColor() } = {}) {
  const p = PALETTES[theme] ?? PALETTES.dark;
  const sgr = (layer, rgb) => truecolor ? `\x1b[${layer};2;${rgb.join(';')}m` : `\x1b[${layer};5;${to256(rgb)}m`;
  const mix = (rgb, amount) => rgb.map((v, i) => Math.round(p.bg[i] + (v - p.bg[i]) * amount));
  const on = !!color;
  return {
    on,
    palette: p,
    fg: rgb => on ? sgr(38, rgb) : '',
    bg: rgb => on ? sgr(48, rgb) : '',
    tint: (rgb, amount) => on ? sgr(48, mix(rgb, amount)) : '',
    bold: on ? '\x1b[1m' : '',
    italic: on ? '\x1b[3m' : '',
    strike: on ? '\x1b[9m' : '',
    reset: on ? '\x1b[0m' : '',
    paint(rgb, text) { return on ? `${sgr(38, rgb)}${text}\x1b[0m` : text; },
  };
}

// ── The shared shape: a pill and the problem, then quiet details ───────────────

/**
 * The first two lines of every problem utu reports: the severity in a pill
 * beside the problem, then its kind and where, quiet.
 */
export function heading(ink, severity, title, detail) {
  const word = severity.toUpperCase();
  const tone = ink.palette[severity] ?? ink.palette.error;
  const pill = ink.on ? `${ink.bg(tone)}${ink.fg(ink.palette.bg)}${ink.bold} ${word} ${ink.reset}` : ` ${word} `;
  const lines = [`${pill} ${ink.bold}${title}${ink.reset}`];
  if (detail) lines.push(`${' '.repeat(word.length + 3)}${ink.paint(ink.palette.dim, detail)}`);
  return lines;
}

/** Quiet lines under a problem: notes, or a trap's frames. */
export function notes(ink, list) {
  return (list ?? []).map(text => `  ${ink.paint(ink.palette.dim, 'note')}  ${text}`);
}

// ── Diagnostics ──────────────────────────────────────────────────────────────

const ROLE_TINT = { primary: 0.32, expected: 0.24, found: 0.24, related: 0.2 };

/**
 * Each diagnostic in the design above. `files` maps a file key to its text;
 * `relative` shortens a key for display; `highlight(key, start, end)` gives
 * the classed pieces of a range.
 */
export function formatDiagnostics(diagnostics, files, { color = false, relative = key => key, highlight = null, theme, truecolor } = {}) {
  const ink = pen({ color, theme, truecolor });
  return diagnostics.map(d => formatOne(d, files, ink, relative, highlight)).join('\n\n');
}

function formatOne(d, files, ink, relative, highlight) {
  const severity = d.severity ?? 'error';
  const sev = ink.palette[severity] ?? ink.palette.error;
  const code = d.code ?? d.kind ?? '';
  const at = d.focus ?? d;
  const where = d.file != null ? `${relative(d.file)}${at.line != null ? `:${at.line}:${at.column}` : ''}` : '';
  const out = heading(ink, severity, d.message, [code, where].filter(Boolean).join(' · '));

  // Every mark, primary first, grouped by file.
  const marks = [];
  if (d.file != null && d.start != null && files.get(d.file) != null) marks.push({ file: d.file, start: d.focus?.start ?? d.start, end: d.focus?.end ?? d.end, role: 'primary', label: d.label });
  for (const r of d.related ?? []) if (files.get(r.file) != null) marks.push({ file: r.file, start: r.start, end: r.end, role: r.role, label: r.label });
  const order = [...new Set(marks.map(m => m.file))];
  const views = order.map(file => view(files.get(file), file, marks.filter(m => m.file === file), d.file === file));
  const width = Math.max(2, ...views.flatMap(v => v.rows.filter(r => r.line != null).map(r => String(r.line + 1).length)));
  const gutter = n => `${ink.paint(ink.palette.dim, String(n ?? '').padStart(width))} ${ink.paint(ink.palette.rail, '│')} `;
  for (const v of views) {
    out.push('');
    if (v.file !== d.file) out.push(`${' '.repeat(width)} ${ink.paint(ink.palette.rail, '╭─')} ${ink.paint(ink.palette.dim, relative(v.file))}`);
    for (const row of v.rows) {
      if (row.gap) { out.push(`${' '.repeat(width)} ${ink.paint(ink.palette.rail, '┆')}`); continue; }
      out.push(gutter(row.line + 1) + codeLine(row, v, ink, sev, highlight));
      for (const below of labelRows(row, ink, sev)) out.push(gutter() + below);
    }
  }
  if (d.notes?.length) out.push('', ...notes(ink, d.notes));
  if (d.fix && files.get(d.fix.file ?? d.file) != null) out.push('', ...fixLines(d.fix, files.get(d.fix.file ?? d.file), ink, gutter, width));
  return out.join('\n');
}

/**
 * The lines of one file a diagnostic shows: each mark's lines (a long one's
 * first and last two), the line before the primary mark for context, and
 * gaps where lines are skipped. Each row knows the marks on it.
 */
function view(text, file, marks, primaryFile) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  const lineOf = offset => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; } return lo; };
  const lineText = i => text.slice(starts[i], (starts[i + 1] ?? text.length + 1) - 1).replace(/\r$/, '');
  const shown = new Set();
  for (const m of marks) {
    m.first = lineOf(m.start);
    // A span ending at a line's start ends on the line before.
    m.last = Math.max(m.first, lineOf(Math.max(m.start, m.end - 1)));
    for (let i = m.first; i <= m.last; i++) if (m.last - m.first + 1 <= LONG || i < m.first + 2 || i > m.last - 2) shown.add(i);
  }
  const primary = marks.find(m => m.role === 'primary');
  const context = primary && primaryFile && primary.first > 0 && !shown.has(primary.first - 1) && lineText(primary.first - 1).trim() ? primary.first - 1 : -1;
  if (context >= 0) shown.add(context);
  const rows = [];
  let previous = null;
  for (const line of [...shown].sort((a, b) => a - b)) {
    if (previous != null && line > previous + 1) rows.push({ gap: true });
    previous = line;
    const raw = lineText(line);
    const on = marks.filter(m => m.first <= line && line <= m.last).map(m => {
      const from = line === m.first ? m.start - starts[line] : raw.length - raw.trimStart().length;
      const to = line === m.last ? Math.min(raw.length, Math.max(from + 1, m.end - starts[line])) : raw.length;
      return { mark: m, from, to: Math.max(to, from + (raw.length > from ? 1 : 0)), ends: line === m.last };
    });
    rows.push({ line, raw, offset: starts[line], marks: on, context: line === context });
  }
  return { file, rows };
}

/** A line of code: colored as the compiler reads it, each mark tinted over it. */
function codeLine(row, v, ink, sev, highlight) {
  const raw = row.raw;
  const tabs = s => s.replace(/\t/g, '    ');
  if (!ink.on) return tabs(raw);
  if (row.context) return ink.paint(ink.palette.dim, tabs(raw));
  const pieces = highlight ? highlight(v.file, row.offset, row.offset + raw.length) : [];
  // Where each character's tint comes from: the innermost (latest) mark over it.
  const tintAt = new Array(raw.length).fill(null);
  for (const { mark, from, to } of row.marks) for (let i = from; i < to && i < raw.length; i++) tintAt[i] = mark.role;
  const classAt = new Array(raw.length).fill(null);
  for (const piece of pieces) for (let i = Math.max(0, piece.start - row.offset); i < Math.min(raw.length, piece.end - row.offset); i++) classAt[i] = piece.class;
  let out = '';
  let i = 0;
  while (i < raw.length) {
    let j = i + 1;
    while (j < raw.length && tintAt[j] === tintAt[i] && classAt[j] === classAt[i]) j++;
    const role = tintAt[i];
    const cls = classAt[i];
    const fg = ink.palette[cls] ?? ink.palette.fg;
    const style = (role ? ink.tint(role === 'primary' ? sev : ink.palette[role], ROLE_TINT[role]) : '')
      + (role === 'primary' ? ink.bold : '') + (cls === 'comment' || cls === 'parameter' ? ink.italic : '') + ink.fg(cls === 'comment' ? ink.palette.comment : fg);
    out += `${style}${tabs(raw.slice(i, j))}${ink.reset}`;
    i = j;
  }
  return out;
}

/**
 * What hangs below a line: for each mark ending on it, its label on a hook,
 * the marks to its left running down past it. Without color the marks are
 * drawn first, as rules under the code (heavy for the error).
 */
function labelRows(row, ink, sev) {
  const ending = row.marks.filter(m => m.ends).sort((a, b) => a.from - b.from);
  if (!ending.length) return [];
  const col = i => columns(row.raw.slice(0, i));
  const tone = m => m.mark.role === 'primary' ? sev : ink.palette[m.mark.role];
  const rows = [];
  if (!ink.on) {
    let line = '', at = 0;
    for (const m of ending) {
      const a = col(m.from), b = Math.max(a + 1, col(m.to));
      if (a < at) continue;
      line += ' '.repeat(a - at) + (m.mark.role === 'primary' ? '━' : '─').repeat(b - a);
      at = b;
    }
    rows.push(line);
  }
  const labelled = ending.filter(m => m.mark.label);
  for (let i = labelled.length - 1; i >= 0; i--) {
    let line = '', at = 0;
    for (let j = 0; j < i; j++) {
      const c = col(labelled[j].from);
      line += ' '.repeat(Math.max(0, c - at)) + ink.paint(tone(labelled[j]), '│');
      at = c + 1;
    }
    const c = col(labelled[i].from);
    line += ' '.repeat(Math.max(0, c - at)) + ink.paint(tone(labelled[i]), '╰─') + ' ' + labelled[i].mark.label;
    rows.push(line);
  }
  return rows;
}

/** A fix: what it does, then the corrected line with its edit highlighted. */
function fixLines(fix, text, ink, gutter) {
  const lineStart = text.lastIndexOf('\n', fix.start - 1) + 1;
  const lineEnd = (() => { const e = text.indexOf('\n', fix.end); return e < 0 ? text.length : e; })();
  const before = text.slice(lineStart, lineEnd);
  const after = text.slice(lineStart, fix.start) + fix.text + text.slice(fix.end, lineEnd);
  const line = text.slice(0, lineStart).split('\n').length;
  const out = [`  ${ink.paint(ink.palette.add, `${ink.bold}fix`)}   ${fix.label ?? ''}`];
  if (!ink.on) {
    // Only the corrected lines, when an edit cannot be shown inline.
    after.split('\n').forEach((l, k) => out.push(gutter(line + k) + l));
    return out;
  }
  const runs = diff(before, after);
  const drawn = runs.map(r => r.k === '=' ? ink.paint(ink.palette.fg, r.t)
    : r.k === '+' ? `${ink.tint(ink.palette.add, 0.28)}${ink.fg(ink.palette.add)}${r.t}${ink.reset}`
    : `${ink.fg(ink.palette.del)}${ink.strike}${r.t}${ink.reset}`).join('');
  drawn.split('\n').forEach((l, k) => out.push(gutter(line + k) + l));
  return out;
}

/** The smallest word-level edit from `a` to `b`, as runs kept (=), removed (-), and inserted (+). */
function diff(lineA, lineB) {
  const split = s => s.match(/[A-Za-z0-9_]+|\s+|./gs) ?? [];
  const a = split(lineA), b = split(lineB), n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const runs = [];
  const push = (k, t) => { const r = runs[runs.length - 1]; if (r?.k === k) r.t += t; else runs.push({ k, t }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('=', a[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) push('-', a[i++]); else push('+', b[j++]);
  }
  while (i < n) push('-', a[i++]);
  while (j < m) push('+', b[j++]);
  return runs;
}
