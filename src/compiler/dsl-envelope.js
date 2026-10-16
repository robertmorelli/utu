// DSL envelopes: `@name/\ payload \/`, where payloads may nest balanced
// envelopes. Mirrors the external scanner; used by DSL expanders, formatters,
// and editor projections that must find payloads without parsing Utu.

/** Offset of the `\/` closing an envelope whose payload starts at `start`. */
export function dslEnd(source, start) {
  let depth = 1;
  for (let i = start; i < source.length - 1; i++) {
    if (source[i] === '/' && source[i + 1] === '\\') {
      depth++;
      i++;
    } else if (source[i] === '\\' && source[i + 1] === '/') {
      if (--depth === 0) return i;
      i++;
    }
  }
  throw new Error('Unterminated DSL envelope');
}

const OPENER = /@(\w+)\s*\/\\/y;

/** The DSL opener (`@name/\`) at `offset`, or null. */
export function dslOpenerAt(source, offset) {
  OPENER.lastIndex = offset;
  return OPENER.exec(source);
}

/** If a DSL literal starts at `start`, the offset just past it; otherwise `start`. */
export function skipDsl(source, start) {
  const opener = dslOpenerAt(source, start);
  return opener ? dslEnd(source, start + opener[0].length) + 2 : start;
}

/**
 * Every top-level DSL literal in Utu source as { name, start, end } payload
 * ranges, skipping line comments (`//`, `\\`) and strings. An unterminated
 * literal runs to the end of the source. Nested literals belong to their
 * enclosing payload and are not listed.
 */
export function dslLiterals(source) {
  const literals = [];
  for (let i = 0; i < source.length;) {
    if (source.startsWith('//', i) || source.startsWith('\\\\', i)) {
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source[i] === '"') {
      // A Utu string ends at its closing quote or the line; `\"` is in it.
      i++;
      while (i < source.length && source[i] !== '"' && source[i] !== '\n') i += source[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    const opener = dslOpenerAt(source, i);
    if (!opener) { i++; continue; }
    const start = i + opener[0].length;
    let close = -1;
    try { close = dslEnd(source, start); } catch { /* unterminated */ }
    const end = close < 0 ? source.length : close;
    literals.push({ name: opener[1], start, end });
    i = close < 0 ? end : end + 2;
  }
  return literals;
}
