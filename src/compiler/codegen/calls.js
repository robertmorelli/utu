// codegen/calls.js — function calls, intrinsic wrappers, and orelse

import {
  describeIntrinsicWrapper,
  emitIntrinsic,
  emitWrapperBody,
  matchScalarIntrinsic,
} from './intrinsics.js';
import { emitClosureCall, emitFunCall } from './closures.js';
import { callableParts } from '../type-rules.js';
import { typeNodeToStr } from '../ir-helpers.js';

// ── Calls ─────────────────────────────────────────────────────────────────────

export function emitCall(node, ctx, emitExpr) {
  // Calling a callable *value* rather than a named function.  `fun` is a wasm
  // function reference, so the call stays inside wasm via call_ref; `cl` is a
  // JS function, so the call goes out through a per-signature host import.
  const calleeParts = callableParts(ctx.typeOf(node.firstElementChild));
  if (calleeParts) {
    return calleeParts.kind === 'fun'
      ? emitFunCall(node, calleeParts, ctx, emitExpr)
      : emitClosureCall(node, calleeParts, ctx, emitExpr);
  }

  const protocol = ctx.backendPlan?.protocolCalls?.get(node.id);
  if (protocol) return emitProtocolCall(node, protocol, ctx, emitExpr);

  const fn = resolveCallTarget(node, ctx);
  if (!fn) throw new Error('codegen: ir-call has unresolved target');

  const callee = node.firstElementChild;
  const argList = node.querySelector(':scope > ir-arg-list');
  const argNodes = argList ? [...argList.children] : [...node.children].slice(1);
  const resolvedAs = ctx.backendPlan?.types?.slots.get(node)?.resolution?.resolvedAs ?? node.dataset.resolvedAs;
  const callArgNodes = callee?.localName === 'ir-field-access' && resolvedAs !== 'static-method'
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
  const retType = ctx.toType(ctx.typeOf(node) ?? 'void');
  return ctx.module.call(fn.getAttribute('name'), argExprs, retType);
}

function emitProtocolCall(node, protocol, ctx, emitExpr) {
  const m = ctx.module;
  const callee = node.firstElementChild;
  const receiverNode = callee?.firstElementChild;
  if (!receiverNode) throw new Error('codegen: protocol call has no receiver');
  const args = [...(node.querySelector(':scope > ir-arg-list')?.children ?? [])];
  const receiverType = ctx.toType(protocol.protocol);
  const receiverSlot = ctx.addLocal(protocol.protocol);
  const initializers = [m.local.set(receiverSlot, emitExpr(receiverNode, ctx))];
  const cachedArgs = args.map(arg => {
    const typeName = ctx.typeOf(arg);
    if (!typeName) throw new Error('codegen: protocol call argument has no type');
    const type = ctx.toType(typeName);
    const slot = ctx.addLocal(typeName);
    initializers.push(m.local.set(slot, emitExpr(arg, ctx)));
    return { slot, type };
  });
  const implementations = [...new Set(ctx.fnByName.values())].filter(fn => {
    const name = fn.querySelector(':scope > ir-fn-name');
    return name?.getAttribute('receiver') === protocol.protocol
      && name.getAttribute('name') === protocol.member
      && name.querySelector(':scope > ir-type-args')?.firstElementChild;
  });
  if (!implementations.length) throw new Error(`codegen: protocol ${protocol.protocol}.${protocol.member} has no implementations`);

  const resultType = ctx.toType(protocol.result);
  const receiver = () => m.local.get(receiverSlot, receiverType);
  let dispatch = m.unreachable();
  for (const fn of implementations.reverse()) {
    const implementationType = typeNodeToStr(
      fn.querySelector(':scope > ir-fn-name > ir-type-args')?.firstElementChild,
    );
    const concreteType = ctx.toType(implementationType);
    const callArgs = [m.ref.cast(receiver(), concreteType),
      ...cachedArgs.map(arg => m.local.get(arg.slot, arg.type))];
    const call = m.call(fn.getAttribute('name'), callArgs, resultType);
    dispatch = m.if(m.ref.test(receiver(), concreteType), call, dispatch);
  }
  return m.block(null, [...initializers, dispatch], resultType);
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

// data-fn-id is stamped by the type graph (instance/static calls). Free-fn
// calls keep an ir-ident callee whose data-binding-id points to the ir-fn or
// ir-extern-fn.
function resolveCallTarget(call, ctx) {
  const fnId = ctx.callTargetIdOf(call);
  if (fnId) return ctx.fnById.get(fnId) ?? null;
  const callee = call.children[0];
  const bindingId = ctx.bindingIdOf(callee);
  if (callee?.localName === 'ir-ident' && bindingId) {
    return ctx.fnById.get(bindingId) ?? null;
  }
  return null;
}

export function emitOrElse(node, ctx, emitExpr) {
  const [expr, fallback] = [...node.children];
  if (!expr || !fallback) throw new Error('codegen: ir-else missing expr/fallback');

  const exprType = ctx.typeOf(expr) ?? '';
  if (!exprType.startsWith('?')) return emitExpr(expr, ctx);

  const m = ctx.module;
  const resultType = ctx.toType(ctx.typeOf(node) ?? exprType.slice(1));
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
