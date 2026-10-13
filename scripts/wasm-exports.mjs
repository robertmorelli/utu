// Export functions of a wasm binary by (part of) their names, and strip it.
//
// For benchmark harnesses that compile other languages to wasm: rustc keeps
// a function's mangled name in the name section but may not export it.
// `exportFunctions(bytes, [['run17h', 'run']])` exports the function whose
// name contains `run17h` as `run`, then drops every custom section (names,
// producers), as `wasm-opt --strip` did.

export function exportFunctions(bytes, wanted) {
  const sections = readSections(bytes);
  const names = functionNames(sections);
  const exports = sections.find(section => section.id === 7);
  const entries = exports ? readExports(exports.body) : [];
  for (const [part, exported] of wanted) {
    const match = [...names].find(([, name]) => name.includes(part));
    if (!match) throw new Error(`no function named like ${part}`);
    entries.push({ name: exported, kind: 0, index: match[0] });
  }
  const body = [...u32(entries.length), ...entries.flatMap(entry => [...name(entry.name), entry.kind, ...u32(entry.index)])];
  const kept = sections.filter(section => section.id !== 0 && section.id !== 7);
  const at = kept.findIndex(section => section.id > 7);
  kept.splice(at < 0 ? kept.length : at, 0, { id: 7, body: Uint8Array.from(body) });
  return Uint8Array.from([...bytes.subarray(0, 8), ...kept.flatMap(section => [section.id, ...u32(section.body.length), ...section.body])]);
}

function readSections(bytes) {
  const sections = [];
  const reader = new Reader(bytes, 8);
  while (reader.at < bytes.length) {
    const id = reader.byte();
    const size = reader.u32();
    sections.push({ id, body: bytes.subarray(reader.at, reader.at + size) });
    reader.at += size;
  }
  return sections;
}

/** Function index → name, from the name section. */
function functionNames(sections) {
  const names = new Map();
  for (const section of sections.filter(entry => entry.id === 0)) {
    const reader = new Reader(section.body, 0);
    if (reader.name() !== 'name') continue;
    while (reader.at < section.body.length) {
      const kind = reader.byte();
      const size = reader.u32();
      const end = reader.at + size;
      if (kind === 1) {
        for (let count = reader.u32(); count > 0; count--) names.set(reader.u32(), reader.name());
      }
      reader.at = end;
    }
  }
  return names;
}

function readExports(body) {
  const reader = new Reader(body, 0);
  const entries = [];
  for (let count = reader.u32(); count > 0; count--) entries.push({ name: reader.name(), kind: reader.byte(), index: reader.u32() });
  return entries;
}

class Reader {
  constructor(bytes, at) {
    this.bytes = bytes;
    this.at = at;
  }

  byte() {
    return this.bytes[this.at++];
  }

  u32() {
    let value = 0;
    for (let shift = 0; ; shift += 7) {
      const b = this.byte();
      value |= (b & 0x7f) << shift;
      if (!(b & 0x80)) return value >>> 0;
    }
  }

  name() {
    const length = this.u32();
    const text = new TextDecoder().decode(this.bytes.subarray(this.at, this.at + length));
    this.at += length;
    return text;
  }
}

function u32(value) {
  const out = [];
  do {
    let b = value & 0x7f;
    value >>>= 7;
    if (value) b |= 0x80;
    out.push(b);
  } while (value);
  return out;
}

function name(text) {
  const bytes = new TextEncoder().encode(text);
  return [...u32(bytes.length), ...bytes];
}
