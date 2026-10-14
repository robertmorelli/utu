// codegen/memories.js — `mem` declarations: one wasm linear memory each;
// `vec` declarations: one WasmGC array each.
//
// Each mem gets its own memory (multi-memory), a mutable i32 global holding
// its length, and on first use small helpers for push/reserve/resize. Element
// i lives at byte i << shift, so a read is one load with no base pointer and
// no explicit bounds check (the engine's guard pages bound the memory).
//
// A vec is a mutable global holding its array, and the same length global
// and helpers. Element i is array[i]; the array's length is its capacity,
// which starts at its initial contents' count and at least doubles as it
// grows. Wasm bounds-checks every access against that capacity.
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

// A vec's array element, by storage kind: bytes and halves packed.
const ELEMENTS = { U8: 'i8', I8: 'i8', U16: 'i16', I16: 'i16', I32: 'i32', U32: 'i32', I64: 'i64', U64: 'i64', F32: 'f32', F64: 'f64' };

/** `(array (mut T))` for a vec of storage `kind`. */
function vecHeapType(kind) {
  const element = ELEMENTS[kind];
  const packed = element === 'i8' || element === 'i16';
  const builder = new wasm.TypeBuilder(1);
  builder.setArrayType(0, packed ? wasm.i32 : wasm[element], packed ? wasm[element] : wasm.notPacked, true);
  return builder.buildAndDispose()[0];
}

function arrayGlobal(name) {
  return `__vec_${name}`;
}

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
  for (const { name, export: exported, host, data } of mems.filter(mem => !mem.vec)) {
    m.addMemory({
      name, initial: initialPages(data), maximum: MAX_PAGES, exported: Boolean(exported),
      import: host ? { module: 'utu', base: `mem_${name}` } : null,
    });
  }
  // An initialized mem is filled by an active data segment at instantiation.
  for (const { name, data } of mems.filter(mem => !mem.vec)) if (data) m.addDataSegment(name, 0, base64Bytes(data));
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
  for (const { name, host, count = 0, vec, kind, data } of mems) {
    m.addGlobal(lengthGlobal(name), wasm.i32, true, m.i32.const(count));
    if (vec) {
      // Its array, as long as its initial contents, which a passive data
      // segment fills when the module starts.
      const heapType = vecHeapType(kind);
      m.addGlobal(arrayGlobal(name), wasm.getTypeFromHeapType(heapType, false), true, m.array.new_default(heapType, m.i32.const(count)));
      if (data) m.addArrayInit(arrayGlobal(name), heapType, m.addDataSegment(null, 0, base64Bytes(data)), count);
      continue;
    }
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
  if (opNode.getAttribute('vec') === 'true') return emitVecIntrinsic(opNode, args, ctx, name, opNode.getAttribute('kind'));
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

/** One <ir-mem-*> op on a vec. */
function emitVecIntrinsic(opNode, args, ctx, name, kindName) {
  const m = ctx.module;
  const heapType = vecHeapType(kindName);
  const array = () => m.global.get(arrayGlobal(name), wasm.getTypeFromHeapType(heapType, false));
  const signed = kindName === 'I8' || kindName === 'I16';
  switch (opNode.localName) {
    case 'ir-mem-get': return afterOperands(ctx, args, ops => m.array.get(array(), ops[0], wasm[ELEMENTS[kindName]] ?? wasm.i32, signed));
    case 'ir-mem-set': return afterOperands(ctx, args, ops => m.array.set(array(), ops[0], ops[1]));
    case 'ir-mem-len': return m.global.get(lengthGlobal(name), wasm.i32);
    case 'ir-mem-cap': return m.array.len(array());
    case 'ir-mem-clear': return m.global.set(lengthGlobal(name), m.i32.const(0));
    case 'ir-mem-push': return m.call(ensureVecHelpers(ctx, name, kindName, heapType).push, args, wasm.none);
    case 'ir-mem-reserve': return m.call(ensureVecHelpers(ctx, name, kindName, heapType).reserve, args, wasm.none);
    case 'ir-mem-resize': return m.call(ensureVecHelpers(ctx, name, kindName, heapType).resize, args, wasm.none);
    default: throw new Error(`codegen: no vec intrinsic <${opNode.localName}>`);
  }
}

// An access to a vec's array with these operands, the array read after
// them, as when the wrapper is called with them: a call in one may push to
// the vec, and so replace its array. With no call the array goes first;
// else the operands are kept in locals first.
function afterOperands(ctx, args, access) {
  const m = ctx.module;
  const calls = e => e.op === 'call' || e.op === 'call_ref' || e.kids.some(calls);
  if (!args.some(calls) || args.some(arg => arg.type === wasm.unreachable)) return access(args);
  const slots = args.map(arg => ctx.addLocal(arg.type));
  return m.block(null, [
    ...args.map((arg, i) => m.local.set(slots[i], arg)),
    access(args.map((arg, i) => m.local.get(slots[i], arg.type))),
  ]);
}

/** push, reserve, and resize for one vec, added once per module. */
function ensureVecHelpers(ctx, name, kindName, heapType) {
  const m = ctx.module;
  if (!HELPERS.has(m)) HELPERS.set(m, new Map());
  const added = HELPERS.get(m);
  if (added.has(name)) return added.get(name);
  const i32 = wasm.i32;
  const refType = wasm.getTypeFromHeapType(heapType, false);
  const nullable = wasm.getTypeFromHeapType(heapType, true);
  const array = () => m.global.get(arrayGlobal(name), refType);
  const helpers = { reserve: `__vec_reserve_${name}`, push: `__vec_push_${name}`, resize: `__vec_resize_${name}` };
  added.set(name, helpers);

  // reserve(n): when n is more than the capacity, a new array of the larger
  // of n and twice the capacity, with the elements copied into it.
  m.addFunction(helpers.reserve, i32, wasm.none, [i32, nullable], m.block(null, [
    m.local.set(1, m.array.len(array())),
    m.if(m.i32.gt_u(m.local.get(0, i32), m.local.get(1, i32)), m.block(null, [
      m.local.set(2, m.array.new_default(heapType, m.select(
        m.i32.gt_u(m.local.get(0, i32), m.i32.shl(m.local.get(1, i32), m.i32.const(1))),
        m.local.get(0, i32),
        m.i32.shl(m.local.get(1, i32), m.i32.const(1)),
      ))),
      m.array.copy(m.local.get(2, nullable), m.i32.const(0), array(), m.i32.const(0), m.local.get(1, i32)),
      m.global.set(arrayGlobal(name), m.ref.as_non_null(m.local.get(2, nullable))),
    ])),
  ]));

  // push(v): reserve one more when full, store at len, then len += 1.
  const valueType = wasm[KINDS[kindName].type];
  m.addFunction(helpers.push, valueType, wasm.none, [i32], m.block(null, [
    m.local.set(1, m.global.get(lengthGlobal(name), i32)),
    m.if(m.i32.ge_u(m.local.get(1, i32), m.array.len(array())),
      m.call(helpers.reserve, [m.i32.add(m.local.get(1, i32), m.i32.const(1))], wasm.none)),
    m.array.set(array(), m.local.get(1, i32), m.local.get(0, valueType)),
    m.global.set(lengthGlobal(name), m.i32.add(m.local.get(1, i32), m.i32.const(1))),
  ]));

  // resize(n): reserve(n), then len = n. Elements keep whatever they held.
  m.addFunction(helpers.resize, i32, wasm.none, [], m.block(null, [
    m.call(helpers.reserve, [m.local.get(0, i32)], wasm.none),
    m.global.set(lengthGlobal(name), m.local.get(0, i32)),
  ]));
  return helpers;
}
