// The self-hosted parser's named syntax tree, in tree-sitter-style S-expressions.
// The compiler keeps one program at a time; this reads its current node tables.

/** A file's syntax as an S-expression. `key` is a key in `files` from loadProgram. */
export function syntaxTree(utu, files, key) {
  const file = files.findIndex(entry => entry.key === key);
  if (file < 0) throw new Error(`no loaded file ${key}`);
  const firstToken = utu.file_first_token(file);
  const endToken = utu.file_end_token(file);
  const kinds = new Uint8Array(utu.node_kind.buffer);
  const first = new Int32Array(utu.node_first.buffer);
  const last = new Int32Array(utu.node_last.buffer);
  const child = new Int32Array(utu.node_child.buffer);
  const next = new Int32Array(utu.node_next.buffer);
  let root = -1;
  for (let n = 0, count = utu.node_count(); n < count; n++) {
    if (kinds[n] === 0 && first[n] >= firstToken && last[n] <= endToken) {
      root = n;
      break;
    }
  }
  if (root < 0) throw new Error(`no syntax tree for ${key}`);
  const named = new Map();
  const kind = n => {
    const k = kinds[n];
    if (!named.has(k)) named.set(k, utu.node_kind_name(k));
    return named.get(k);
  };
  const render = n => {
    const children = [];
    for (let c = child[n]; c >= 0; c = next[c]) children.push(render(c));
    return `(${kind(n)}${children.length ? ` ${children.join(' ')}` : ''})`;
  };
  return render(root);
}

/** Parse one source and return its syntax tree. This replaces the compiler's loaded program. */
export function parseSyntaxTree(utu, source) {
  const bytes = new TextEncoder().encode(source);
  const at = utu.source(bytes.length);
  new Uint8Array(utu.src.buffer).set(bytes, at);
  utu.tokens(bytes.length);
  const root = utu.nodes(bytes.length);
  if (root < 0) return null;
  return syntaxTree(utu, [{ key: '<source>' }], '<source>');
}
