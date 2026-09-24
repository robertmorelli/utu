// Read import names without instantiating or asking the host to understand GC
// function types. Some engines can run those modules but cannot reflect them.
// This scans framing and import descriptors; it is not a Wasm validator.
export function wasmImports(input) {
  const bytes = input instanceof Uint8Array ? input
    : input instanceof ArrayBuffer ? new Uint8Array(input)
    : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null;
  if (!bytes) throw new TypeError('wasm imports: expected bytes');
  let offset = 0, limit = bytes.length;
  const fail = () => { throw new Error('wasm imports: malformed or unsupported binary'); };
  const byte = () => { if (offset >= limit) fail(); return bytes[offset++]; };
  const leb = (max = 5) => {
    let value = 0;
    for (let i = 0; i < max; i++) {
      const part = byte();
      if (max === 5 && i === 4 && (part & 0xf0)) fail();
      value += (part & 0x7f) * 2 ** (7 * i);
      if (!(part & 0x80)) return value;
    }
    fail();
  };
  const skipLeb = () => { for (let i = 0; i < 10; i++) if (!(byte() & 0x80)) return; fail(); };
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const name = () => {
    const size = leb(), end = offset + size;
    if (end > limit) fail();
    const value = decoder.decode(bytes.subarray(offset, end));
    offset = end;
    return value;
  };
  const refType = () => { const type = byte(); if (type === 0x63 || type === 0x64) skipLeb(); };
  const limits = () => {
    const flags = leb();
    if (flags & ~7) fail();
    skipLeb();
    if (flags & 1) skipLeb();
  };
  for (const expected of [0, 97, 115, 109, 1, 0, 0, 0]) if (byte() !== expected) fail();
  const imports = [];
  while (offset < bytes.length) {
    const section = byte(), size = leb(), end = offset + size;
    if (end > bytes.length) fail();
    if (section !== 2) { offset = end; continue; }
    limit = end;
    const count = leb();
    for (let i = 0; i < count; i++) {
      const module = name(), field = name(), kind = byte();
      switch (kind) {
        case 0: leb(); break; // function type index
        case 1: refType(); limits(); break;
        case 2: limits(); break;
        case 3: refType(); byte(); break; // global value type and mutability
        case 4: leb(); leb(); break; // exception tag attributes and type index
        default: fail();
      }
      imports.push({ module, name: field, kind });
    }
    if (offset !== end) fail();
    limit = bytes.length;
  }
  return imports;
}
