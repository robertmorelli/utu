// infer-expr.js — expression and block inference rules

import { bodyOf, declaredTypeStr, directCalleeDecl, firstTypeChild, fnReturnType, paramsOf, stampType, typeNodeToStr } from './ir-helpers.js';
import { bindingType, unifyTypes } from './infer-type-helpers.js';
import { callableParts, callableTypeStr, unwrapNullable } from './type-rules.js';
import { BINARY_OP_FN, UNARY_OP_FN } from './lower-operators.js';
import { isInstanceOf, moduleArgsOf } from './module-names.js';

// ── Block / statement inference ───────────────────────────────────────────────

export function inferBlock(block, env) {
  for (const child of block.children) {
    inferExpr(child, env);
  }
  // Block type = type of last child
  const last = block.lastElementChild;
  if (last?.dataset['typeName']) block.dataset['typeName'] = last.dataset['typeName'];
}

// ── Expression inference ──────────────────────────────────────────────────────

export function inferExpr(node, env) {
  if (!node || typeof node.localName !== 'string') return;

  switch (node.localName) {

    case 'ir-lit': {
      // Allow stdlib @ir templates to pin a literal's type explicitly.  This
      // matters for wrappers like `<ir-i64-sub><ir-lit kind="int" type-name="i64"
      // value="0"/><ir-ident name="a"/></ir-i64-sub>`: without the override
      // `kind="int"` would default to i32 via literal_defaults and the sub
      // op would get a width mismatch.
      const override = node.getAttribute('type-name');
      const kind = node.getAttribute('kind');
      const fallback = kind; // unknown kinds keep their own name as a typestring
      const t = override ?? env.literalDefaults.get(kind) ?? fallback;
      stampType(node, t, 'literal');
      return;
    }

    case 'ir-ident': {
      const bid = node.dataset.bindingId;
      if (bid) {
        const decl = env.doc.getElementById(bid);
        const t = bindingType(decl);
        if (t) stampType(node, t, 'binding');
      }
      return;
    }

    case 'ir-let': {
      // Infer the init expression, then type is the declared type annotation
      for (const child of node.children) inferExpr(child, env);
      for (const child of node.children) {
        const t = typeNodeToStr(child);
        if (t) { stampType(node, t, 'declared'); return; }
      }
      return;
    }

    case 'ir-block': {
      inferBlock(node, env);
      return;
    }

    case 'ir-paren': {
      const inner = node.firstElementChild;
      if (inner) { inferExpr(inner, env); stampType(node, inner.dataset['typeName'] ?? '', 'paren'); }
      return;
    }

    case 'ir-unary': {
      const operand = node.firstElementChild;
      if (operand) inferExpr(operand, env);
      stampType(node, operatorResultType(node, operand, UNARY_OP_FN, env), 'unary');
      return;
    }

    case 'ir-binary': {
      const [lhs, rhs] = [...node.children];
      inferExpr(lhs, env);
      inferExpr(rhs, env);
      stampType(node, operatorResultType(node, lhs, BINARY_OP_FN, env), 'binary');
      return;
    }

    case 'ir-assign': {
      for (const child of node.children) inferExpr(child, env);
      stampType(node, 'void', 'assign');
      return;
    }


    case 'ir-if': {
      for (const child of node.children) inferExpr(child, env);
      const thenBlock = node.firstElementChild?.localName === 'ir-block'
        ? node.firstElementChild
        : bodyOf(node);
      const elseBlock = node.lastElementChild !== thenBlock ? node.lastElementChild : null;
      const t = unifyTypes(thenBlock?.dataset['typeName'], elseBlock?.dataset['typeName'])
        ?? thenBlock?.dataset['typeName']
        ?? elseBlock?.dataset['typeName'];
      if (t) stampType(node, t, 'if');
      return;
    }

    case 'ir-while':
    case 'ir-for': {
      for (const child of node.children) inferExpr(child, env);
      stampType(node, 'void', node.localName === 'ir-while' ? 'while' : 'for');
      return;
    }

    case 'ir-match':
    case 'ir-alt': {
      for (const child of node.children) inferExpr(child, env);
      // Type = first arm body type
      const firstArm = node.querySelector(':scope > ir-match-arm, :scope > ir-alt-arm');
      const armBody  = firstArm?.lastElementChild;
      if (armBody?.dataset['typeName']) stampType(node, armBody.dataset['typeName'], node.localName === 'ir-match' ? 'match' : 'alt');
      return;
    }

    case 'ir-promote': {
      for (const child of node.children) inferExpr(child, env);
      const arm = node.querySelector('ir-promote-arm');
      const armType = arm?.lastElementChild?.dataset['typeName'];
      const defaultType = node.querySelector(':scope > ir-default-arm')?.lastElementChild?.dataset['typeName'];
      const t = unifyTypes(armType, defaultType) ?? armType ?? defaultType;
      if (t) stampType(node, t, 'promote');
      return;
    }

    case 'ir-return':
    case 'ir-break': {
      const child = node.firstElementChild;
      if (child) inferExpr(child, env);
      stampType(node, 'void', node.localName === 'ir-return' ? 'return' : 'break');
      return;
    }

    case 'ir-assert':
    case 'ir-fatal': {
      // The statement is void, but the asserted condition is a real expression
      // and has to be inferred — otherwise every operand inside an `assert`
      // reads as untyped and operator lowering cannot resolve an overload.
      for (const child of node.children) inferExpr(child, env);
      stampType(node, 'void', node.localName === 'ir-assert' ? 'assert' : 'fatal');
      return;
    }

    case 'ir-else': {
      const [expr, fallback] = [...node.children];
      inferExpr(expr, env);
      inferExpr(fallback, env);
      // Unwrap nullable: ?T \ default → T
      const t = expr?.dataset['typeName'];
      stampType(node, t?.startsWith('?') ? t.slice(1) : (t ?? ''), 'orelse');
      return;
    }

    case 'ir-call': {
      const callee = node.firstElementChild;
      const decl = directCalleeDecl(node, env.doc);
      const isFnDecl = decl != null;

      // Seed closure arguments from the callee's parameter types before
      // descending, so `on_click(cl(e) { … })` types `e` from the declaration
      // rather than leaving it unknown.
      //
      // Method callees are resolved here rather than waiting for pass 8: by
      // then the closure has already been lifted and there is nothing left to
      // seed. The receiver's type is known now, which is all the lookup needs.
      if (isFnDecl) seedClosureArgs(node, decl);
      else seedClosureArgsForMethod(node, env);

      for (const child of node.children) inferExpr(child, env);

      // Free fn call: callee is ir-ident with a binding to ir-fn
      if (isFnDecl) {
        stampType(node, fnReturnType(decl), 'call');
        return;
      }
      // Calling a `fun` / `cl` value: the result is the callable's return type.
      const calleeType = callee?.dataset['typeName'];
      const parts = callableParts(calleeType);
      if (parts) stampType(node, parts.ret, 'call-value');
      // Method calls (callee = ir-field-access) are resolved in pass 8
      return;
    }

    case 'ir-await': {
      // `await p` where p : Promise[T] yields T. The module's type argument is
      // recovered from the instantiated name (`Promise__I32` → `I32`), which is
      // what module instantiation produced.
      const inner = node.firstElementChild;
      if (inner) inferExpr(inner, env);
      const value = awaitedType(inner?.dataset['typeName'], env);
      if (value) stampType(node, value, 'await');
      return;
    }

    case 'ir-closure': {
      // Parameter types are optional in source.  Fill them in from whatever
      // context declared this closure before inferring the body, so the body
      // sees typed parameters.
      seedClosureFromContext(node);
      const body = bodyOf(node);
      if (body) inferBlock(body, env);
      stampType(node, closureTypeOf(node, body), 'closure');
      return;
    }

    case 'ir-type-member': {
      // Static call: TypeName.method — return type resolved in pass 8
      for (const child of node.children) inferExpr(child, env);
      return;
    }

    case 'ir-field-access': {
      const recv = node.firstElementChild;
      if (recv) inferExpr(recv, env);
      // Field type resolved in pass 8 (needs receiver's declared struct)
      return;
    }

    case 'ir-struct-init': {
      for (const child of node.children) inferExpr(child, env);
      const typeName = node.getAttribute('type-name');
      if (typeName) stampType(node, typeName, 'struct-init');
      return;
    }

    case 'ir-null-ref': {
      const typeName = node.getAttribute('type-name');
      stampType(node, typeName ? `?${typeName}` : 'null', 'null-ref');
      return;
    }

    case 'ir-ref-test': {
      const inner = node.firstElementChild;
      if (inner) inferExpr(inner, env);
      stampType(node, env.literalDefaults.get('bool') ?? 'Bool', 'ref-test');
      return;
    }

    case 'ir-ref-is-null': {
      const inner = node.firstElementChild;
      if (inner) inferExpr(inner, env);
      stampType(node, env.literalDefaults.get('bool') ?? 'Bool', 'ref-is-null');
      return;
    }

    case 'ir-ref-cast': {
      const inner = node.firstElementChild;
      if (inner) inferExpr(inner, env);
      const typeName = node.getAttribute('type-name');
      if (typeName) stampType(node, typeName, 'ref-cast');
      return;
    }

    default:
      for (const child of node.children) inferExpr(child, env);
  }
}

// ── Closures ──────────────────────────────────────────────────────────────────

/** Declared parameter types of a closure, filled-in types included. */
function closureParamTypes(closure) {
  return paramsOf(closure)
    .map(param => declaredTypeStr(param) ?? param.dataset['typeName'] ?? 'unknown');
}

function closureTypeOf(closure, body) {
  const declaredRet = typeNodeToStr(firstTypeChild(closure));
  const ret = declaredRet ?? body?.dataset['typeName'] ?? 'void';
  return callableTypeStr('cl', closureParamTypes(closure), ret);
}

/**
 * Copy parameter types from an expected callable type onto a closure's
 * unannotated parameters.  An explicit annotation always wins — this only
 * fills gaps, so a wrong annotation still reports as a mismatch rather than
 * being silently overwritten.
 */
function seedClosureParams(closure, expectedType) {
  const parts = callableParts(expectedType);
  if (!parts) return false;
  let seeded = false;
  const params = paramsOf(closure);
  params.forEach((param, i) => {
    if (firstTypeChild(param) || param.dataset['typeName']) return;
    const type = parts.params[i];
    if (type) { param.dataset['typeName'] = type; seeded = true; }
  });
  if (!firstTypeChild(closure)) closure.dataset.expectedReturn = parts.ret;
  return seeded;
}

/** Seed from the declaration this closure initialises (`let f: cl(…) … = cl(x) {…}`). */
function seedClosureFromContext(closure) {
  const parent = closure.parentElement;
  if (parent?.localName !== 'ir-let' && parent?.localName !== 'ir-global') return;
  seedClosureParams(closure, declaredTypeStr(parent));
}

/**
 * The value type of an awaited promise.
 *
 * Read from what the instantiation recorded rather than by splitting the
 * mangled name: `Promise[Array[I32]]` becomes `Promise__Array__I32`, which
 * cannot be taken apart by inspection. Awaiting a non-promise leaves the node
 * untyped and validation reports it.
 */
function awaitedType(typeStr, env) {
  const entry = env.typeIndex?.get(unwrapNullable(typeStr ?? ''));
  if (!isInstanceOf(entry, 'Promise')) return null;
  return moduleArgsOf(entry)[0] ?? null;
}

/**
 * Resolve a method callee well enough to seed its closure arguments.
 *
 * `p.then(cl(v) { … })` cannot type `v` without knowing which `then` is meant,
 * and full method resolution runs long after closures are lifted. The receiver
 * is already inferred at this point, so the declaration can be looked up
 * directly by its hoisted name.
 */
function seedClosureArgsForMethod(call, env) {
  const callee = call.firstElementChild;
  if (callee?.localName !== 'ir-field-access') return;
  const receiver = callee.firstElementChild;
  if (receiver) inferExpr(receiver, env);
  const recvType = receiver?.dataset['typeName'];
  if (!recvType) return;
  const fn = env.fnIndex.get(`${unwrapNullable(recvType)}.${callee.getAttribute('field')}`);
  if (fn) seedClosureArgs(call, fn);
}

/**
 * Seed closure arguments positionally from the callee's parameter declarations.
 *
 * Exported because method calls resolve after inference: `p.then(cl(v) { … })`
 * cannot know what `v` is until resolveMethods has found `Promise[I32].then`.
 * That pass calls this and reports whether anything changed, so inference can
 * be run again over the newly-typed closure bodies.
 *
 * @returns {boolean} whether any parameter type was filled in
 */
function seedClosureArgs(call, fn) {
  const args = [...(call.querySelector(':scope > ir-arg-list')?.children ?? [])];
  const params = paramsOf(fn);
  let seeded = false;
  args.forEach((arg, i) => {
    if (arg.localName !== 'ir-closure') return;
    const declared = params[i] ? declaredTypeStr(params[i]) : null;
    if (declared && seedClosureParams(arg, declared)) seeded = true;
  });
  return seeded;
}

// ── Operator result types ─────────────────────────────────────────────────────

// An operator expression's type is the declared return type of the overload
// lower-operators.js will rewrite it into — `fn I32:eq |a, b| Bool` means
// `a == b` is Bool, not I32.  Taking the operand type instead collapses every
// comparison onto its operand's type, which happens to share a wasm
// representation with Bool and so goes unnoticed until a `Bool` is required.
//
// Falls back to the operand type when no overload is declared: the operand may
// still be untyped this iteration, and lower-operators.js reports the missing
// overload with a better message than inference could.
function operatorResultType(node, operand, opFnMap, env) {
  const operandType = operand?.dataset['typeName'] ?? '';
  const fnName = opFnMap[node.getAttribute('op')];
  if (!fnName || !operandType) return operandType;
  const fn = env.fnIndex.get(`${operandType}:${fnName}`);
  if (!fn) return operandType;
  const declared = fnReturnType(fn);
  return declared === 'void' ? operandType : declared;
}
