// src/selfhost/blame.js — a size profile: every byte of a module, and of its
// JS glue, blamed on the source it came from. It answers "why is my binary
// this big".
//
// The compiler, asked (`blame: true`), keeps a source map and says what each
// entity of the module was made for (readBlameTables in compiler.js,
// selfhost/blame.utu); asking changes nothing it builds. Here the module is
// read section by section and each byte range is blamed:
//
//   code       by the source map: each run of instructions on its syntax;
//              locals and the body's size on the function's; code inlined
//              from another function on the callee's line, and its call
//              (`site`) as well; a helper the compiler made and shares
//              (array.slice, Tag.from_i32, closure.*, mem.push, ...) split
//              among the calls to it
//   types      on their struct, enum, or closure (else where first needed)
//   imports    on their @es declaration, or where first needed (a string
//              constant on its literal)
//   globals    on their `let` or mem; data on its mem; exports on what they export
//   the rest   (headers, counts, custom sections) in buckets of their own
//
// so blamed bytes and those buckets add up to the file's size, byte for
// byte: `records` tile the module. `report` sums them by file, declaration,
// line, function, helper and inlined callee; `formatTop` prints the top of
// each, `blameHtml` draws a treemap (file → declaration → line) with the
// source and its bytes per line. A bucket's brotli share is an estimate
// (`estimateCompressed`).

import { FUN_CHECK, glueModuleSource, glueName, splitBody } from '../runtime/host-imports.js';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export const SECTIONS = ['custom', 'type', 'import', 'function', 'table', 'memory', 'global', 'export', 'start', 'element', 'code', 'data', 'datacount', 'tag'];

/** Little-endian base-128 reading over a module's bytes. */
class Reader {
  constructor(bytes, at = 0) { this.b = bytes; this.at = at; }
  byte() {
    if (this.at >= this.b.length) throw new Error(`read past the end at ${this.at}`);
    return this.b[this.at++];
  }
  u32() {
    let result = 0, scale = 1, b;
    do { b = this.byte(); result += (b & 127) * scale; scale *= 128; } while (b & 128);
    return result;
  }
  leb() { while (this.byte() & 128); }
  name() {
    const n = this.u32();
    const text = decoder.decode(this.b.subarray(this.at, this.at + n));
    this.at += n;
    return text;
  }
  valtype() { const b = this.byte(); if (b === 0x63 || b === 0x64) this.leb(); }
  blocktype() {
    const b = this.b[this.at];
    if (b === 0x40 || (b & 0xc0) === 0x40) { this.at++; return; }
    if (b === 0x63 || b === 0x64) { this.at++; this.leb(); return; }
    this.leb();
  }
  memarg() { if (this.u32() & 64) this.u32(); this.leb(); }
  limits() { const flags = this.u32(); this.leb(); if (flags & 1) this.leb(); }
  subtype() {
    let b = this.byte();
    if (b === 0x50 || b === 0x4f) {
      for (let n = this.u32(); n > 0; n--) this.u32();
      b = this.byte();
    }
    if (b === 0x60) {
      for (let n = this.u32(); n > 0; n--) this.valtype();
      for (let n = this.u32(); n > 0; n--) this.valtype();
    } else if (b === 0x5f) {
      for (let n = this.u32(); n > 0; n--) { this.valtype(); this.byte(); }
    } else if (b === 0x5e) {
      this.valtype();
      this.byte();
    } else throw new Error(`unknown composite type 0x${b.toString(16)}`);
  }
  /** A constant expression, through its `end`. */
  expr() { while (this.instr(null) !== 0x0b); }

  /**
   * One instruction, its immediates read; returns its opcode. `call(op,
   * index)` hears each call, return_call and ref.func (op 0x10, 0x12, 0xd2).
   */
  instr(call) {
    const op = this.byte();
    if (op <= 0x01 || op === 0x05 || op === 0x0b || op === 0x0f || op === 0x19 || op === 0x0a || op === 0x1a || op === 0x1b
      || (op >= 0x45 && op <= 0xc4) || op === 0xd1 || op === 0xd3 || op === 0xd4) return op;
    switch (op) {
      case 0x02: case 0x03: case 0x04: case 0x06: this.blocktype(); return op;
      case 0x07: case 0x08: case 0x09: case 0x0c: case 0x0d: case 0x18: case 0x14: case 0x15:
      case 0x20: case 0x21: case 0x22: case 0x23: case 0x24: case 0x25: case 0x26:
      case 0x3f: case 0x40: case 0xd5: case 0xd6: this.u32(); return op;
      case 0x10: case 0x12: case 0xd2: { const at = this.at - 1; const f = this.u32(); call?.(op, f, at); return op; }
      case 0x11: case 0x13: this.u32(); this.u32(); return op;
      case 0x0e: for (let n = this.u32(); n >= 0; n--) this.u32(); return op;
      case 0x1c: for (let n = this.u32(); n > 0; n--) this.valtype(); return op;
      case 0x1f: {
        this.blocktype();
        for (let n = this.u32(); n > 0; n--) { const kind = this.byte(); if (kind < 2) this.u32(); this.u32(); }
        return op;
      }
      case 0x41: case 0x42: this.leb(); return op;
      case 0x43: this.at += 4; return op;
      case 0x44: this.at += 8; return op;
      case 0xd0: this.leb(); return op;
      case 0xfb: return this.gc();
      case 0xfc: return this.misc();
      case 0xfd: return this.simd();
    }
    if (op >= 0x28 && op <= 0x3e) { this.memarg(); return op; }
    throw new Error(`unknown opcode 0x${op.toString(16)} at ${this.at - 1}`);
  }
  gc() {
    const sub = this.u32();
    if (sub <= 1 || (sub >= 6 && sub <= 7) || (sub >= 11 && sub <= 14) || sub === 16) this.u32();
    else if ((sub >= 2 && sub <= 5) || (sub >= 8 && sub <= 10) || (sub >= 17 && sub <= 19)) { this.u32(); this.u32(); }
    else if (sub >= 20 && sub <= 23) this.leb();
    else if (sub === 24 || sub === 25) { this.byte(); this.u32(); this.leb(); this.leb(); }
    else if (sub !== 15 && !(sub >= 26 && sub <= 30)) throw new Error(`unknown opcode 0xfb ${sub}`);
    return 0xfb;
  }
  misc() {
    const sub = this.u32();
    if (sub <= 7) return 0xfc;
    if (sub === 8 || sub === 10 || sub === 12 || sub === 14) { this.u32(); this.u32(); }
    else if (sub <= 17) this.u32();
    else throw new Error(`unknown opcode 0xfc ${sub}`);
    return 0xfc;
  }
  simd() {
    const sub = this.u32();
    if (sub <= 11 || sub === 92 || sub === 93) this.memarg();
    else if (sub === 12 || sub === 13) this.at += 16;
    else if (sub >= 21 && sub <= 34) this.byte();
    else if (sub >= 84 && sub <= 91) { this.memarg(); this.byte(); }
    return 0xfd;
  }
}

/** The module's sections: id, name, where its header and contents start, and where it ends. */
export function sections(wasm) {
  const r = new Reader(wasm, 8);
  const out = [];
  while (r.at < wasm.length) {
    const start = r.at;
    const id = r.byte();
    const size = r.u32();
    const body = r.at;
    let name = SECTIONS[id] ?? `section ${id}`;
    if (id === 0) name = `custom: ${new Reader(wasm, body).name()}`;
    out.push({ id, name, start, body, end: body + size });
    r.at = body + size;
  }
  return out;
}

/** The entry at or before `at` (entries sorted by offset), or -1. */
function entryAt(entries, at) {
  let lo = 0, hi = entries.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].at <= at) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/** `total` in integers, as near the weights' shares as can be (largest remainders). */
function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map(w => total * w / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - parts[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k++, left--) parts[order[k % order.length][1]]++;
  return parts;
}

/**
 * Blame each byte of `wasm` with the compiler's `tables` (readBlameTables).
 * Returns the records, which tile the module: each a byte range (`at`,
 * `bytes`), its `section`, what it is (`what`), its `place` (an index in
 * tables.places, or -1: a bucket of its own), the call it was inlined at
 * (`site`, a place, or -1), the function it is in (`fn`, its index, or -1)
 * and, for a shared helper's share, the helper (`helper`). Also each
 * helper's calls, and the places of the @es imports by field name.
 */
export function blameModule(wasm, tables) {
  const { entries, funcs, types, globals, memories, data } = tables;
  const records = [];
  const notes = [];
  const add = (at, bytes, section, what, place = -1, more = null) => {
    if (bytes > 0) records.push({ at, bytes, section, what, place, site: -1, fn: -1, helper: -1, ...more });
  };
  add(0, 8, 'header', 'header');
  const all = sections(wasm);
  const fnPlace = i => funcs[i]?.place ?? -1;
  let imported = { func: 0, global: 0, memory: 0 };
  const esPlaces = new Map();
  const imports = [];
  // Calls to each helper: where they are (offsets in the module).
  const calls = new Map();
  const code = all.find(s => s.id === 10);
  if (code) {
    const r = new Reader(wasm, code.body);
    const count = r.u32();
    const firstDefined = funcs.length - count;
    for (let k = 0; k < count; k++) {
      const size = r.u32();
      const end = r.at + size;
      try {
        for (let n = r.u32(); n > 0; n--) { r.u32(); r.valtype(); }
        while (r.at < end) r.instr((op, f, at) => {
          if (funcs[f]?.role === 'helper' && f !== firstDefined + k) {
            if (!calls.has(f)) calls.set(f, []);
            calls.get(f).push(at);
          }
        });
      } catch (error) {
        notes.push(`function ${firstDefined + k}: ${error.message}; its calls are not counted`);
      }
      r.at = end;
    }
  }
  for (const s of all) {
    add(s.start, s.body - s.start, s.name, 'section header');
    const r = new Reader(wasm, s.body);
    const vector = () => { const at = r.at; const n = r.u32(); add(at, r.at - at, s.name, 'count'); return n; };
    const entry = (what, place, more, read) => { const at = r.at; read(); add(at, r.at - at, s.name, what, place, more); };
    switch (s.id) {
      case 1: {
        let t = 0;
        for (let n = vector(); n > 0; n--) {
          if (wasm[r.at] === 0x4e) {
            const at = r.at;
            r.byte();
            const m = r.u32();
            add(at, r.at - at, s.name, 'rec group');
            for (let k = 0; k < m; k++) entry('type', types[t++] ?? -1, null, () => r.subtype());
          } else entry('type', types[t++] ?? -1, null, () => r.subtype());
        }
        break;
      }
      case 2:
        for (let n = vector(); n > 0; n--) {
          const at = r.at;
          const module = r.name();
          const field = r.name();
          const kind = r.byte();
          let place = -1, more = null;
          if (kind === 0) { r.u32(); more = { fn: imported.func }; place = fnPlace(imported.func++); }
          else if (kind === 1) { r.valtype(); r.limits(); }
          else if (kind === 2) { r.limits(); place = memories[imported.memory++] ?? -1; }
          else if (kind === 3) { r.valtype(); r.byte(); place = globals[imported.global++] ?? -1; }
          else if (kind === 4) { r.byte(); r.u32(); }
          const what = module === "'" ? 'string constant' : module === 'wasm:js-string' ? 'string builtin'
            : module === 'es' ? '@es import' : kind === 4 ? 'exception tag' : `${module} import`;
          add(at, r.at - at, s.name, what, place, more);
          imports.push({ module, field, place });
          if (module === 'es') esPlaces.set(field, place);
        }
        break;
      case 3: {
        let i = imported.func;
        for (let n = vector(); n > 0; n--, i++) entry('function type', fnPlace(i), { fn: i }, () => r.u32());
        break;
      }
      case 5: {
        let i = imported.memory;
        for (let n = vector(); n > 0; n--) entry('memory', memories[i++] ?? -1, null, () => r.limits());
        break;
      }
      case 6: {
        let i = imported.global;
        for (let n = vector(); n > 0; n--) entry('global', globals[i++] ?? -1, null, () => { r.valtype(); r.byte(); r.expr(); });
        break;
      }
      case 7:
        for (let n = vector(); n > 0; n--) {
          const at = r.at;
          r.name();
          const kind = r.byte();
          const index = r.u32();
          const place = kind === 0 ? fnPlace(index) : kind === 2 ? memories[index] ?? -1 : kind === 3 ? globals[index] ?? -1 : -1;
          add(at, r.at - at, s.name, 'export', place, kind === 0 ? { fn: index } : null);
        }
        break;
      case 8: {
        const index = r.u32();
        add(s.body, r.at - s.body, s.name, 'start', fnPlace(index), { fn: index });
        break;
      }
      case 9:
        for (let n = vector(); n > 0; n--) {
          const at = r.at;
          const flags = r.u32();
          if (flags > 3) { r.at = s.end; add(at, s.end - at, s.name, 'element segment'); break; }
          if (flags === 2) r.u32();
          if (flags === 0 || flags === 2) r.expr();
          if (flags !== 0) r.byte();
          const m = r.u32();
          add(at, r.at - at, s.name, 'element segment');
          for (let k = 0; k < m; k++) { const f = r.at; const index = r.u32(); add(f, r.at - f, s.name, 'element', fnPlace(index), { fn: index }); }
        }
        break;
      case 10: {
        const count = vector();
        const first = funcs.length - count;
        for (let k = 0; k < count; k++) blameBody(r, first + k);
        break;
      }
      case 11: {
        let d = 0;
        for (let n = vector(); n > 0; n--) {
          entry('data', data[d++] ?? -1, null, () => {
            const flags = r.u32();
            if (flags === 2) r.u32();
            if (flags !== 1) r.expr();
            const n = r.u32();
            r.at += n;
          });
        }
        break;
      }
      case 0:
        add(s.body, s.end - s.body, s.name, s.name === 'custom: name' ? 'names' : 'custom');
        r.at = s.end;
        break;
      default:
        // Counts, tables, tags: no place of their own.
        add(s.body, s.end - s.body, s.name, s.name);
        r.at = s.end;
    }
    if (s.id !== 9 && r.at !== s.end) throw new Error(`${s.name} section read to ${r.at}, not its end ${s.end}`);
  }
  records.sort((a, b) => a.at - b.at);

  /** Function `fn`'s body, at r: its size and locals on its place, its code by the map. */
  function blameBody(r, fn) {
    const sizeAt = r.at;
    const size = r.u32();
    const start = r.at;
    const end = start + size;
    const own = fnPlace(fn);
    const sites = calls.get(fn);
    if (funcs[fn]?.role === 'helper' && sites?.length) {
      // Shared: split among the calls to it, each on its call's place.
      const places = sites.map(at => { const k = entryAt(entries, at); return k >= 0 ? entries[k].place : -1; });
      const shares = apportion(end - sizeAt, places.map(() => 1));
      let at = sizeAt;
      places.forEach((place, i) => { add(at, shares[i], 'code', 'helper', place, { fn, helper: fn }); at += shares[i]; });
      r.at = end;
      return;
    }
    add(sizeAt, start - sizeAt, 'code', 'body size', own, { fn });
    for (let n = r.u32(); n > 0; n--) { r.u32(); r.valtype(); }
    add(start, r.at - start, 'code', 'locals', own, { fn });
    let at = r.at;
    let k = entryAt(entries, at);
    while (at < end) {
      const next = k + 1 < entries.length ? Math.min(entries[k + 1].at, end) : end;
      const e = entries[k];
      if (next > at) {
        // An entry before the body's (none: no map) is no place in it.
        const inside = e && e.at >= start;
        add(at, next - at, 'code', inside && e.place >= 0 ? 'code' : 'unplaced code', inside ? e.place : -1,
          { fn, site: inside ? e.site : -1 });
        at = next;
      }
      k++;
    }
    r.at = end;
  }

  const helpers = [...calls].map(([fn, sites]) => ({ fn, calls: sites.length }));
  return { records, helpers, imports, esPlaces, notes };
}

/** Whether records tile `length` bytes: each starting where the last ended, from 0 to the end. Throws where not. */
export function checkTiling(records, length) {
  let at = 0;
  for (const r of records) {
    if (r.at !== at) throw new Error(`blame: bytes ${Math.min(at, r.at)} to ${Math.max(at, r.at)} ${r.at > at ? 'unblamed' : 'blamed twice'} (${r.section}, ${r.what})`);
    at += r.bytes;
  }
  if (at !== length) throw new Error(`blame: ${at} of ${length} bytes blamed`);
  return true;
}

/**
 * The glue module's source (glueSource of the spec), blamed: each @es
 * binding's export on its declaration (by its import's place), the hoisted
 * imports and the joins in buckets. Its records tile the source's UTF-8 bytes.
 */
export function blameGlue(spec, esPlaces = new Map()) {
  const source = glueModuleSource(spec.es ?? {});
  const records = [];
  if (!source) return { bytes: 0, records };
  const size = text => encoder.encode(text).length;
  const hoisted = new Set();
  const parts = [];
  let check = false;
  for (const fields of Object.values(spec.es ?? {})) {
    for (const [field, body] of Object.entries(fields ?? {})) {
      const { imports, expr } = splitBody(body);
      for (const decl of imports) hoisted.add(decl);
      check ||= expr.includes('$utuFn(');
      parts.push({ field, bytes: size(`export const ${glueName(field)} = (\n${expr}\n);`) });
    }
  }
  let at = 0;
  const add = (bytes, what, place = -1, field = null) => { if (bytes > 0) records.push({ at, bytes, section: 'glue', what, place, site: -1, fn: -1, helper: -1, field }); at += bytes; };
  if (hoisted.size) add(size(`${[...hoisted].join('\n')}\n\n`), 'glue imports');
  if (check) add(size(`${FUN_CHECK}\n\n`), 'glue helper');
  parts.forEach((part, i) => {
    add(part.bytes, '@es binding', esPlaces.get(part.field) ?? -1, part.field);
    add(i < parts.length - 1 ? 2 : 1, 'glue joins');
  });
  const bytes = size(source);
  if (at !== bytes) throw new Error(`glue blame covers ${at} of ${bytes} bytes`);
  return { bytes, records };
}

/**
 * Each byte's estimated share of the module's brotli size, as running sums
 * (`cum[i]`: bytes before i). One brotli stream (quality 9) flushed every
 * `chunk` bytes gives each chunk's cost given all before it; each byte of a
 * chunk takes an equal part, scaled so the whole is the quality-11 size. An
 * estimate: a bucket's real cost depends on what else is there.
 */
export async function estimateCompressed(bytes, { chunk = 2048 } = {}) {
  const zlib = await import('node:zlib');
  const { constants } = zlib;
  const total = zlib.brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  const stream = zlib.createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } });
  let out = 0;
  stream.on('data', d => { out += d.length; });
  const costs = [];
  for (let at = 0; at < bytes.length; at += chunk) {
    const before = out;
    stream.write(bytes.subarray(at, at + chunk));
    await new Promise(resolve => stream.flush(constants.BROTLI_OPERATION_FLUSH, resolve));
    costs.push(out - before);
  }
  stream.end();
  await new Promise(resolve => stream.on('end', resolve));
  const scale = total / Math.max(1, costs.reduce((a, b) => a + b, 0));
  const cum = new Float64Array(bytes.length + 1);
  for (let i = 0; i < bytes.length; i++) {
    const c = Math.floor(i / chunk);
    const width = Math.min(chunk, bytes.length - c * chunk);
    cum[i + 1] = cum[i] + costs[c] * scale / width;
  }
  return { total, cum, method: `brotli q9 flushed every ${chunk} bytes, each chunk's cost spread over its bytes, scaled to the q11 total` };
}

/**
 * The records summed: totals by section, bucket (what has no place), file,
 * declaration, line, function, helper, and inlined callee. With
 * `compressed` (estimateCompressed of the module), each has its estimated
 * brotli share (`br`); with `glue` (blameGlue), the glue's records count
 * toward files, declarations and lines too, apart (`glue`).
 */
export function report({ wasm, tables, blamed, compressed = null, glue = null, name = 'module.wasm' }) {
  const { places, decls, funcs } = tables;
  const { records } = blamed;
  const br = r => compressed ? compressed.cum[r.at + r.bytes] - compressed.cum[r.at] : 0;
  const bump = (map, key, make) => { let row = map.get(key); if (!row) map.set(key, row = { ...make(), bytes: 0, br: 0 }); return row; };
  const sectionRows = new Map(), buckets = new Map(), files = new Map(), declRows = new Map(), lines = new Map();
  const fnRows = new Map(), callees = new Map();
  let inlined = 0;
  const declKey = place => place >= 0 && places[place].decl >= 0 ? places[place].decl : -1;
  const declRow = d => bump(declRows, d, () => d >= 0
    ? { decl: d, name: decls[d].name, kind: decls[d].kind, file: decls[d].file, line: decls[d].line, inlined: 0, helpers: 0, glue: 0, sections: {} }
    : { decl: -1, name: '(no declaration)', kind: null, file: null, line: null, inlined: 0, helpers: 0, glue: 0, sections: {} });
  const lineRow = p => bump(lines, `${places[p].file}:${places[p].line}`, () => ({
    file: places[p].file, line: places[p].line, decl: declKey(p), inlined: 0, inlinedHere: 0, helpers: 0, glue: 0,
  }));
  for (const r of records) {
    const b = br(r);
    const s = bump(sectionRows, r.section, () => ({ section: r.section, unattributed: 0 }));
    s.bytes += r.bytes; s.br += b;
    if (r.place < 0) {
      s.unattributed += r.bytes;
      const u = bump(buckets, `${r.section}\u0000${r.what}`, () => ({ section: r.section, what: r.what }));
      u.bytes += r.bytes; u.br += b;
      continue;
    }
    const p = places[r.place];
    const f = bump(files, p.file, () => ({ file: p.file }));
    f.bytes += r.bytes; f.br += b;
    const d = declRow(declKey(r.place));
    d.bytes += r.bytes; d.br += b;
    d.sections[r.section] = (d.sections[r.section] ?? 0) + r.bytes;
    const l = lineRow(r.place);
    l.bytes += r.bytes; l.br += b;
    if (r.helper >= 0) { d.helpers += r.bytes; l.helpers += r.bytes; }
    if (r.site >= 0) {
      // A copy of the callee's code at a call: the callee's line, and the call's.
      inlined += r.bytes;
      d.inlined += r.bytes;
      l.inlined += r.bytes;
      lineRow(r.site).inlinedHere += r.bytes;
      const c = bump(callees, declKey(r.place), () => ({ decl: declKey(r.place), sites: new Set() }));
      c.bytes += r.bytes; c.br += b;
      c.sites.add(r.site);
    }
    if (r.fn >= 0 && r.section === 'code') {
      const fr = bump(fnRows, r.fn, () => ({ index: r.fn, name: funcs[r.fn]?.name ?? null, role: funcs[r.fn]?.role ?? null, place: funcs[r.fn]?.place ?? -1, inlined: 0 }));
      fr.bytes += r.bytes; fr.br += b;
      if (r.site >= 0) fr.inlined += r.bytes;
    }
  }
  for (const r of glue?.records ?? []) {
    if (r.place < 0) continue;
    const p = places[r.place];
    const f = bump(files, p.file, () => ({ file: p.file }));
    f.glue = (f.glue ?? 0) + r.bytes;
    declRow(declKey(r.place)).glue += r.bytes;
    lineRow(r.place).glue += r.bytes;
  }
  // Helpers: each one's bytes and the calls they are split among.
  const helperRows = new Map();
  for (const r of records) {
    if (r.helper < 0) continue;
    const h = bump(helperRows, r.helper, () => ({ index: r.helper, name: funcs[r.helper]?.name ?? null, calls: 0, sites: new Set() }));
    h.bytes += r.bytes; h.br += br(r);
  }
  for (const { fn, calls } of blamed.helpers) if (helperRows.has(fn)) helperRows.get(fn).calls = calls;
  for (const r of records) if (r.helper >= 0 && r.place >= 0) helperRows.get(r.helper).sites.add(`${places[r.place].file}:${places[r.place].line}`);
  const sorted = map => [...map.values()].sort((a, b) => b.bytes - a.bytes);
  const round = rows => rows.map(row => ({ ...row, br: Math.round(row.br * 10) / 10 }));
  const codeBytes = sectionRows.get('code')?.bytes ?? 0;
  return {
    name, bytes: wasm.length,
    blamed: records.reduce((n, r) => n + (r.place >= 0 ? r.bytes : 0), 0),
    compressed: compressed ? { bytes: compressed.total, estimate: compressed.method } : null,
    sections: round(sorted(sectionRows)),
    unattributed: round(sorted(buckets)),
    files: round(sorted(files)),
    decls: round(sorted(declRows)),
    lines: round(sorted(lines)),
    functions: round(sorted(fnRows)).map(row => {
      const p = row.place >= 0 ? places[row.place] : null;
      return { ...row, file: p?.file ?? null, line: p?.line ?? null, decl: p ? declKey(row.place) : -1, place: undefined };
    }),
    helpers: round(sorted(helperRows)).map(row => ({ ...row, sites: row.sites.size })),
    inlining: {
      bytes: inlined, ofCode: codeBytes ? inlined / codeBytes : 0,
      callees: round(sorted(callees)).map(row => ({ ...row, sites: row.sites.size })),
    },
    glue: glue ? { bytes: glue.bytes } : null,
    declTable: decls.map(d => ({ name: d.name, kind: d.kind, file: d.file, line: d.line })),
    notes: blamed.notes,
  };
}

const num = n => Math.round(n).toLocaleString('en-US');
const pct = (n, of) => of ? `${(100 * n / of).toFixed(1)}%` : '-';

/** The report's top `n` of each list, as terminal text. */
export function formatTop(rep, { n = 10, relative = key => key } = {}) {
  const out = [];
  const total = rep.bytes;
  const br = rep.compressed ? `, brotli ${num(rep.compressed.bytes)}` : '';
  out.push(`${rep.name}  ${num(total)} bytes${br}; ${pct(rep.blamed, total)} blamed on source, the rest in buckets below`);
  const table = (title, rows, cells) => {
    if (!rows.length) return;
    out.push('', title);
    const body = rows.slice(0, n).map(cells);
    const widths = body[0].map((_, i) => Math.max(...body.map(row => String(row[i]).length)));
    for (const row of body) out.push(`  ${row.map((cell, i) => i < 2 ? String(cell).padStart(widths[i]) : String(cell).padEnd(widths[i])).join('  ').trimEnd()}`);
  };
  const where = (file, line) => file ? `${relative(file)}:${line}` : '';
  const brCell = row => rep.compressed ? `~${num(row.br)} br` : '';
  table('sections', rep.sections, s => [num(s.bytes), pct(s.bytes, total), s.section, brCell(s), s.unattributed ? `${num(s.unattributed)} in buckets` : '']);
  table('declarations', rep.decls, d => [num(d.bytes), pct(d.bytes, total), d.name, where(d.file, d.line), brCell(d),
    [d.inlined && `${num(d.inlined)} inlined copies`, d.helpers && `${num(d.helpers)} helper shares`].filter(Boolean).join(', ')]);
  table('lines', rep.lines, l => [num(l.bytes), pct(l.bytes, total), where(l.file, l.line), rep.declTable[l.decl]?.name ?? '', brCell(l)]);
  table('functions (code)', rep.functions, f => [num(f.bytes), pct(f.bytes, total), f.name ?? `function ${f.index}`, where(f.file, f.line), f.role === 'defined' ? '' : f.role]);
  table('files', rep.files, f => [num(f.bytes), pct(f.bytes, total), relative(f.file), brCell(f)]);
  table('helpers (split among their calls)', rep.helpers, h => [num(h.bytes), pct(h.bytes, total), h.name ?? `function ${h.index}`, `${h.calls} calls from ${h.sites} lines`]);
  if (rep.inlining.bytes) {
    out.push('', `inlining: ${num(rep.inlining.bytes)} bytes (${pct(rep.inlining.bytes, rep.sections.find(s => s.section === 'code')?.bytes ?? 0)} of code) are copies of inlined functions`);
    table('inlined callees', rep.inlining.callees, c => [num(c.bytes), pct(c.bytes, total), rep.declTable[c.decl]?.name ?? '(none)', `at ${c.sites} calls`]);
  }
  table('buckets (no source)', rep.unattributed, u => [num(u.bytes), pct(u.bytes, total), u.what, u.section]);
  if (rep.glue?.bytes) out.push('', `glue: ${num(rep.glue.bytes)} bytes of @es source (before bundling)`);
  if (rep.compressed) out.push('', `br: estimated (${rep.compressed.estimate})`);
  for (const note of rep.notes) out.push(`note: ${note}`);
  return out.join('\n');
}

/**
 * The report as a page: a treemap (file → declaration → line; click to go
 * in, the path to go out) and the source of what is chosen, each line with
 * its bytes. `texts`: file key → its text, for the files the report names.
 */
export function blameHtml(rep, texts = new Map(), { relative = key => key } = {}) {
  const files = {};
  for (const f of rep.files) if (texts.has(f.file)) files[f.file] = texts.get(f.file);
  const data = {
    name: rep.name, bytes: rep.bytes, blamed: rep.blamed, compressed: rep.compressed, sections: rep.sections,
    unattributed: rep.unattributed, files: rep.files.map(f => ({ ...f, label: relative(f.file) })),
    decls: rep.declTable, declBytes: rep.decls.map(d => [d.decl, d.bytes, d.br]),
    lines: rep.lines.map(l => [l.file, l.line, l.decl, l.bytes, l.br, l.inlined, l.inlinedHere, l.helpers, l.glue]),
    helpers: rep.helpers, inlining: rep.inlining, texts: files,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return PAGE.replace('__TITLE__', escapeHtml(`${rep.name} size blame`)).replace('__DATA__', () => json);
}

const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
:root { --bg: #fbfaf7; --fg: #23262d; --dim: #737985; --line: #dedad2; --panel: #ffffff; --hot: #c2410c; --cool: #2563eb; --bar: #f2d3bf; }
@media (prefers-color-scheme: dark) { :root { --bg: #16181d; --fg: #e5e7eb; --dim: #9aa1ad; --line: #2c3038; --panel: #1d2026; --hot: #fb923c; --cool: #60a5fa; --bar: #5b3420; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; }
header { padding: 12px 16px; border-bottom: 1px solid var(--line); }
h1 { font-size: 17px; margin: 0 0 4px; }
.dim { color: var(--dim); }
main { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 12px; padding: 12px 16px; height: calc(100vh - 76px); }
@media (max-width: 800px) { main { grid-template-columns: 1fr; height: auto; } #map { height: 60vh; } #source { height: 60vh; } }
#crumbs { margin-bottom: 6px; } #crumbs a { color: var(--cool); cursor: pointer; text-decoration: none; }
#mapwrap { display: flex; flex-direction: column; min-height: 0; }
#map { position: relative; flex: 1; min-height: 300px; background: var(--panel); border: 1px solid var(--line); overflow: hidden; }
.cell { position: absolute; overflow: hidden; border: 1px solid var(--bg); padding: 2px 4px; font-size: 12px; cursor: pointer; color: #111; }
.cell:hover { outline: 2px solid var(--fg); z-index: 1; }
.cell b { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#side { display: flex; flex-direction: column; min-height: 0; }
#tabs button { font: inherit; background: none; border: 1px solid var(--line); color: var(--fg); padding: 2px 8px; cursor: pointer; }
#tabs button.on { background: var(--panel); border-bottom-color: var(--panel); }
#source, #lists { flex: 1; overflow: auto; background: var(--panel); border: 1px solid var(--line); font: 12px/1.45 ui-monospace, monospace; }
.row { display: grid; grid-template-columns: 4.5em 5.5em 1fr; white-space: pre; }
.row .n { color: var(--dim); text-align: right; padding-right: 6px; }
.row .b { text-align: right; padding-right: 6px; background-repeat: no-repeat; }
.row.focus { background: color-mix(in srgb, var(--hot) 15%, transparent); }
#lists table { border-collapse: collapse; width: 100%; } #lists td, #lists th { padding: 1px 6px; text-align: left; white-space: nowrap; }
#lists td.r { text-align: right; } #lists h3 { margin: 10px 6px 4px; font: 600 13px system-ui, sans-serif; }
</style></head><body>
<header><h1 id="title"></h1><div class="dim" id="summary"></div></header>
<main><div id="mapwrap"><div id="crumbs"></div><div id="map"></div></div>
<div id="side"><div id="tabs"><button data-tab="source" class="on">Source</button><button data-tab="lists">Totals</button></div>
<div id="source"></div><div id="lists" hidden></div></div></main>
<script>
const D = __DATA__;
const fmt = n => Math.round(n).toLocaleString('en-US');
const pc = n => (100 * n / D.bytes).toFixed(1) + '%';
document.getElementById('title').textContent = D.name + ' — ' + fmt(D.bytes) + ' bytes';
document.getElementById('summary').textContent = pc(D.blamed) + ' blamed on source; '
  + D.sections.map(s => s.section + ' ' + fmt(s.bytes)).join(', ')
  + (D.compressed ? '. Brotli ' + fmt(D.compressed.bytes) + ' (per bucket: estimated).' : '.');
// The tree: files, their declarations, their lines; buckets with no source beside them.
const root = { name: 'all', kids: [] };
const byFile = new Map();
for (const f of D.files) { const node = { name: f.label, file: f.file, kids: [], decls: new Map() }; byFile.set(f.file, node); root.kids.push(node); }
for (const [file, line, decl, bytes, br] of D.lines) {
  const f = byFile.get(file); if (!f || !bytes) continue;
  const d = D.decls[decl];
  let dn = f.decls.get(decl);
  if (!dn) { dn = { name: d ? d.name : '(no declaration)', file, line: d ? d.line : line, kids: [] }; f.decls.set(decl, dn); f.kids.push(dn); }
  dn.kids.push({ name: 'line ' + line, file, line, size: bytes, br });
}
if (D.unattributed.length) root.kids.push({ name: '(no source)', kids: D.unattributed.map(u => ({ name: u.what + ' (' + u.section + ')', size: u.bytes, br: u.br })) });
const sum = n => n.size ?? (n.size = n.kids.reduce((a, k) => a + sum(k), 0));
sum(root);
// Squarified treemap.
function layout(kids, x, y, w, h, out) {
  const items = kids.filter(k => k.size > 0).sort((a, b) => b.size - a.size);
  const total = items.reduce((a, k) => a + k.size, 0);
  if (!total) return;
  const scale = w * h / total;
  let i = 0;
  while (i < items.length) {
    const short = Math.min(w, h);
    let row = [], best = Infinity, area = 0;
    while (i < items.length) {
      const a = items[i].size * scale;
      const next = area + a;
      const side = next / short;
      const worst = Math.max(...row.concat(items[i]).map(k => { const s = k.size * scale / side; return Math.max(side / s, s / side); }));
      if (worst > best) break;
      best = worst; area = next; row.push(items[i]); i++;
    }
    const side = area / short;
    let off = 0;
    for (const k of row) {
      const len = k.size * scale / side;
      if (w >= h) out.push([k, x, y + off, side, len]); else out.push([k, x + off, y, len, side]);
      off += len;
    }
    if (w >= h) { x += side; w -= side; } else { y += side; h -= side; }
  }
}
const palette = ['#f6c89f', '#a7c7e7', '#b8e0b0', '#f2b5c4', '#d6c4f0', '#f7e3a1', '#a8dadc', '#e8c39e', '#c9d6a3', '#f0b8a0'];
let path = [root];
function draw() {
  const node = path[path.length - 1];
  const map = document.getElementById('map');
  map.innerHTML = '';
  const out = [];
  layout(node.kids ?? [], 0, 0, map.clientWidth, map.clientHeight, out);
  out.forEach(([k, x, y, w, h], i) => {
    const el = document.createElement('div');
    el.className = 'cell';
    Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', background: palette[(path.length === 1 ? i : root.kids.indexOf(path[1])) % palette.length] });
    el.style.filter = 'brightness(' + (1 - 0.06 * (path.length - 1)) + ')';
    el.title = k.name + ' — ' + fmt(k.size) + ' bytes (' + pc(k.size) + ')' + (k.br != null && D.compressed ? ', ~' + fmt(k.br) + ' br' : '');
    if (w > 40 && h > 16) el.innerHTML = '<b></b><span></span>';
    if (el.firstChild) { el.firstChild.textContent = k.name; el.lastChild.textContent = fmt(k.size); }
    el.onclick = () => { if (k.file) showSource(k.file, k.line); if (k.kids) { path.push(k); draw(); } };
    map.appendChild(el);
  });
  const crumbs = document.getElementById('crumbs');
  crumbs.innerHTML = '';
  path.forEach((p, i) => {
    const a = document.createElement('a');
    a.textContent = (i ? ' › ' : '') + p.name + ' (' + fmt(p.size) + ')';
    a.onclick = () => { path = path.slice(0, i + 1); draw(); };
    crumbs.appendChild(a);
  });
}
const lineBytes = new Map();
for (const [file, line, , bytes, br, inl, here, helpers, glue] of D.lines) lineBytes.set(file + ':' + line, { bytes, br, inl, here, helpers, glue });
function showSource(file, focus) {
  const text = D.texts[file];
  const el = document.getElementById('source');
  setTab('source');
  el.innerHTML = '';
  if (text == null) { el.textContent = 'No source for ' + file; return; }
  const lines = text.split('\\n');
  let max = 1;
  for (let i = 0; i < lines.length; i++) max = Math.max(max, lineBytes.get(file + ':' + (i + 1))?.bytes ?? 0);
  const frag = document.createDocumentFragment();
  let target = null;
  lines.forEach((t, i) => {
    const info = lineBytes.get(file + ':' + (i + 1));
    const row = document.createElement('div');
    row.className = 'row' + (i + 1 === focus ? ' focus' : '');
    const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1;
    const b = document.createElement('span'); b.className = 'b';
    if (info) {
      b.textContent = fmt(info.bytes);
      b.style.backgroundImage = 'linear-gradient(to left, var(--bar), var(--bar))';
      b.style.backgroundSize = (100 * info.bytes / max) + '% 100%';
      b.style.backgroundPosition = 'right';
      b.title = fmt(info.bytes) + ' bytes' + (D.compressed ? ', ~' + fmt(info.br) + ' br' : '') + (info.inl ? '; ' + fmt(info.inl) + ' in inlined copies' : '')
        + (info.here ? '; ' + fmt(info.here) + ' inlined here' : '') + (info.helpers ? '; ' + fmt(info.helpers) + ' helper share' : '') + (info.glue ? '; ' + fmt(info.glue) + ' glue JS' : '');
    }
    const c = document.createElement('span'); c.textContent = t;
    row.append(n, b, c);
    frag.appendChild(row);
    if (i + 1 === focus) target = row;
  });
  el.appendChild(frag);
  if (target) target.scrollIntoView({ block: 'center' });
}
function setTab(name) {
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === name);
  document.getElementById('source').hidden = name !== 'source';
  document.getElementById('lists').hidden = name !== 'lists';
}
for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => setTab(b.dataset.tab);
function lists() {
  const el = document.getElementById('lists');
  const table = (title, head, rows) => {
    const h = document.createElement('h3'); h.textContent = title; el.appendChild(h);
    const t = document.createElement('table');
    const tr = document.createElement('tr');
    for (const x of head) { const th = document.createElement('th'); th.textContent = x; tr.appendChild(th); }
    t.appendChild(tr);
    for (const row of rows.slice(0, 200)) {
      const r = document.createElement('tr');
      row.forEach((x, i) => { const td = document.createElement('td'); td.textContent = x; if (i < 2) td.className = 'r'; r.appendChild(td); });
      t.appendChild(r);
    }
    el.appendChild(t);
  };
  table('Sections', ['bytes', '%', 'section', 'in buckets'], D.sections.map(s => [fmt(s.bytes), pc(s.bytes), s.section, s.unattributed ? fmt(s.unattributed) : '']));
  const declRows = D.declBytes.map(([d, bytes]) => [fmt(bytes), pc(bytes), D.decls[d]?.name ?? '(no declaration)', D.decls[d] ? D.decls[d].file.split('/').pop() + ':' + D.decls[d].line : '']);
  table('Declarations', ['bytes', '%', 'declaration', 'at'], declRows);
  table('Helpers (split among calls)', ['bytes', '%', 'helper', 'calls'], D.helpers.map(h => [fmt(h.bytes), pc(h.bytes), h.name ?? '', h.calls]));
  table('Inlined callees', ['bytes', '%', 'callee', 'sites'], D.inlining.callees.map(c => [fmt(c.bytes), pc(c.bytes), D.decls[c.decl]?.name ?? '', c.sites]));
  table('No source', ['bytes', '%', 'bucket', 'section'], D.unattributed.map(u => [fmt(u.bytes), pc(u.bytes), u.what, u.section]));
}
lists();
draw();
addEventListener('resize', draw);
</script></body></html>
`;
