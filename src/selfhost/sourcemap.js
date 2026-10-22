// src/selfhost/sourcemap.js — a module's source map: where its instructions
// came from.
//
// The compiler, asked for one (`sourceMap: true`), notes for each run of
// instructions made for one piece of syntax its byte offset in the module
// (selfhost/wasm.utu, "Source maps"); compile() reads that table as `map`
// (readSourceMap in compiler.js). From it: a trap's place (`locate`, `frames`),
// and the standard JSON source map that browsers' devtools read for Wasm
// (`sourceMapJson`), named by a `sourceMappingURL` section (`withMapUrl`).

/** The entry for byte `offset` of the module: the last at or before it, or null. */
export function locate(map, offset) {
  const entries = map?.entries ?? [];
  let lo = 0, hi = entries.length - 1, found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].at <= offset) { found = entries[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/**
 * The Wasm frames of an error's stack, innermost first: each one's function
 * (its index, and its name when the module has a name section), its byte
 * offset in the module, and, with a map, its place. Code inlined from
 * another function is that one's frame, `inlined` naming the function it
 * is in, then that function's, at the call. V8 (Node) writes `wasm-function[N]:0xOFFSET`; JavaScriptCore (Bun)
 * writes no offsets, so there are none.
 */
export function wasmFrames(error, map = null) {
  const frames = [];
  for (const line of String(error?.stack ?? '').split('\n')) {
    const at = line.match(/^\s*at (?:async )?(?:(\S+) \()?wasm:\/\/wasm\/[^:]*:wasm-function\[(\d+)\]:0x([0-9a-f]+)/);
    if (!at) continue;
    const offset = parseInt(at[3], 16);
    const index = +at[2];
    const entry = map ? locate(map, offset) : null;
    const fn = at[1] && !/^wasm-function/.test(at[1]) ? at[1].replace(/^[$]/, '') : null;
    // Code inlined from another function: that one's frame, then this one's at the call.
    const inlined = entry?.site || entry?.owner != null && map.functions[index] != null && entry.ownerAt !== map.functions[index];
    if (!inlined) {
      frames.push({ fn: fn ?? entry?.owner ?? null, index, offset, entry, inlined: null });
      continue;
    }
    frames.push({ fn: entry.owner, index, offset, entry, inlined: fn ?? `function ${index}` });
    if (entry.site) frames.push({ fn, index, offset, entry: entry.site, inlined: null });
  }
  return frames;
}

/**
 * The JSON source map (version 3) of a module: one generated line whose
 * columns are byte offsets in the module, as devtools read a Wasm map.
 * `relative` names a file key as the map's `sources` give it; the files'
 * texts go in `sourcesContent` (the standard library's are not on disk).
 */
export function sourceMapJson(map, { file = null, relative = key => key, texts = new Map() } = {}) {
  const sources = [];
  const index = new Map();
  let mappings = '';
  let last = { at: 0, source: 0, line: 0, column: 0 };
  for (const entry of map.entries) {
    if (entry.file == null) continue;
    if (!index.has(entry.file)) { index.set(entry.file, sources.length); sources.push(entry.file); }
    const source = index.get(entry.file);
    if (mappings) mappings += ',';
    mappings += vlq(entry.at - last.at) + vlq(source - last.source) + vlq(entry.line - 1 - last.line) + vlq(entry.column - 1 - last.column);
    last = { at: entry.at, source, line: entry.line - 1, column: entry.column - 1 };
  }
  return JSON.stringify({
    version: 3, ...(file ? { file } : {}), sources: sources.map(relative),
    sourcesContent: sources.map(key => texts.get(key) ?? null), names: [], mappings,
  });
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(value) {
  let v = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = '';
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v) digit |= 32;
    out += BASE64[digit];
  } while (v);
  return out;
}

/** The module with a `sourceMappingURL` custom section naming its map. */
export function withMapUrl(wasm, url) {
  const text = s => { const b = new TextEncoder().encode(s); return [...leb(b.length), ...b]; };
  const body = [...text('sourceMappingURL'), ...text(url)];
  const section = [0, ...leb(body.length), ...body];
  const out = new Uint8Array(wasm.length + section.length);
  out.set(wasm);
  out.set(section, wasm.length);
  return out;
}

function leb(n) {
  const out = [];
  do {
    let b = n & 127;
    n >>>= 7;
    if (n) b |= 128;
    out.push(b);
  } while (n);
  return out;
}
