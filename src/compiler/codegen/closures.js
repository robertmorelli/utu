// codegen/closures.js — function pointers and closures
//
// Two callable representations, and the boundary between them:
//
//   fun(...) R   a real wasm function reference — `(ref $sig)`, produced by
//                ref.func and called with call_ref.  No table, no indirection,
//                no host involvement: a `fun` call never leaves wasm.
//
//   cl(...) R    a real JS function, held as an externref.  Built by the host
//                import `utu.closure_new(fn, env)`, which closes a JS function
//                over the wasm function reference and its environment struct.
//                Called through a per-signature host import, because wasm
//                imports are monomorphic.
//
// The two meet because a funcref crossing into JS arrives as a callable JS
// function, so the host can build the thunk without any table lookup. That is
// what makes every utu closure directly usable as a JS callback, which is the
// whole point of the design — see new_spec2.md.

import { binaryen, declaredTypeStr } from './types.js';
import { callableParts } from '../type-strings.js';
import { closureCallImport } from '../lower-closures.js';
import { unwrapNullable } from '../type-strings.js';
import { paramsOf } from '../ir-helpers.js';

export const CLOSURE_MODULE = 'utu';
export const CLOSURE_NEW = '__utu_closure_new';

/**
 * Memoised builder for `(ref $sig)` types. Each distinct wasm signature needs
 * one heap type; a signature that mentions another callable needs that one
 * built first, which the recursion in `registerCallableTypes` guarantees.
 */
export function createSignatureTypes() {
  const cache = new Map();
  return function signatureRefType(paramTypes, resultType) {
    const key = `${paramTypes.join(',')}->${resultType}`;
    const hit = cache.get(key);
    if (hit != null) return hit;
    const tb = new binaryen.TypeBuilder(1);
    tb.setSignatureType(0, binaryen.createType(paramTypes), resultType);
    const refType = binaryen.getTypeFromHeapType(tb.buildAndDispose()[0], false);
    cache.set(key, refType);
    return refType;
  };
}

/**
 * Register every callable type the program mentions into the codegen type
 * registry, so `makeTypeMapper` resolves them like any other named type.
 *
 * Callable types are structural — they have no declaration to register from —
 * so they are discovered off the stamped `data-type-name` values instead.
 */
export function registerCallableTypes(root, structTypes, toType, signatureRefType) {
  const ensure = (typeStr) => {
    if (!typeStr) return;
    const name = unwrapNullable(typeStr);
    if (structTypes.has(name)) return;
    const parts = callableParts(name);
    if (!parts) return;

    // Components first: `fun(fun(I32) I32) I32` needs the inner signature built
    // before the outer one can reference it.
    for (const param of parts.params) ensure(param);
    ensure(parts.ret);

    if (parts.kind === 'cl') {
      structTypes.set(name, {
        typeName: name, typeRepr: 'wasm-externref',
        refType: binaryen.externref, nullableRefType: binaryen.externref,
      });
      return;
    }
    const refType = signatureRefType(
      parts.params.map(toType),
      parts.ret === 'void' ? binaryen.none : toType(parts.ret),
    );
    structTypes.set(name, {
      typeName: name, typeRepr: 'wasm-funcref',
      refType, nullableRefType: refType,
    });
  };

  for (const node of root.querySelectorAll('[data-type-name]')) ensure(node.dataset['typeName']);
  for (const ref of root.querySelectorAll('ir-type-ref[name]')) ensure(ref.getAttribute('name'));
}

/** Declare the host imports the program uses, before any body that calls them. */
export function installClosureImports(m, root, ctx) {
  const runtime = readRuntimeSpec(root);
  if (runtime.new) {
    // `fn` is a plain funcref so the host can call it directly; `env` is anyref
    // so any environment struct passes through unexamined. A null environment
    // marks a decayed `fun`, which takes no environment argument.
    m.addFunctionImport(
      CLOSURE_NEW, CLOSURE_MODULE, 'closure_new',
      binaryen.createType([binaryen.funcref, binaryen.anyref]), binaryen.externref,
    );
  }
  for (const type of readPromiseSpec(root).awaits ?? []) {
    // (promise: externref) -> T, wrapped host-side in WebAssembly.Suspending.
    m.addFunctionImport(
      `__utu_await_${sanitizeType(type)}`, CLOSURE_MODULE, `await_${sanitizeType(type)}`,
      binaryen.createType([binaryen.externref]), ctx.toType(type),
    );
  }
  for (const field of readPromiseSpec(root).ops ?? []) {
    // (promise: externref, callback: externref) -> void
    m.addFunctionImport(
      `__utu_${field}`, CLOSURE_MODULE, field,
      binaryen.createType([binaryen.externref, binaryen.externref]), binaryen.none,
    );
  }
  for (const { field, params, result } of runtime.calls) {
    m.addFunctionImport(
      `__utu_${field}`, CLOSURE_MODULE, field,
      binaryen.createType([binaryen.externref, ...params.map(ctx.toType)]),
      ctx.toType(result),
    );
  }
}

function readPromiseSpec(root) {
  try {
    return JSON.parse(root.dataset.promiseRuntime || 'null') ?? {};
  } catch {
    return {};
  }
}

/** Import names must be identifier-safe; type strings are not. */
export function sanitizeType(type) {
  return type.replace(/[^A-Za-z0-9]/g, '_');
}

/** `await p` → a call to the Suspending-wrapped host import for p's value type. */
export function emitAwait(node, ctx, emitExpr) {
  const value = node.dataset['typeName'];
  if (!value) throw new Error('codegen: ir-await has no value type');
  return ctx.module.call(
    `__utu_await_${sanitizeType(value)}`,
    [emitExpr(node.firstElementChild, ctx)],
    ctx.toType(value),
  );
}

/**
 * Recover each required call import's signature. The field names are recorded
 * by lower-closures.js; the types come back off the call sites so codegen never
 * re-implements the naming scheme.
 */
function readRuntimeSpec(root) {
  let spec;
  try {
    spec = JSON.parse(root.dataset.closureRuntime || 'null');
  } catch {
    spec = null;
  }
  if (!spec) return { new: false, calls: [] };

  const wanted = new Set(spec.calls ?? []);
  const calls = new Map();
  for (const call of root.querySelectorAll('ir-call')) {
    const parts = callableParts(call.firstElementChild?.dataset?.['typeName']);
    if (parts?.kind !== 'cl') continue;
    const field = closureCallImport(parts);
    if (wanted.has(field) && !calls.has(field)) {
      calls.set(field, { field, params: parts.params, result: parts.ret });
    }
  }
  return { new: Boolean(spec.new), calls: [...calls.values()] };
}

// ── Emit ──────────────────────────────────────────────────────────────────────

/** `cl(x) { … }` → closure_new(ref.func $lifted, env) */
export function emitMakeClosure(node, ctx, emitExpr) {
  const fnName = node.getAttribute('fn');
  const env = node.querySelector(':scope > ir-struct-init');
  if (!env) throw new Error('codegen: ir-make-closure is missing its environment');
  return ctx.module.call(
    CLOSURE_NEW,
    [funcRef(fnName, ctx), emitExpr(env, ctx)],
    binaryen.externref,
  );
}

/** `fun` in a `cl` position → closure_new(fn, null): a thunk with no environment. */
export function emitClosureDecay(node, ctx, emitExpr) {
  const inner = node.firstElementChild;
  if (!inner) throw new Error('codegen: ir-closure-decay has no operand');
  return ctx.module.call(
    CLOSURE_NEW,
    [emitExpr(inner, ctx), ctx.module.ref.null(binaryen.anyref)],
    binaryen.externref,
  );
}

/** A named function used as a value → a reference to it. */
export function emitFunRef(decl, ctx) {
  return funcRef(decl.getAttribute('name'), ctx);
}

/** Calling a `cl` value goes out through the host. */
export function emitClosureCall(node, parts, ctx, emitExpr) {
  const args = [...(node.querySelector(':scope > ir-arg-list')?.children ?? [])];
  return ctx.module.call(
    `__utu_${closureCallImport(parts)}`,
    [emitExpr(node.firstElementChild, ctx), ...args.map(arg => emitExpr(arg, ctx))],
    ctx.toType(parts.ret),
  );
}

/** Calling a `fun` value stays inside wasm. */
export function emitFunCall(node, parts, ctx, emitExpr) {
  const args = [...(node.querySelector(':scope > ir-arg-list')?.children ?? [])];
  return ctx.module.call_ref(
    emitExpr(node.firstElementChild, ctx),
    args.map(arg => emitExpr(arg, ctx)),
    ctx.toType(parts.ret),
  );
}

/**
 * `ref.func` needs the function's own signature type, which for a lifted
 * closure body includes the leading environment parameter and so is not the
 * `cl(...)` type written in source.  Read it off the declaration.
 */
function funcRef(name, ctx) {
  const decl = ctx.fnByName?.get(name);
  if (!decl) throw new Error(`codegen: no declaration for function reference "${name}"`);
  // Must go through declaredTypeStr: reading the type node's `name` attribute
  // directly drops the nullable wrapper, and binaryen rejects a ref.func whose
  // declared signature does not match the function exactly.
  const params = paramsOf(decl)
    .map(param => ctx.toType(declaredTypeStr(param) ?? param.dataset?.['typeName'] ?? 'void'));
  const result = ctx.toType(declaredTypeStr(decl) ?? 'void');
  return ctx.module.ref.func(name, ctx.signatureRefType(params, result));
}
