// codegen/structs.js — WasmGC struct.new/get/set + ref.null
//
// One file owns the entire struct path so expr.js stays a dispatcher.
// Public API:
//   emitStructInit(node, ctx)    — `T1 { f: v, ... }`         → struct.new
//   emitFieldGet  (node, ctx)    — `expr.field`                → struct.get
//   emitFieldSet  (assign, ctx)  — `expr.field = value`        → struct.set
//   emitNullRef   (node, ctx)    — `T.null`                    → ref.null T
//
// emit* helpers re-import emitExpr from ./expr.js when they need to recurse —
// that pulls expr.js back in for the recursion edge but keeps structs.js fully
// self-contained for the struct-shaped IR nodes.

import { binaryen } from './types.js';
import { emitExpr } from './expr.js';

// ── Emit helpers ─────────────────────────────────────────────────────────────

/**
 * `T1 { field: expr, ... }` and `&{ field: expr, ... }` (after
 * lower-implicit-struct-init has filled in the type attribute).
 *
 * Re-orders field-init children by declared field index so that source order
 * doesn't have to match wasm slot order.
 */
export function emitStructInit(node, ctx) {
  const typeName = node.dataset.type ?? node.getAttribute('type');
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
      operands.push(emitTagConst(ctx, info.tagType ?? 'i32', info.tagValue));
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
  if (ns === 'i64') return ctx.module.i64.const(tagValue, 0);
  throw new Error(`codegen: enum tag type "${tagType}" must be an integer scalar`);
}

/**
 * `expr.field` — read.
 * Receiver type comes from `data-type` (stamped by stampFieldAccessTypes
 * before operator lowering, so binary ops over fields work too).
 */
export function emitFieldGet(node, ctx) {
  const recv = node.children[0];
  if (!recv) throw new Error('codegen: ir-field-access has no receiver');
  const recvType = recv.dataset.type;
  if (!recvType) throw new Error('codegen: ir-field-access receiver has no data-type');

  // `?Foo.x` reads from a non-null ref at runtime — null check is the
  // caller's responsibility (promote handles it; here we trust the static
  // type system once promote/orelse have unwrapped).
  const structName = recvType.startsWith('?') ? recvType.slice(1) : recvType;
  const info = ctx.structTypes.get(structName);
  if (!info) throw new Error(`codegen: ir-field-access on unknown struct "${structName}"`);

  const fieldName = node.getAttribute('field');
  const field = info.fieldIndex.get(fieldName);
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
export function emitFieldSet(assignNode, ctx) {
  const lhs = assignNode.children[0];
  const rhs = assignNode.children[1];
  if (!lhs || !rhs) throw new Error('codegen: ir-assign field-set missing lhs/rhs');

  const recv = lhs.children[0];
  const recvType = recv?.dataset.type;
  if (!recvType) throw new Error('codegen: ir-field-access receiver has no data-type');

  const structName = recvType.startsWith('?') ? recvType.slice(1) : recvType;
  const info = ctx.structTypes.get(structName);
  if (!info) throw new Error(`codegen: field-set on unknown struct "${structName}"`);

  const fieldName = lhs.getAttribute('field');
  const field = info.fieldIndex.get(fieldName);
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
export function emitNullRef(node, ctx) {
  const typeName = node.getAttribute('type');
  if (!typeName) throw new Error('codegen: ir-null-ref missing type attribute');
  const info = ctx.structTypes.get(typeName);
  if (!info) throw new Error(`codegen: ir-null-ref type "${typeName}" is not a registered struct`);
  return ctx.module.ref.null(info.nullableRefType);
}
