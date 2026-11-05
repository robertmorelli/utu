// Full WebAssembly text, including GC, EH and SIMD, from Bytecode Alliance's
// wasm-tools printer. Loaded only when a user asks to inspect a build.

/** Print a compiled module as WAT. Optional source-map comments show each function's source. */
export async function printWat(wasm, { map = null, files = [], source = false } = {}) {
  const { print } = await import('@bytecodealliance/jco-transpile/wasm-tools');
  const text = await print(wasm);
  if (!source || !map?.functions?.length || !files.length) return text;
  const byKey = new Map(files.map(file => [file.key, file]));
  const fileLines = new Map(files.map(file => [file.key, file.text.split(/\r?\n/)]));
  const entriesByOwner = new Map();
  for (const entry of map.entries ?? []) {
    if (entry.ownerAt == null || !entry.file || !entry.line) continue;
    if (!entriesByOwner.has(entry.ownerAt)) entriesByOwner.set(entry.ownerAt, []);
    entriesByOwner.get(entry.ownerAt).push(entry);
  }
  const placed = new Map();
  const at = byte => {
    for (let i = files.length - 1; i >= 0; i--) {
      const file = files[i];
      if (byte < file.offset || byte >= file.offset + file.bytes.length) continue;
      const before = new TextDecoder().decode(file.bytes.subarray(0, byte - file.offset));
      return { file, line: before.split('\n').length };
    }
    return null;
  };
  for (let i = 0; i < map.functions.length; i++) {
    const byte = map.functions[i];
    if (byte == null) continue;
    const place = at(byte);
    if (!place) continue;
    const entries = entriesByOwner.get(byte) ?? [];
    const lines = new Map([[`${place.file.key}:${place.line}`, place.line]]);
    for (const entry of entries) lines.set(`${entry.file}:${entry.line}`, entry.line);
    const comments = [];
    for (const label of [...lines.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).slice(0, 80)) {
      const split = label.lastIndexOf(':');
      const file = byKey.get(label.slice(0, split));
      const line = Number(label.slice(split + 1));
      if (!file) continue;
      const sourceLine = fileLines.get(file.key)?.[line - 1]?.trim() ?? '';
      comments.push(`  ;; ${label.replace(/[\r\n]/g, ' ')} ${sourceLine.replace(/[\r\n]/g, ' ')}`);
    }
    placed.set(i, comments.join('\n'));
  }
  // The printer gives every function its numeric index, including imported
  // functions. Keep its WAT untouched except for full-line comments before
  // defined functions. The comments do not affect parse or round-tripping.
  return text.replace(/^(\s*)\(func (?:\$[^\s]+ )?\(;([0-9]+);\)/gm, (match, indent, number) => {
    const comment = placed.get(Number(number));
    return comment ? `${comment}\n${match}` : match;
  });
}
