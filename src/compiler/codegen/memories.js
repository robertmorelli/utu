// codegen/memories.js — `mem` declarations: one wasm linear memory each.
//
// Each mem gets its own memory (multi-memory), a mutable i32 global holding
// its length, and on first use small helpers for push/reserve/resize. Element
// i lives at byte i << shift, so a read is one load with no base pointer and
// no explicit bounds check (the engine's guard pages bound the memory).
import { wasm } from './types.js';

// The largest memory whose byte size still fits in an i32 (4 GiB - 64 KiB).
const MAX_PAGES = 65535;

const KINDS = {
  U8:  { shift: 0, type: 'i32', load: 'load8_u', store: 'store8' },
  I8:  { shift: 0, type: 'i32', load: 'load8_s', store: 'store8' },
  U16: { shift: 1, type: 'i32', load: 'load16_u', store: 'store16' },
  I16: { shift: 1, type: 'i32', load: 'load16_s', store: 'store16' },
  I32: { shift: 2, type: 'i32', load: 'load', store: 'store' },
  U32: { shift: 2, type: 'i32', load: 'load', store: 'store' },
  I64: { shift: 3, type: 'i64', load: 'load', store: 'store' },
  U64: { shift: 3, type: 'i64', load: 'load', store: 'store' },
  F32: { shift: 2, type: 'f32', load: 'load', store: 'store' },
  F64: { shift: 3, type: 'f64', load: 'load', store: 'store' },
};

/** The mems that lowerMems recorded on the root, in declaration order. */
export function readMems(root) {
  try {
    return JSON.parse(root?.attr?.('data-mems') || '[]');
  } catch {
    return [];
  }
}

/**
 * A module that declares every mem's memory. A host mem (copy_in, view) is
 * created by the host and imported.
 */
export function moduleWithMemories(mems) {
  const m = new wasm.Module();
  for (const { name, export: exported, host, data } of mems) {
    m.addMemory({
      name, initial: initialPages(data), maximum: MAX_PAGES, exported: Boolean(exported),
      import: host ? { module: 'utu', base: `mem_${name}` } : null,
    });
  }
  // An initialized mem is filled by an active data segment at instantiation.
  for (const { name, data } of mems) if (data) m.addDataSegment(name, 0, base64Bytes(data));
  return m;
}

function base64Bytes(text) {
  return Uint8Array.from(atob(text), char => char.charCodeAt(0));
}

/** Pages an initialized mem starts with, so its data fits. */
export function initialPages(data) {
  return Math.max(1, Math.ceil((data ? (data.length * 3) / 4 : 0) / 65536));
}

export function declareMemoryGlobals(m, mems) {
  for (const { name, host, count = 0 } of mems) {
    m.addGlobal(lengthGlobal(name), wasm.i32, true, m.i32.const(count));
    if (!host) continue;
    m.addFunctionImport(`__mem_copy_in_${name}`, 'utu', `mem_copy_in_${name}`, wasm.externref, wasm.i32);
    m.addFunctionImport(`__mem_view_${name}`, 'utu', `mem_view_${name}`, wasm.createType([wasm.i32, wasm.i32]), wasm.externref);
  }
}

export function isMemIntrinsic(node) {
  return node?.localName?.startsWith('ir-mem-') ?? false;
}

/** Emit one <ir-mem-*> op with the call's argument nodes. */
export function emitMemIntrinsic(opNode, argNodes, ctx, emitExpr) {
  const m = ctx.module;
  const name = opNode.getAttribute('mem');
  const kind = KINDS[opNode.getAttribute('kind')];
  if (!name || !kind) throw new Error(`codegen: malformed <${opNode.localName}>`);
  const args = argNodes.map(node => emitExpr(node, ctx));
  const address = index => (kind.shift ? m.i32.shl(index, m.i32.const(kind.shift)) : index);
  const ops = m[kind.type];
  switch (opNode.localName) {
    case 'ir-mem-get': return ops[kind.load](0, 1 << kind.shift, address(args[0]), name);
    case 'ir-mem-set': return ops[kind.store](0, 1 << kind.shift, address(args[0]), args[1], name);
    case 'ir-mem-len': return m.global.get(lengthGlobal(name), wasm.i32);
    case 'ir-mem-cap': return capacity(m, name, kind);
    case 'ir-mem-clear': return m.global.set(lengthGlobal(name), m.i32.const(0));
    case 'ir-mem-copy-in': return m.global.set(lengthGlobal(name), m.call(`__mem_copy_in_${name}`, args, wasm.i32));
    case 'ir-mem-view': return m.call(`__mem_view_${name}`, args, wasm.externref);
    case 'ir-mem-push': return m.call(ensureHelpers(ctx, name, kind).push, args, wasm.none);
    case 'ir-mem-reserve': return m.call(ensureHelpers(ctx, name, kind).reserve, args, wasm.none);
    case 'ir-mem-resize': return m.call(ensureHelpers(ctx, name, kind).resize, args, wasm.none);
    default: throw new Error(`codegen: no mem intrinsic <${opNode.localName}>`);
  }
}

function lengthGlobal(name) {
  return `__mem_len_${name}`;
}

function capacity(m, name, kind) {
  return m.i32.shl(m.memory.size(name), m.i32.const(16 - kind.shift));
}

// Codegen copies its context per function, so helpers are tracked per module.
const HELPERS = new WeakMap();

/** push, reserve, and resize for one mem, added once per module. */
function ensureHelpers(ctx, name, kind) {
  const m = ctx.module;
  if (!HELPERS.has(m)) HELPERS.set(m, new Map());
  const added = HELPERS.get(m);
  if (added.has(name)) return added.get(name);
  const i32 = wasm.i32;
  const helpers = { reserve: `__mem_reserve_${name}`, push: `__mem_push_${name}`, resize: `__mem_resize_${name}` };
  added.set(name, helpers);

  // reserve(n): grow to at least ceil(n elements / page) pages, doubling when
  // that is larger. A failed grow traps.
  const perPage = 1 << (16 - kind.shift);
  const need = m.i32.shr_u(m.i32.add(m.local.get(0, i32), m.i32.const(perPage - 1)), m.i32.const(16 - kind.shift));
  const grew = delta => m.i32.ne(m.memory.grow(delta, name), m.i32.const(-1));
  m.addFunction(helpers.reserve, i32, wasm.none, [i32, i32], m.block(null, [
    m.local.set(1, need),
    m.local.set(2, m.memory.size(name)),
    m.if(m.i32.gt_u(m.local.get(1, i32), m.local.get(2, i32)), m.block(null, [
      m.if(m.i32.eqz(grew(m.select(
        m.i32.gt_u(m.local.get(2, i32), m.i32.sub(m.local.get(1, i32), m.local.get(2, i32))),
        m.local.get(2, i32),
        m.i32.sub(m.local.get(1, i32), m.local.get(2, i32)),
      ))), m.if(m.i32.eqz(grew(m.i32.sub(m.local.get(1, i32), m.local.get(2, i32)))), m.unreachable())),
    ])),
  ]));

  // push(v): reserve one more when full, store at len, then len += 1.
  const valueType = wasm[kind.type];
  const address = index => (kind.shift ? m.i32.shl(index, m.i32.const(kind.shift)) : index);
  m.addFunction(helpers.push, valueType, wasm.none, [i32], m.block(null, [
    m.local.set(1, m.global.get(lengthGlobal(name), i32)),
    m.if(m.i32.ge_u(m.local.get(1, i32), capacity(m, name, kind)),
      m.call(helpers.reserve, [m.i32.add(m.local.get(1, i32), m.i32.const(1))], wasm.none)),
    m[kind.type][kind.store](0, 1 << kind.shift, address(m.local.get(1, i32)), m.local.get(0, valueType), name),
    m.global.set(lengthGlobal(name), m.i32.add(m.local.get(1, i32), m.i32.const(1))),
  ]));

  // resize(n): reserve(n), then len = n. Elements keep whatever they held.
  m.addFunction(helpers.resize, i32, wasm.none, [], m.block(null, [
    m.call(helpers.reserve, [m.local.get(0, i32)], wasm.none),
    m.global.set(lengthGlobal(name), m.local.get(0, i32)),
  ]));
  return helpers;
}
