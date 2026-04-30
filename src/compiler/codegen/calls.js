// codegen/calls.js — function calls, intrinsic wrappers, and orelse

import {
  describeIntrinsicWrapper,
  emitIntrinsic,
  emitWrapperBody,
  matchScalarIntrinsic,
} from './intrinsics.js';

// ── Calls ─────────────────────────────────────────────────────────────────────

export function emitCall(node, ctx, emitExpr) {
  const fn = resolveCallTarget(node, ctx);
  if (!fn) throw new Error('codegen: ir-call has unresolved target');

  const callee = node.firstElementChild;
  const argList = node.querySelector(':scope > ir-arg-list');
  const argNodes = argList ? [...argList.children] : [...node.children].slice(1);
  const callArgNodes = callee?.localName === 'ir-field-access' && node.dataset.resolvedAs !== 'static-method'
    ? [callee.firstElementChild, ...argNodes]
    : argNodes;

  const intr = describeIntrinsicWrapper(fn, ctx.scalarKinds);
  if (intr) {
    // Flat wrapper: body is a single scalar-intrinsic tag whose children are
    // param placeholders (e.g. `<ir-i32-add><ir-ident a/><ir-ident b/>`).
    // We can emit it directly with the evaluated arg exprs — no template
    // substitution needed.
    const flat = isFlatScalarWrapper(intr, ctx.scalarKinds);
    const prev = ctx.currentCall;
    ctx.currentCall = node;
    try {
      if (flat) return emitIntrinsic(intr.op, callArgNodes, ctx, emitExpr);
      // Tree-shaped wrapper: body has real wasm ops combined with literals
      // and placeholders (e.g. neg = <ir-i32-sub><ir-lit 0/><ir-ident a/>).
      // Walk the body via `emitExpr` with the param→callArg substitution
      // map in scope so `<ir-ident a/>` resolves to the caller's expression.
      return emitWrapperBody(intr, callArgNodes, ctx, emitExpr);
    } finally {
      ctx.currentCall = prev;
    }
  }

  const argExprs = callArgNodes.map(a => emitExpr(a, ctx));
  const retType = ctx.toType(node.dataset.type ?? 'void');
  return ctx.module.call(fn.getAttribute('name'), argExprs, retType);
}

// A "flat" wrapper body is a single scalar-intrinsic tag whose direct
// children are all `<ir-ident>` placeholders naming the wrapper's params.
// For these we can bypass the template substitution machinery.
function isFlatScalarWrapper(intr, scalarKinds) {
  const op = intr.op;
  if (!matchScalarIntrinsic(op.localName, scalarKinds)) return false;
  for (const child of op.children) {
    if (child.localName !== 'ir-ident') return false;
    if (!intr.params.includes(child.getAttribute('name'))) return false;
  }
  return true;
}

// data-fn-id is stamped by resolve-methods (instance/static calls).  Free-fn
// calls keep an ir-ident callee whose data-binding-id points to the ir-fn or
// ir-extern-fn.
function resolveCallTarget(call, ctx) {
  const fnId = call.dataset.fnId;
  if (fnId) return ctx.fnById.get(fnId) ?? null;
  const callee = call.children[0];
  if (callee?.localName === 'ir-ident' && callee.dataset.bindingId) {
    return ctx.fnById.get(callee.dataset.bindingId) ?? null;
  }
  return null;
}

export function emitOrElse(node, ctx, emitExpr) {
  const [expr, fallback] = [...node.children];
  if (!expr || !fallback) throw new Error('codegen: ir-else missing expr/fallback');

  const exprType = expr.dataset.type ?? '';
  if (!exprType.startsWith('?')) return emitExpr(expr, ctx);

  const m = ctx.module;
  const resultType = ctx.toType(node.dataset.type ?? exprType.slice(1));
  const slot = ctx.addLocal(exprType);
  const init = m.local.set(slot, emitExpr(expr, ctx));
  const get = () => m.local.get(slot, ctx.toType(exprType));

  return m.block(
    null,
    [
      init,
      m.if(
        m.ref.is_null(get()),
        emitExpr(fallback, ctx),
        m.ref.as_non_null(get()),
      ),
    ],
    resultType,
  );
}
