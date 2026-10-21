// The redesigned diagnostics (examples/error_demo/redesign.json), drawn in the
// terminal as utu would print them: a severity pill and the problem in one
// line, the code with each mark laid over it as a tinted highlight and its
// label hanging below, notes, and the fix as a diff. 24-bit color.
//
//   node scripts/show-diagnostics.mjs [filter ...] [--today] [--light] [--list]
//
//   filter    substrings of a catalog file (types/24, unknown-method, ...);
//             every diagnostic when none is given
//   --today   also print what utu prints today, above each redesign
//   --light   colors for a light terminal
//   --list    one line per diagnostic: file, code, title
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'examples', 'error_demo', 'redesign.json');
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const filters = args.filter(arg => !arg.startsWith('--'));
const light = flag('--light');

// The palette: one tint per side of the story, the severity's color for the error itself.
const PALETTE = light ? {
  bg: [253, 252, 249], fg: [43, 46, 54], dim: [138, 143, 154], rail: [205, 200, 190],
  error: [214, 58, 58], warning: [183, 121, 31], trap: [142, 68, 173],
  expected: [31, 111, 209], found: [184, 98, 11], related: [107, 114, 128], add: [31, 138, 76], del: [192, 57, 43],
  kw: [124, 77, 204], str: [77, 124, 15], num: [180, 83, 9], type: [14, 116, 144], comment: [156, 163, 175],
} : {
  bg: [18, 20, 26], fg: [215, 218, 224], dim: [109, 115, 128], rail: [52, 57, 70],
  error: [255, 107, 107], warning: [245, 185, 66], trap: [199, 146, 234],
  expected: [108, 182, 255], found: [240, 166, 74], related: [154, 163, 178], add: [95, 211, 141], del: [255, 123, 123],
  kw: [179, 157, 243], str: [158, 206, 106], num: [232, 169, 106], type: [125, 207, 255], comment: [92, 99, 112],
};
const color = process.stdout.isTTY || process.env.FORCE_COLOR ? !process.env.NO_COLOR : false;
const fg = c => color ? `\x1b[38;2;${c.join(';')}m` : '';
const bg = c => color ? `\x1b[48;2;${c.join(';')}m` : '';
const mix = (c, amount) => c.map((v, i) => Math.round(PALETTE.bg[i] + (v - PALETTE.bg[i]) * amount));
const RESET = color ? '\x1b[0m' : '';
const BOLD = color ? '\x1b[1m' : '';
const STRIKE = color ? '\x1b[9m' : '';
const paint = (c, text) => `${fg(c)}${text}${RESET}`;

// {e:..} expected side, {f:..} found side, {c:..} code, {n:..} a name
function markup(text, base = '') {
  return String(text ?? '').replace(/\{([efcn]):([^{}]*)\}/g, (_, k, t) =>
    k === 'e' ? `${fg(PALETTE.expected)}${t}${RESET}${base}`
    : k === 'f' ? `${fg(PALETTE.found)}${t}${RESET}${base}`
    : k === 'c' ? `${bg(mix(PALETTE.fg, 0.12))}${t}${RESET}${base}`
    : `${BOLD}${t}${RESET}${base}`);
}
const plain = text => String(text ?? '').replace(/\{[efcn]:([^{}]*)\}/g, '$1');

// Light syntax coloring for a run of utu code.
const KEYWORDS = new Set('fn let export main lib if else while for alt match promote orelse fatal return break continue struct enum tag rec proto mod using from test assert defer yield await prune mem vec const true false null and or not self lazy cl fun async'.split(' '));
function syntax(text, under = '') {
  let out = '';
  for (const [token] of text.matchAll(/\/\/.*|"(?:[^"\\]|\\.)*"?|\d[\d_.]*(?:e[+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|\s+|./gi)) {
    const c = token.startsWith('//') ? PALETTE.comment : token.startsWith('"') ? PALETTE.str : /^\d/.test(token) ? PALETTE.num
      : KEYWORDS.has(token) ? PALETTE.kw : /^[A-Z]/.test(token) ? PALETTE.type : PALETTE.fg;
    out += `${under}${fg(c)}${token}`;
  }
  return out + RESET;
}

const ROLE = { primary: null, expected: PALETTE.expected, found: PALETTE.found, related: PALETTE.related };
function marked(text, marks, sev) {
  let out = '', at = 0;
  for (const m of [...marks].sort((a, b) => a.from - b.from)) {
    const a = Math.max(at, m.from - 1), b = Math.min(text.length, m.to - 1);
    out += syntax(text.slice(at, a));
    const tint = ROLE[m.role] ?? sev;
    out += syntax(text.slice(a, b), bg(mix(tint, m.role === 'primary' ? 0.3 : 0.22)) + (m.role === 'primary' ? BOLD : ''));
    at = b;
  }
  return out + syntax(text.slice(at));
}

// The smallest word-level edit from a to b.
function diff(lineA, lineB) {
  const split = s => s.match(/[A-Za-z0-9_]+|\s+|./g) ?? [];
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

function render(entry) {
  const d = entry.ideal;
  const sev = PALETTE[d.severity] ?? PALETTE.error;
  const out = [];
  const word = d.severity.toUpperCase();
  let loc = '';
  for (const sn of d.snippets ?? []) for (const ln of sn.lines) for (const m of ln.marks ?? []) if (m.role === 'primary' && !loc) loc = `${sn.file ?? `examples/error_demo/${entry.file}`}:${ln.n}:${m.from}`;
  out.push(`${bg(sev)}${fg(PALETTE.bg)}${BOLD} ${word} ${RESET} ${BOLD}${markup(d.title, BOLD)}${RESET}`);
  out.push(`${' '.repeat(word.length + 3)}${paint(PALETTE.dim, d.code + (loc ? ` · ${loc}` : ''))}`);
  const width = Math.max(2, ...(d.snippets ?? []).flatMap(sn => sn.lines.map(l => String(l.n).length)));
  const gutter = (n = '') => `${paint(PALETTE.dim, String(n).padStart(width))} ${paint(PALETTE.rail, '│')} `;
  for (const sn of d.snippets ?? []) {
    out.push('');
    if (sn.file) out.push(`${' '.repeat(width)} ${paint(PALETTE.rail, '╭─')} ${paint(PALETTE.dim, sn.file)}`);
    let last = null;
    for (const ln of sn.lines) {
      if (last !== null && ln.n > last + 1) out.push(`${' '.repeat(width)} ${paint(PALETTE.rail, '┆')}`);
      last = ln.n;
      const marks = ln.marks ?? [];
      out.push(gutter(ln.n) + marked(ln.text, marks, sev));
      const sorted = [...marks].sort((a, b) => a.from - b.from);
      for (let i = sorted.length - 1; i >= 0; i--) {
        let line = '', col = 1;
        for (let j = 0; j < i; j++) {
          line += ' '.repeat(Math.max(0, sorted[j].from - col)) + paint(ROLE[sorted[j].role] ?? sev, '│');
          col = sorted[j].from + 1;
        }
        line += ' '.repeat(Math.max(0, sorted[i].from - col)) + paint(ROLE[sorted[i].role] ?? sev, '╰─') + ' ' + markup(sorted[i].label);
        out.push(gutter() + line);
      }
    }
  }
  if (d.frames?.length) {
    out.push('');
    for (const f of d.frames) out.push(`  ${paint(PALETTE.dim, 'at')} ${BOLD}${f.fn}${RESET}  ${paint(PALETTE.dim, f.at)}`);
  }
  if (d.notes?.length) {
    out.push('');
    for (const n of d.notes) out.push(`  ${paint(PALETTE.dim, 'note')}  ${markup(n)}`);
  }
  if (d.fix) {
    out.push('');
    out.push(`  ${fg(PALETTE.add)}${BOLD}fix${RESET}   ${markup(d.fix.label)}`);
    if (d.fix.command) out.push(`        ${paint(PALETTE.add, `$ ${d.fix.command}`)}`);
    // Without color an edit cannot be shown inline, so the corrected line stands alone.
    else if (!color) out.push(gutter(d.fix.line) + d.fix.after);
    else out.push(gutter(d.fix.line) + diff(d.fix.before, d.fix.after).map(r =>
      r.k === '=' ? syntax(r.t) : r.k === '+' ? `${bg(mix(PALETTE.add, 0.25))}${fg(PALETTE.add)}${r.t}${RESET}` : `${fg(PALETTE.del)}${STRIKE}${r.t}${RESET}`).join(''));
  }
  return out.join('\n');
}

if (!fs.existsSync(DATA)) {
  console.error(`no ${path.relative(ROOT, DATA)}`);
  process.exit(1);
}
// What utu prints today: messages.txt (test-error-messages.mjs records it); a
// CLI case, which is no program, carries its own.
const today = new Map();
for (const block of fs.readFileSync(path.join(ROOT, 'examples', 'error_demo', 'messages.txt'), 'utf8').split(/^(?==== )/m)) {
  const file = block.split('\n')[0].split(' ').find(word => word.startsWith('examples/error_demo/'));
  if (file) today.set(file.slice('examples/error_demo/'.length), block.split('\n').slice(1).join('\n').trim());
}
const entries = JSON.parse(fs.readFileSync(DATA, 'utf8'))
  .filter(e => !filters.length || filters.some(f => [e.file, e.ideal.code, plain(e.ideal.title)].some(t => t.includes(f))));
if (!entries.length) {
  console.error(`no diagnostic matches ${filters.join(', ')}`);
  process.exit(1);
}
if (flag('--list')) {
  for (const e of entries) console.log(`${e.file.padEnd(48)} ${paint(PALETTE.dim, e.ideal.code.padEnd(24))} ${plain(e.ideal.title)}`);
  process.exit(0);
}
const rule = paint(PALETTE.rail, '─'.repeat(Math.min(process.stdout.columns ?? 100, 100)));
for (const e of entries) {
  console.log(`${rule}\n${paint(PALETTE.dim, `${e.file}  ·  ${e.what}`)}\n`);
  if (flag('--today')) console.log(`${paint(PALETTE.dim, 'today:')}\n${paint(PALETTE.dim, (e.current ?? today.get(e.file) ?? '').split('\n').map(l => `  ${l}`).join('\n'))}\n\n${paint(PALETTE.dim, 'redesigned:')}`);
  console.log(render(e));
  console.log();
}
