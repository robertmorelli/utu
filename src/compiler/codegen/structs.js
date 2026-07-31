// codegen/structs.js — WasmGC struct.new/get/set + ref.null
//
// One file owns the entire struct path so expr.js stays a dispatcher.
// Public API:
//   emitStructInit(node, ctx)    — `T1 { f: v, ... }`         → struct.new
//   emitFieldGet  (node, ctx)    — `expr.field`                → struct.get
//   emitFieldSet  (assign, ctx)  — `expr.field = value`        → struct.set
//   emitNullRef   (node, ctx)    — `T.null`                    → ref.null T
//
// Recursive expression emission is injected by expr.js, keeping this module a
// leaf in the codegen dependency graph.

import { binaryen } from './types.js';

// ── Emit helpers ─────────────────────────────────────────────────────────────

/**
 * `T1 { field: expr, ... }` and `&{ field: expr, ... }` (after
 * the type graph has filled in the type-name attribute).
 *
 * Re-orders field-init children by declared field index so that source order
 * doesn't have to match wasm slot order.
 */
export function emitStructInit(node, ctx, emitExpr) {
  if (ctx.requirements) ctx.requirements.conservativeSweep = true;
  const typeName = ctx.typeOf(node) ?? node.getAttribute('type-name');
  if (!typeName) throw new Error('codegen: ir-struct-init has no type');
  const info = ctx.structTypes.get(typeName);
  if (!info) throw new Error(`codegen: ir-struct-init type "${typeName}" is not a registered heap type`);

  // name → emitted operand
  const provided = new Map();
  for (const fi of node.children) {
    if (fi.localName !== 'ir-field-init') continue;
    const fname = fi.getAttribute('field');
    if (!fname) throw new Error('codegen: ir-field-init missing field name');
    provided.set(fname, emitExpr(fi.children[0], ctx));
  }

  const operands = [];
  for (const [fname] of info.fieldIndex) {
    if (fname === '__tag') {
      if (info.tagValue == null) throw new Error(`codegen: synthetic tag missing for ${typeName}`);
      operands.push(emitTagConst(ctx, info.tagType ?? 'I32', info.tagValue));
      continue;
    }
    const e = provided.get(fname);
    if (e === undefined) {
      throw new Error(`codegen: struct ${typeName} init missing field "${fname}"`);
    }
    operands.push(e);
  }

  return ctx.module.struct.new(operands, info.heapType);
}

function emitTagConst(ctx, tagType, tagValue) {
  const ns = ctx.scalarNamespaceOf(tagType);
  if (ns === 'i32') return ctx.module.i32.const(tagValue);
  if (ns === 'i64') return ctx.module.i64.const(BigInt(tagValue));
  throw new Error(`codegen: enum tag type "${tagType}" must be an integer scalar`);
}

/**
 * `expr.field` — read.
 * Receiver type comes from `data-type-name` (stamped by the type graph
 * before operator lowering, so binary ops over fields work too).
 */
export function emitFieldGet(node, ctx, emitExpr) {
  if (ctx.requirements) ctx.requirements.conservativeSweep = true;
  const recv = node.children[0];
  if (!recv) throw new Error('codegen: ir-field-access has no receiver');
  const recvType = ctx.typeOf(recv);
  if (!recvType) throw new Error('codegen: ir-field-access receiver has no data-type-name');

  // `?Foo.x` reads from a non-null ref at runtime — null check is the
  // caller's responsibility (promote handles it; here we trust the static
  // type system once promote/orelse have unwrapped).
  const structName = recvType.startsWith('?') ? recvType.slice(1) : recvType;
  const info = ctx.structTypes.get(structName);
  if (!info) throw new Error(`codegen: ir-field-access on unknown struct "${structName}"`);

  const fieldName = node.getAttribute('field');
  if (info.decl?.localName === 'ir-proto') {
    return emitProtocolFieldGet(node, recv, structName, fieldName, ctx, emitExpr);
  }
  const field = resolvedField(node, info, ctx);
  if (!field) throw new Error(`codegen: struct ${structName} has no field "${fieldName}"`);

  let recvExpr = emitExpr(recv, ctx);
  if (!recvType.startsWith('?')) {
    recvExpr = ctx.module.ref.cast(recvExpr, info.refType);
  }

  return ctx.module.struct.get(
    field.index,
    recvExpr,
    field.binaryenType,
    /*signed=*/false,
  );
}

/**
 * `expr.field = value` — write.
 * Called from emitAssign in expr.js when the LHS is an ir-field-access.
 * The wasm `struct.set` op is a statement (no result), so callers should
 * treat this as a void expression.
 */
export function emitFieldSet(assignNode, ctx, emitExpr) {
  if (ctx.requirements) ctx.requirements.conservativeSweep = true;
  const lhs = assignNode.children[0];
  const rhs = assignNode.children[1];
  if (!lhs || !rhs) throw new Error('codegen: ir-assign field-set missing lhs/rhs');

  const recv = lhs.children[0];
  const recvType = ctx.typeOf(recv);
  if (!recvType) throw new Error('codegen: ir-field-access receiver has no data-type-name');

  const structName = recvType.startsWith('?') ? recvType.slice(1) : recvType;
  const info = ctx.structTypes.get(structName);
  if (!info) throw new Error(`codegen: field-set on unknown struct "${structName}"`);

  const fieldName = lhs.getAttribute('field');
  if (info.decl?.localName === 'ir-proto') {
    return emitProtocolFieldSet(lhs, rhs, recv, structName, fieldName, ctx, emitExpr);
  }
  const field = resolvedField(lhs, info, ctx);
  if (!field) throw new Error(`codegen: struct ${structName} has no field "${fieldName}"`);

  let recvExpr = emitExpr(recv, ctx);
  if (!recvType.startsWith('?')) {
    recvExpr = ctx.module.ref.cast(recvExpr, info.refType);
  }

  return ctx.module.struct.set(
    field.index,
    recvExpr,
    emitExpr(rhs, ctx),
  );
}

/**
 * `T.null` — emit a typed null reference.
 * Binaryen's `ref.null` expects a *nullable ref type*, not a heap type, so
 * we hand it the registry's `nullableRefType`. Throws for unknown types
 * (string/array null support arrives when those types are registered too).
 */
function emitProtocolFieldGet(node, recv, protocol, fieldName, ctx, emitExpr) {
  const m = ctx.module;
  const receiverType = ctx.toType(protocol);
  const receiverSlot = ctx.addLocal(protocol);
  const resultType = ctx.toType(ctx.typeOf(node));
  const getReceiver = () => m.local.get(receiverSlot, receiverType);
  let dispatch = m.unreachable();
  const implementations = protocolFieldImplementations(ctx, protocol, fieldName);
  if (!implementations.length) throw new Error(`codegen: protocol ${protocol}.${fieldName} has no field implementations`);
  for (const { info, field } of implementations.reverse()) {
    const concrete = info.refType;
    const value = m.struct.get(field.index, m.ref.cast(getReceiver(), concrete), field.binaryenType, false);
    dispatch = m.if(m.ref.test(getReceiver(), concrete), value, dispatch);
  }
  return m.block(null, [m.local.set(receiverSlot, emitExpr(recv, ctx)), dispatch], resultType);
}

function emitProtocolFieldSet(lhs, rhs, recv, protocol, fieldName, ctx, emitExpr) {
  const m = ctx.module;
  const receiverType = ctx.toType(protocol);
  const receiverSlot = ctx.addLocal(protocol);
  const valueTypeName = ctx.typeOf(rhs);
  const valueType = ctx.toType(valueTypeName);
  const valueSlot = ctx.addLocal(valueTypeName);
  const getReceiver = () => m.local.get(receiverSlot, receiverType);
  let dispatch = m.unreachable();
  const implementations = protocolFieldImplementations(ctx, protocol, fieldName);
  if (!implementations.length) throw new Error(`codegen: protocol ${protocol}.${fieldName} has no field implementations`);
  for (const { info, field } of implementations.reverse()) {
    const concrete = info.refType;
    const set = m.struct.set(field.index, m.ref.cast(getReceiver(), concrete), m.local.get(valueSlot, valueType));
    dispatch = m.if(m.ref.test(getReceiver(), concrete), set, dispatch);
  }
  return m.block(null, [
    m.local.set(receiverSlot, emitExpr(recv, ctx)),
    m.local.set(valueSlot, emitExpr(rhs, ctx)),
    dispatch,
  ], binaryen.none);
}

function protocolFieldImplementations(ctx, protocol, fieldName) {
  const out = [];
  for (const info of ctx.structTypes.values()) {
    if (info.decl?.localName !== 'ir-struct' && info.decl?.localName !== 'ir-variant') continue;
    const declaration = info.decl.localName === 'ir-variant' ? info.decl.parentElement : info.decl;
    const protocols = (declaration.querySelector(':scope > ir-impl-list')?.getAttribute('impls') ?? '')
      .split(',').map(name => name.trim()).filter(Boolean);
    const field = info.fieldIndex?.get(fieldName);
    if (protocols.includes(protocol) && field) out.push({ info, field });
  }
  return out;
}

function resolvedField(node, info, ctx = null) {
  const canonical = ctx?.fieldOf(node);
  if (canonical && Number.isInteger(canonical.index)) {
    for (const field of info.fieldIndex.values()) if (field.index === canonical.index) return field;
  }
  const index = Number(node.dataset.fieldIndex);
  if (Number.isInteger(index)) {
    for (const field of info.fieldIndex.values()) if (field.index === index) return field;
  }
  return info.fieldIndex.get(node.getAttribute('field'));
}

export function emitNullRef(node, ctx) {
  if (ctx.requirements) ctx.requirements.conservativeSweep = true;
  const typeName = node.getAttribute('type-name');
  if (!typeName) throw new Error('codegen: ir-null-ref missing type-name attribute');
  const info = ctx.structTypes.get(typeName);
  if (!info) throw new Error(`codegen: ir-null-ref type "${typeName}" is not a registered struct`);
  return ctx.module.ref.null(info.nullableRefType);
}
