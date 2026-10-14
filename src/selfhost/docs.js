// src/selfhost/docs.js — doc comments, written in Typst.
//
//   //! What this file is: Typst markup, at the top of the file.
//
//   /// Adds `n` to the point's *x*. See @Point.
//   fn add(p: Point, n: I32) I32 { … }
//
// A declaration's doc comment is the `///` lines just before it (nothing
// between them and it but space); a file's is its leading `//!` lines.
// The text after the marker is Typst markup (`*strong*`, `_emphasis_`,
// `` `code` ``, `- lists`, `$math$`, `#link(…)[…]`), which tools/utudoc
// typesets as it is and the editor shows as Markdown (typstToMarkdown).
// They are read from the compiler's tokens (comments are tokens), so a
// `///` inside a string is never one.

const COMMENT = 8;  // lex.utu's Tok.Comment

/**
 * Doc comments over the program the compiler holds (`files` as the build
 * returned them): declaration(decl) and file(key), each the Typst text or ''.
 */
export function docComments(utu, files) {
  const tokKind = new Uint8Array(utu.tok_kind.buffer);
  const tokStart = new Int32Array(utu.tok_start.buffer);
  const tokEnd = new Int32Array(utu.tok_end.buffer);
  const declNode = new Int32Array(utu.decl_node.buffer);
  const nodeFirst = new Int32Array(utu.node_first.buffer);
  const src = new Uint8Array(utu.src.buffer);
  const decoder = new TextDecoder();
  const text = t => decoder.decode(src.subarray(tokStart[t], tokEnd[t]));
  const fileOfToken = t => files.findIndex((_, i) => utu.file_first_token(i) <= t && t < utu.file_end_token(i));
  // Only space (one line break at most) between two places in src.
  const adjacent = (from, to) => {
    const between = decoder.decode(src.subarray(from, to));
    return /^\s*$/.test(between) && between.split('\n').length <= 2;
  };
  const lines = (tokens, marker) => tokens.map(t => text(t).slice(marker.length).replace(/^ /, '')).join('\n');

  return {
    /** The `///` comment of a declaration. */
    declaration(decl) {
      const node = declNode[decl];
      if (node < 0) return '';
      let t = nodeFirst[node];
      const file = fileOfToken(t);
      if (file < 0) return '';
      const first = utu.file_first_token(file);
      // A field or variant is written after its `|`.
      if (t > first && text(t - 1) === '|') t -= 1;
      const found = [];
      let after = tokStart[t];
      for (t -= 1; t >= first && tokKind[t] === COMMENT; t--) {
        const comment = text(t);
        if (!comment.startsWith('///') || comment.startsWith('////') || !adjacent(tokEnd[t], after)) break;
        found.unshift(t);
        after = tokStart[t];
      }
      return lines(found, '///');
    },
    /** A file's leading `//!` comment. */
    file(key) {
      const file = files.findIndex(f => f.key === key);
      if (file < 0) return '';
      const found = [];
      for (let t = utu.file_first_token(file), end = utu.file_end_token(file); t < end && tokKind[t] === COMMENT; t++) {
        if (text(t).startsWith('//!')) found.push(t);
        else if (found.length) break;
      }
      return lines(found, '//!');
    },
  };
}

/**
 * Typst markup, as Markdown shows most of it: strong, emphasis, headings,
 * lists, links, and math (as code). Code spans and blocks are left as they are.
 */
export function typstToMarkdown(typst) {
  const out = [];
  let fenced = false;
  for (const line of typst.split('\n')) {
    if (line.trimStart().startsWith('```')) { fenced = !fenced; out.push(line); continue; }
    if (fenced) { out.push(line); continue; }
    const pieces = line.split(/(`[^`]*`)/);
    const converted = pieces.map((piece, i) => (i % 2 ? piece : piece
      // An escaped character (`\*`) is itself: kept aside from the rest.
      .replace(/\\(.)/g, (_, c) => `\uE000${c.codePointAt(0)}\uE001`)
      .replace(/</g, '&lt;')
      .replace(/^(=+) /, (_, level) => `${'#'.repeat(level.length)} `)
      .replace(/^(\s*)\+ /, '$11. ')
      .replace(/#link\("([^"]*)"\)\[([^\]]*)\]/g, '[$2]($1)')
      .replace(/#link\("([^"]*)"\)/g, '<$1>')
      .replace(/\$([^$]+)\$/g, '`$1`')
      .replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, '$1**$2**')
      .replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, '$1*$2*')
      // `@Name` is a reference; an address's `@` is not.
      .replace(/(^|[^\w@])@([A-Za-z_]\w*)/g, '$1`$2`')
      .replace(/\uE000(\d+)\uE001/g, (_, c) => `\\${String.fromCodePoint(Number(c))}`))).join('');
    out.push(converted);
  }
  return out.join('\n');
}
