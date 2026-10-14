// src/selfhost/highlight.js — utu source, colored as the compiler reads it.
//
// The classes come from the program the compiler holds: each token's kind
// (from its lexer: strings, numbers, comments, DSL bodies; a word that is a
// keyword), and for a name, what it resolves to (a function, a type, a
// parameter, a field). So `count` the function and `count` the local are
// colored as what they are, in whatever position.

import { programIndex } from './query.js';

// lex.utu's Tok, as far as coloring tells them apart.
const TOK = { Word: 2, Int: 3, Float: 4, String: 5, MultilineLine: 6, DslBody: 7, Comment: 8, TemplateFull: 9, TemplateHead: 10, TemplateMiddle: 11, TemplateTail: 12 };

// resolve.utu's Decl kinds, as classes.
const DECL_CLASS = {
  Module: 'type', Foreign: 'type', ModuleParam: 'type', Struct: 'type', Enum: 'type', IntEnum: 'type', Proto: 'type',
  TypeDecl: 'type', Distinct: 'type', Alias: 'type', Variant: 'constant', Field: 'field', ProtoMember: 'function',
  Fn: 'function', Main: 'function', Global: 'variable', Mem: 'variable', Param: 'parameter', SelfParam: 'parameter',
  ClosureParam: 'parameter', Local: 'variable', Capture: 'variable', ArmBinding: 'variable', Promoted: 'variable', Caught: 'variable',
};

/** ANSI colors for each class (a terminal's own palette). */
export const ANSI = {
  keyword: '35', string: '32', number: '33', comment: '2', type: '36', function: '34', constant: '33', field: '0', parameter: '3', variable: '0', dsl: '32',
};

/**
 * A function from (file key, start, end) — UTF-16 offsets in that file's
 * text — to the colored pieces of that range: [{ start, end, class }], in
 * order, covering only what has a class. `files` is what the build returned.
 */
export function highlighter(utu, files) {
  const keywords = utu.keyword_count();
  const tokKind = new Uint8Array(utu.tok_kind.buffer);
  const tokStart = new Int32Array(utu.tok_start.buffer);
  const tokEnd = new Int32Array(utu.tok_end.buffer);
  const tokWord = new Int32Array(utu.tok_word.buffer);
  const index = programIndex(utu, files);
  const cache = new Map();

  // Each file's pieces, in its UTF-16 offsets: tokens by kind, then names by what they mean.
  const piecesOf = key => {
    if (cache.has(key)) return cache.get(key);
    const file = files.find(f => f.key === key);
    if (!file) return [];
    const units = unitTable(file.bytes);
    const at = byte => units[byte - file.offset];
    const pieces = new Map();
    const id = files.indexOf(file);
    for (let t = utu.file_first_token(id), end = utu.file_end_token(id); t < end; t++) {
      if (tokEnd[t] <= tokStart[t]) continue;
      const kind = tokKind[t];
      const cls = kind === TOK.Comment ? 'comment'
        : kind === TOK.Int || kind === TOK.Float ? 'number'
        : kind === TOK.String || kind === TOK.MultilineLine || (kind >= TOK.TemplateFull && kind <= TOK.TemplateTail) ? 'string'
        : kind === TOK.DslBody ? 'dsl'
        : kind === TOK.Word && tokWord[t] >= 0 && tokWord[t] < keywords ? 'keyword'
        : kind === TOK.Word && /^[A-Z]/.test(file.text.slice(at(tokStart[t]), at(tokStart[t]) + 1)) ? 'type'
        : null;
      if (cls) pieces.set(at(tokStart[t]), { start: at(tokStart[t]), end: at(tokEnd[t]), class: cls });
    }
    for (const { decl, at: place } of index.names(key)) {
      const cls = DECL_CLASS[index.kind(decl)];
      if (cls && cls !== 'variable') pieces.set(place.start, { start: place.start, end: place.end, class: cls });
      else if (cls) pieces.delete(place.start);
    }
    const sorted = [...pieces.values()].sort((a, b) => a.start - b.start);
    cache.set(key, sorted);
    return sorted;
  };

  return (key, start, end) => piecesOf(key).filter(piece => piece.end > start && piece.start < end);
}

/** By byte of `bytes`: its UTF-16 offset (and one past the end). */
function unitTable(bytes) {
  const table = new Int32Array(bytes.length + 1);
  let u = 0;
  for (let b = 0; b < bytes.length;) {
    const c = bytes[b];
    const n = c < 0x80 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4;
    for (let k = 0; k < n; k++) table[b + k] = u;
    b += n;
    u += n === 4 ? 2 : 1;
  }
  table[bytes.length] = u;
  return table;
}

/** `text` (from `offset` in its file) with ANSI colors on the pieces in it. */
export function paintLine(text, offset, pieces) {
  let out = '';
  let at = 0;
  for (const piece of pieces) {
    const from = Math.max(0, piece.start - offset);
    const to = Math.min(text.length, piece.end - offset);
    if (to <= at) continue;
    out += text.slice(at, Math.max(at, from));
    const code = ANSI[piece.class];
    out += code === '0' ? text.slice(Math.max(at, from), to) : `\x1b[${code}m${text.slice(Math.max(at, from), to)}\x1b[0m`;
    at = to;
  }
  return out + text.slice(at);
}
