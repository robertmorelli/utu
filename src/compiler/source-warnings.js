import { DIAGNOSTIC_KINDS } from './diagnostics.js';

// A branch of an if/else expression holding one expression: `{ value; }`.
const IF_VALUE_BRANCH = /(?<=\b(?:if\b[^{};]*|else\s*))\{[^{};]*;?\s*\}/g;

// Author-facing source checks. Never inspect generated Wutu/iterator expansions.
export function compressedSourceWarnings(source, file) {
  const warnings = [];
  let offset = 0;
  let inBlockComment = false;
  // Open template strings: 'text' inside one's text, or the brace depth
  // inside one's `${…}`. A template, interpolations and all, is not code.
  const templates = [];
  for (const [index, line] of source.split('\n').entries()) {
    // Only a long line can warn: a short one is scanned for the state it leaves.
    const long = line.length > 160;
    let code = '';
    let quoted = false;
    if (!line.trimStart().startsWith('\\\\')) {
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        const next = line[i + 1];
        const top = templates.length - 1;
        if (inBlockComment) {
          if (c === '*' && next === '/') { inBlockComment = false; i++; }
        } else if (quoted) {
          if (c === '\\') i++;
          else if (c === '"') quoted = false;
        } else if (templates[top] === 'text') {
          if (c === '\\') i++;
          else if (c === '`') templates.pop();
          else if (c === '$' && next === '{') { templates.push(0); i++; }
        } else if (c === '/' && next === '/') {
          break;
        } else if (c === '/' && next === '*') {
          inBlockComment = true; i++;
        } else if (c === '"') {
          quoted = true;
        } else if (c === '`') {
          templates.push('text');
        } else if (top >= 0) {
          if (c === '{') templates[top]++;
          else if (c === '}' && templates[top]-- === 0) templates.pop();
        } else if (long) {
          code += c;
        }
      }
    }
    // An if/else used as a value (`if c { a; } else { b; }`) is one expression,
    // so its single-expression branches do not count as packed statements.
    const boundaries = () => (code.replace(IF_VALUE_BRANCH, ' ').match(/[{};]/g) ?? []).length;
    if (long && code.trim().length > 100 && boundaries() >= 5) {
      const col = line.search(/\S/) + 1;
      warnings.push({
        kind: DIAGNOSTIC_KINDS.COMPRESSED_SOURCE, severity: 'warning',
        message: 'This line packs multiple statements or blocks together. Put statements and block contents on separate, indented lines; keep source readable and minify build output instead.',
        primary: { file, row: index + 1, col, endRow: index + 1, endCol: line.length + 1,
          start: offset + col - 1, end: offset + line.length },
        related: [], notes: [], fixes: [],
      });
    }
    offset += line.length + 1;
  }
  return warnings;
}

// Comments and string contents blanked to spaces, so offsets are preserved.
// Utu line comments are `//` and `\\`; strings never span lines.
function codeOnly(source) {
  return source.replace(/"[^"\n]*"|\/\/[^\n]*|\\\\[^\n]*/g, (token) =>
    token[0] === '"' ? `"${' '.repeat(token.length - 2)}"` : ' '.repeat(token.length));
}

function rowCol(source, offset) {
  const lines = source.slice(0, offset).split('\n');
  return { row: lines.length, col: lines.at(-1).length + 1 };
}

// Island names are plain strings, so a typo in `wutu.invalidate("name")`
// would silently refresh nothing. Every island in the program is visible to
// analysis, which makes an unmatched literal name a reliable mistake.
export function unknownIslandWarnings(sources) {
  const islands = new Set();
  const calls = [];
  for (const [file, source] of sources) {
    // Neither an island nor a call: nothing to blank or match.
    if (!source.includes('@island') && !source.includes('invalidate')) continue;
    const code = codeOnly(source);
    for (const match of code.matchAll(/@island\s+"/g)) {
      const start = match.index + match[0].length;
      islands.add(source.slice(start, source.indexOf('"', start)));
    }
    if (/^(std|node|npm):/.test(file)) continue;
    for (const match of code.matchAll(/\bwutu\s*\.\s*invalidate\s*\(\s*"/g)) {
      const start = match.index + match[0].length - 1;
      const end = source.indexOf('"', start + 1) + 1;
      calls.push({ file, source, start, end, name: source.slice(start + 1, end - 1) });
    }
  }
  return calls.filter(call => !islands.has(call.name)).map(({ file, source, start, end, name }) => {
    const from = rowCol(source, start), to = rowCol(source, end);
    const known = [...islands].sort();
    return {
      kind: DIAGNOSTIC_KINDS.UNKNOWN_ISLAND, severity: 'warning',
      message: `No @island named "${name}" exists, so this invalidate refreshes nothing.${known.length ? ` Known islands: ${known.map(n => `"${n}"`).join(', ')}.` : ''}`,
      primary: { file, row: from.row, col: from.col, endRow: to.row, endCol: to.col, start, end },
      related: [], notes: [], fixes: [],
    };
  });
}
