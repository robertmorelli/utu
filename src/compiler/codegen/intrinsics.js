// codegen/intrinsics.js — primitive IR ops → binaryen module methods
//
// Every stdlib scalar module wraps a wasm op as a one-statement function.
// Two flavours:
//
//   1. A bare op tag that takes the call's args positionally:
//        fn &:add |a, b| & { @ir/\ <ir-i32-add><ir-ident a/><ir-ident b/></ir-i32-add> \/; }
//      The op tag's children are template placeholders — `<ir-ident>`s that
//      name params get substituted with the call's args at inlining time.
//
//   2. An expression tree that combines real wasm ops to synthesise
//      something the wasm spec doesn't expose directly:
//        fn &:neg |a| & {
//          @ir/\ <ir-i32-sub><ir-lit kind="int" value="0"/><ir-ident a/></ir-i32-sub> \/;
//        }
//      Here `<ir-i32-sub>` is the recognised intrinsic, `<ir-lit>` becomes
//      a constant, and `<ir-ident a>` is substituted with the call arg.
//
// The set of recognised intrinsic tag prefixes is NOT hardcoded: we walk
// every `<ir-wasm-scalar kind="…"/>` declaration in the stdlib at compile
// time and accept `<ir-{kind}-{op}>` as an intrinsic for any such kind
// (see codegen/types.js::collectScalarKinds).  Adding a new scalar width
// is a stdlib change, not a compiler change.
//
// The `(kind → binaryen namespace)` mapping is the one legitimate piece of
// wasm knowledge; it lives in `./types.js::scalarKindToBinaryenNamespace`
// alongside `scalarKindToBinaryenType`.  This file never invents its own
// scalar list and never second-guesses the registry.
//
// Reference / i31 / v128 / string ops are not yet supported; they throw.

import { scalarKindToBinaryenNamespace } from './types.js';
import { emitArrayIntrinsic } from './arrays.js';
import { emitStringIntrinsic } from './strings.js';

const SCALAR_TAG_RE = /^ir-([a-z0-9]+)-(.+)$/;

/**
 * If `localName` is a scalar-intrinsic tag whose kind is known to
 * `scalarKinds`, return `{ kind, op, namespace }`.  Otherwise null.
 */
export function matchScalarIntrinsic(localName, scalarKinds) {
  const match = SCALAR_TAG_RE.exec(localName);
  if (!match) return null;
  const kind = match[1];
  if (!scalarKinds.has(kind)) return null;
  const namespace = scalarKindToBinaryenNamespace(kind);
  if (!namespace) return null;
  return { kind, op: match[2].replace(/-/g, '_'), namespace };
}

// Reference ops that are syntactically valid wrapper bodies but not yet
// emitted by codegen.  Kept here so `isIntrinsicOp` recognises them as
// wrappers and the caller produces a clear "not yet" error instead of a
// misleading "unhandled IR node" message from the generic dispatcher.
const REF_TAG_PREFIXES = ['ir-i31-', 'ir-ref-', 'ir-string-', 'ir-v128-', 'ir-array-'];

function isRefOp(localName) {
  return REF_TAG_PREFIXES.some((p) => localName.startsWith(p));
}

/**
 * @param {Element}      node           any IR element
 * @param {Set<string>}  scalarKinds    kinds declared by the stdlib
 *                                      (see codegen/types.js::collectScalarKinds)
 * @returns {boolean}                   true if `node` is one of the primitive
 *                                      wasm op tags (scalar intrinsic registered
 *                                      by the stdlib, or a still-unsupported
 *                                      ref op we recognise as a wrapper anyway)
 */
export function isIntrinsicOp(node, scalarKinds) {
  if (!node?.localName) return false;
  if (isRefOp(node.localName)) return true;
  return matchScalarIntrinsic(node.localName, scalarKinds) !== null;
}

/**
 * If `fn` is a one-statement wrapper around a single intrinsic op, return
 * `{ op, params }` describing how to inline a call to it.  Otherwise null.
 *
 *   op     — the body's root IR node (e.g. <ir-i32-add>, or a multi-node
 *            tree for synthesised ops like neg)
 *   params — the wrapper's param names, in source order, used to map each
 *            call arg to the placeholder identifier the body refers to
 *
 * The caller dispatches `op` via `emitWrapperBody` with the param→callArg
 * mapping in scope.
 *
 * @param {Element}     fn
 * @param {Set<string>} scalarKinds
 */
export function describeIntrinsicWrapper(fn, scalarKinds) {
  const block = fn?.querySelector?.(':scope > ir-block');
  if (!block) return null;
  const stmts = [...block.children];
  if (stmts.length !== 1) return null;
  const op = stmts[0];
  if (!isIntrinsicOp(op, scalarKinds)) return null;
  const params = [...fn.querySelectorAll(':scope > ir-param-list > ir-param')]
    .map((p) => p.getAttribute('name'));
  return { op, params };
}

/**
 * Emit a scalar-intrinsic IR tag (e.g. <ir-i32-add>) by recursing into
 * its children and dispatching to the matching binaryen method.  Used by
 * emitExpr for tags inside wrapper bodies (see codegen/expr.js dispatch).
 *
 * @param {Element}  opNode    e.g. <ir-i32-add>
 * @param {object}   ctx       codegen context (module, scalarKinds, …)
 * @param {Function} emitExpr  recursive IR→binaryen emitter
 */
export function emitScalarIntrinsic(opNode, ctx, emitExpr) {
  const intr = matchScalarIntrinsic(opNode.localName, ctx.scalarKinds);
  if (!intr) return null;
  if (intr.kind === 'v128' && intr.op === 'const') return emitV128Const(opNode, ctx.module);
  const argExprs = [...opNode.children].map((c) => emitExpr(c, ctx));
  const space = ctx.module[intr.namespace];
  const fn = space?.[intr.op];
  if (typeof fn !== 'function') {
    throw new Error(
      `codegen: binaryen has no ${intr.namespace}.${intr.op} for tag <${opNode.localName}>`,
    );
  }
  return fn.call(space, ...argExprs);
}

export function emitRefIntrinsic(opNode, ctx, emitExpr) {
  switch (opNode.localName) {
    case 'ir-i31-new': {
      const args = [...opNode.children].map((c) => emitExpr(c, ctx));
      return ctx.module.ref.i31(args[0]);
    }
    case 'ir-i31-get-s': {
      const args = [...opNode.children].map((c) => emitExpr(c, ctx));
      return ctx.module.i31.get_s(args[0]);
    }
    case 'ir-i31-get-u': {
      const args = [...opNode.children].map((c) => emitExpr(c, ctx));
      return ctx.module.i31.get_u(args[0]);
    }
    case 'ir-ref-eq': {
      const args = [...opNode.children].map((c) => emitExpr(c, ctx));
      return ctx.module.ref.eq(args[0], args[1]);
    }
    case 'ir-ref-ne': {
      const args = [...opNode.children].map((c) => emitExpr(c, ctx));
      return ctx.module.i32.eqz(ctx.module.ref.eq(args[0], args[1]));
    }
    default:
      return null;
  }
}

function emitV128Const(opNode, m) {
  const raw = opNode.getAttribute('bytes') ?? '';
  const bytes = raw
    ? raw.split(',').map((part) => Number(part.trim()))
    : Array(16).fill(0);
  if (bytes.length !== 16 || bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) {
    throw new Error(`codegen: <ir-v128-const> bytes must contain 16 byte values`);
  }
  return m.v128.const(bytes);
}

/**
 * Emit the body of an intrinsic wrapper inline, substituting any
 * `<ir-ident name="paramName"/>` references for the matching call arg.
 * Substituted args are evaluated in the OUTER context (the call site's
 * scope), not the inlined-wrapper context — which is what users would
 * write `add(x, foo())` to mean.
 *
 * @param {{op:Element, params:string[]}} intr
 * @param {Element[]} callArgNodes  IR arg nodes from the call site
 * @param {object}    ctx           codegen context at the call site
 * @param {Function}  emitExpr      recursive IR→binaryen emitter
 */
export function emitWrapperBody(intr, callArgNodes, ctx, emitExpr) {
  const argByName = new Map();
  intr.params.forEach((name, i) => {
    if (name && i < callArgNodes.length) argByName.set(name, callArgNodes[i]);
  });
  const innerCtx = { ...ctx, intrinsicArgs: argByName, outerCtx: ctx };
  return emitExpr(intr.op, innerCtx);
}

/**
 * Backwards-compatible single-tag dispatch for callers that already hold
 * an op node and the args separately (e.g. array/string intrinsic stubs).
 *
 * @param {Element}  opNode    e.g. <ir-i32-add>
 * @param {Element[]} argNodes IR arg nodes
 * @param {object}   ctx       codegen context
 * @param {Function} emitExpr  recursive IR→binaryen emitter
 */
export function emitIntrinsic(opNode, argNodes, ctx, emitExpr) {
  const arr = emitArrayIntrinsic(opNode, argNodes, ctx, emitExpr);
  if (arr) return arr;
  const str = emitStringIntrinsic(opNode, argNodes, ctx, emitExpr);
  if (str) return str;

  const intr = matchScalarIntrinsic(opNode.localName, ctx.scalarKinds);
  if (intr) {
    if (intr.kind === 'v128' && intr.op === 'const') return emitV128Const(opNode, ctx.module);
    const argExprs = argNodes.map((node) => emitExpr(node, ctx));
    const space = ctx.module[intr.namespace];
    const fn = space?.[intr.op];
    if (typeof fn !== 'function') {
      throw new Error(
        `codegen: binaryen has no ${intr.namespace}.${intr.op} for tag <${opNode.localName}>`,
      );
    }
    return fn.call(space, ...argExprs);
  }

  if (isRefOp(opNode.localName)) {
    throw new Error(
      `codegen: ref/string/v128 op <${opNode.localName}> not yet implemented`,
    );
  }
  throw new Error(`codegen: no intrinsic builder for <${opNode.localName}>`);
}
