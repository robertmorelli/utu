// codegen/bindings.js — locals, blocks, lets, and assignments

import { binaryen } from './types.js';
import { nextLabel } from './labels.js';
import { emitFieldSet } from './structs.js';
import { emitFunRef } from './closures.js';
import { paramsOf, selfParamOf } from '../ir-helpers.js';
import { callableParts } from '../type-rules.js';
import { isVoidStatement } from '../ir-tags.js';

// ── Bindings ──────────────────────────────────────────────────────────────────

export function emitIdent(node, ctx, emitExpr) {
  // Inside an inlined intrinsic wrapper body, identifiers that name one of
  // the wrapper's params are template placeholders — substitute the call
  // arg that was bound at the call site and evaluate it in the OUTER ctx
  // so it resolves against the caller's scope, not the wrapper's.
  const name = node.getAttribute('name');
  if (ctx.intrinsicArgs?.has(name)) {
    const argNode = ctx.intrinsicArgs.get(name);
    return emitExpr(argNode, ctx.outerCtx ?? ctx);
  }

  const bid = ctx.bindingIdOf(node);
  if (!bid) throw new Error(`codegen: ir-ident "${name}" has no binding`);
  const decl = ctx.fnById?.get(bid);
  // A named function in value position is a function reference.  Checked
  // before the zero-arg case below, so a `fun() R` value is not mistaken for a
  // call to an `@es` value import.
  if (decl && callableParts(ctx.typeOf(node))?.kind === 'fun') {
    return emitFunRef(decl, ctx);
  }
  if (decl && noParams(decl)) {
    return ctx.module.call(decl.getAttribute('name'), [], ctx.toType(ctx.typeOf(node) ?? 'void'));
  }
  const slot = ctx.locals.get(`${bid}:${name}`) ?? ctx.locals.get(bid);
  if (slot) return ctx.module.local.get(slot.index, slot.type);
  const global = ctx.globals?.get(bid);
  if (global) return ctx.module.global.get(global.name, global.type);
  throw new Error(`codegen: ir-ident "${name}" has no local or global slot`);
}

function noParams(fn) {
  return paramsOf(fn).length === 0 && !selfParamOf(fn);
}

// ── Blocks & statements ──────────────────────────────────────────────────────

export function emitBlock(node, ctx, emitExpr) {
  const stmts = [...node.children];
  if (stmts.length === 0) return ctx.module.nop();

  const inferredType = ctx.typeOf(node);
  const expectedType = ctx.expectedOf(node)
    ?? (inferredType === 'null' ? ctx.expectedOf(node.lastElementChild) : null);
  const blockType = inferredType === 'null' || expectedType === 'void' ? expectedType : inferredType;
  const valueType = blockType && blockType !== 'void'
    ? ctx.toType(blockType)
    : binaryen.none;

  // A compiler-generated block may be the target of breaks (generators). It
  // joins the loop stack as a break-only target that plain break/continue skip.
  const breakLabel = node.attr('data-break-label');
  // Unique per emission: unrolled loops emit the same block more than once.
  const target = breakLabel ? `__block_${breakLabel}_${nextLabel(ctx)}` : null;
  if (breakLabel) (ctx.loops ??= []).push({ brk: target, label: breakLabel, block: true });
  // `defer` registers code for every exit of this block; see emitDeferred.
  const frame = { deferred: [], loopDepth: ctx.loops?.length ?? 0 };
  (ctx.defers ??= []).push(frame);
  const exprs = [];
  try {
    for (let i = 0; i < stmts.length; i++) {
      const child = stmts[i];
      if (child.localName === 'ir-defer') {
        if (child.firstElementChild) frame.deferred.push(child.firstElementChild);
        continue;
      }
      const isLast = i === stmts.length - 1;
      const e = emitExpr(child, ctx);
      const childType = ctx.typeOf(child);
      const childIsVoid = isVoidStatement(child) || !childType || childType === 'void';
      // Discard non-tail results (and a tail result in a void block) so the
      // block stays well-typed.
      const keep = isLast ? valueType !== binaryen.none || childIsVoid : childIsVoid;
      exprs.push(keep ? e : ctx.module.drop(e));
    }
    if (frame.deferred.length) {
      // Falling off the end runs this block's deferred code after its value.
      if (valueType !== binaryen.none && exprs.length) {
        const slot = ctx.addLocal(blockType);
        exprs.push(ctx.module.local.set(slot, exprs.pop()), ...emitDeferred(ctx, [frame], emitExpr), ctx.module.local.get(slot, valueType));
      } else {
        exprs.push(...emitDeferred(ctx, [frame], emitExpr));
      }
    }
  } finally {
    ctx.defers.pop();
    if (breakLabel) ctx.loops.pop();
  }
  if (!exprs.length && !target) return ctx.module.nop();
  return ctx.module.block(target, exprs, valueType);
}

/**
 * Statements for the deferred code of `frames`, innermost frame first and,
 * within a frame, last-registered first. Values are discarded.
 */
export function emitDeferred(ctx, frames, emitExpr) {
  const out = [];
  for (const frame of [...frames].reverse()) {
    for (const node of [...frame.deferred].reverse()) {
      const expr = emitExpr(node, ctx);
      const type = binaryen.getExpressionType(expr);
      out.push(type === binaryen.none || type === binaryen.unreachable ? expr : ctx.module.drop(expr));
    }
  }
  return out;
}

export function emitLet(node, ctx, emitExpr) {
  const init = node.children[node.children.length - 1];
  const typeStr = ctx.typeOf(node) ?? ctx.typeOf(init) ?? 'void';
  const initExpr = emitExpr(init, ctx);
  const idx = ctx.addLocal(typeStr);
  ctx.locals.set(node.id, { index: idx, type: ctx.toType(typeStr) });
  return ctx.module.local.set(idx, initExpr);
}

export function emitAssign(node, ctx, emitExpr) {
  const [lhs, rhs] = [...node.children];
  if (!lhs || !rhs) throw new Error('codegen: ir-assign missing lhs/rhs');

  // Field write: `expr.field = value` → struct.set (statement; void result).
  // Index/slice writes are already desugared to T.set_index calls by
  // lowerOperators, so they hit the ir-call path — not this branch.
  if (lhs.localName === 'ir-field-access') {
    return emitFieldSet(node, ctx, emitExpr);
  }

  if (lhs.localName !== 'ir-ident') {
    throw new Error(`codegen: assignment to <${lhs.localName}> not supported`);
  }
  const bindingId = ctx.bindingIdOf(lhs);
  const slot = ctx.locals.get(bindingId);
  if (slot) return ctx.module.local.set(slot.index, emitExpr(rhs, ctx));
  const global = ctx.globals?.get(bindingId);
  if (global) return ctx.module.global.set(global.name, emitExpr(rhs, ctx));
  throw new Error(`codegen: assign to unknown binding "${lhs.getAttribute('name')}"`);
}

export function emitRefTest(node, ctx, emitExpr) {
  const inner = node.firstElementChild;
  const typeName = node.getAttribute('type-name');
  if (!inner || !typeName) throw new Error('codegen: ir-ref-test missing expr or type');
  return ctx.module.ref.test(emitExpr(inner, ctx), ctx.toType(typeName));
}

export function emitRefCast(node, ctx, emitExpr) {
  const inner = node.firstElementChild;
  const typeName = node.getAttribute('type-name');
  if (!inner || !typeName) throw new Error('codegen: ir-ref-cast missing expr or type');
  return ctx.module.ref.cast(emitExpr(inner, ctx), ctx.toType(typeName));
}

export function emitRefIsNull(node, ctx, emitExpr) {
  const inner = node.firstElementChild;
  if (!inner) throw new Error('codegen: ir-ref-is-null missing expr');
  return ctx.module.ref.is_null(emitExpr(inner, ctx));
}
