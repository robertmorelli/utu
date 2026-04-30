// codegen/bindings.js — locals, blocks, lets, and assignments

import { binaryen } from './types.js';
import { emitNullLiteral, isNullLiteral } from './null-literals.js';
import { emitFieldSet } from './structs.js';
import { firstTypeChild, typeNodeToStr } from '../ir-helpers.js';

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

  const bid = node.dataset.bindingId;
  if (!bid) throw new Error(`codegen: ir-ident "${name}" has no binding`);
  const decl = ctx.fnById?.get(bid);
  if (decl && noParams(decl)) {
    return ctx.module.call(decl.getAttribute('name'), [], ctx.toType(node.dataset.type ?? 'void'));
  }
  const slot = ctx.locals.get(bid);
  if (!slot) throw new Error(`codegen: ir-ident "${name}" has no local slot`);
  return ctx.module.local.get(slot.index, slot.type);
}

function noParams(fn) {
  return fn.querySelectorAll(':scope > ir-param-list > ir-param').length === 0 && !fn.querySelector(':scope > ir-self-param');
}

// ── Blocks & statements ──────────────────────────────────────────────────────

export function emitBlock(node, ctx, emitExpr) {
  const stmts = [...node.children];
  if (stmts.length === 0) return ctx.module.nop();

  // Last statement is the block's value if the block is non-void.
  // Fall back to the actual last child's type if the block's own data-type
  // is stale: inferTypes can leave the block untyped when its tail expression
  // depends on field accesses (typed by stampFieldAccessTypes later) or on
  // ir-call nodes synthesised by lowerOperators (typed by resolveMethods later).
  const blockType = node.dataset.type
    || node.children[node.children.length - 1]?.dataset.type;
  const valueType = blockType && blockType !== 'void'
    ? ctx.toType(blockType)
    : binaryen.none;

  const exprs = [];
  for (let i = 0; i < stmts.length; i++) {
    const child = stmts[i];
    const isLast = i === stmts.length - 1;
    const e = isLast && isNullLiteral(child) && blockType?.startsWith('?')
      ? emitNullLiteral(child, ctx, blockType)
      : emitExpr(child, ctx);
    if (isLast || isVoidStmt(child)) {
      exprs.push(e);
    } else {
      // Discard non-tail expression result so the block stays well-typed.
      exprs.push(ctx.module.drop(e));
    }
  }
  return ctx.module.block(null, exprs, valueType);
}

function isVoidStmt(node) {
  const t = node.localName;
  return t === 'ir-let' || t === 'ir-assign' || t === 'ir-while' ||
         t === 'ir-for' || t === 'ir-return' || t === 'ir-break' ||
         t === 'ir-assert' || t === 'ir-fatal';
}

export function emitLet(node, ctx, emitExpr) {
  const init = node.children[node.children.length - 1];
  const typeStr = readDeclaredType(node) ?? init.dataset.type ?? 'void';
  const initExpr = isNullLiteral(init) && typeStr.startsWith('?')
    ? emitNullLiteral(init, ctx, typeStr)
    : emitExpr(init, ctx);
  const idx = ctx.addLocal(typeStr);
  ctx.locals.set(node.id, { index: idx, type: ctx.toType(typeStr) });
  return ctx.module.local.set(idx, initExpr);
}

// The declared type annotation, if the let has one (e.g. `let x: i32 = …`).
// Falls back to the canonical reader so all passes agree on the type string.
function readDeclaredType(letNode) {
  return typeNodeToStr(firstTypeChild(letNode));
}


export function emitAssign(node, ctx, emitExpr) {
  const [lhs, rhs] = [...node.children];
  if (!lhs || !rhs) throw new Error('codegen: ir-assign missing lhs/rhs');

  // Field write: `expr.field = value` → struct.set (statement; void result).
  // Index/slice writes are already desugared to T.set_index calls by
  // lowerOperators, so they hit the ir-call path — not this branch.
  if (lhs.localName === 'ir-field-access') {
    return emitFieldSet(node, ctx);
  }

  if (lhs.localName !== 'ir-ident') {
    throw new Error(`codegen: assignment to <${lhs.localName}> not supported`);
  }
  const slot = ctx.locals.get(lhs.dataset.bindingId);
  if (!slot) throw new Error(`codegen: assign to unknown binding "${lhs.getAttribute('name')}"`);
  return ctx.module.local.set(slot.index, emitExpr(rhs, ctx));
}

export function emitRefTest(node, ctx, emitExpr) {
  const inner = node.firstElementChild;
  const typeName = node.getAttribute('type');
  if (!inner || !typeName) throw new Error('codegen: ir-ref-test missing expr or type');
  return ctx.module.ref.test(emitExpr(inner, ctx), ctx.toType(typeName));
}

export function emitRefCast(node, ctx, emitExpr) {
  const inner = node.firstElementChild;
  const typeName = node.getAttribute('type');
  if (!inner || !typeName) throw new Error('codegen: ir-ref-cast missing expr or type');
  return ctx.module.ref.cast(emitExpr(inner, ctx), ctx.toType(typeName));
}

export function emitRefIsNull(node, ctx, emitExpr) {
  const inner = node.firstElementChild;
  if (!inner) throw new Error('codegen: ir-ref-is-null missing expr');
  return ctx.module.ref.is_null(emitExpr(inner, ctx));
}

