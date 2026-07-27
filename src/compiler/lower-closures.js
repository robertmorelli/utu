// lower-closures.js — closure conversion
//
// Rewrites every `ir-closure` literal into three pieces:
//
//   ir-struct  __ClosureEnvN   the captured bindings, one field each
//   ir-fn      __closureN      the body, lifted to top level, taking the
//                              environment as its first parameter
//   ir-make-closure            left at the original site, naming the lifted
//                              function and constructing its environment
//
// Identifiers inside the lifted body that referred to captured bindings are
// rewritten into field reads on the environment parameter.
//
// Closures are processed innermost-first. A nested closure is lifted while its
// enclosing body is still intact, so the `ir-make-closure` it leaves behind
// sits in that body and has its own captured identifiers rewritten in turn when
// the outer closure is lifted. That is what makes transitive capture work
// without any special handling here.
//
// Capture mode — recorded per field, and identical in representation:
//   scalar  → snapshot.  The value is copied in, so a later assignment to the
//             original binding is not observed by the closure.
//   GC ref  → shared.    The reference is copied, so mutation *through* it is
//             observed. Rebinding the original variable is not, in either case.
//
// This pass must run after resolveBindings (it consumes `ir-closure-env`) and
// before the type registry is finalised, since it introduces new struct types.

import { bodyOf, createSyntheticNode, declaredTypeStr, firstTypeChild, typeNodeToStr } from './ir-helpers.js';
import { forEachTypeContext } from './type-contexts.js';
import { callableParts } from './type-rules.js';
import { T } from './ir-tags.js';

const ENV_PARAM = '__env';

/**
 * @param {Document} doc
 * @returns {boolean} whether any closure was lifted
 */
export function lowerClosures(doc, typeIndex) {
  const root = doc.body.firstChild;
  if (!root) return false;

  let index = 0;
  let changed = false;
  // Innermost-first: pick a closure that contains no other closure.
  for (;;) {
    const closure = [...root.querySelectorAll('ir-closure')]
      .find(node => !node.querySelector('ir-closure'));
    if (!closure) break;
    liftClosure(closure, root, index++, typeIndex);
    changed = true;
  }

  insertDecays(root, typeIndex);
  recordRuntimeImports(root);
  recordPromiseImports(root);
  return changed;
}

// ── Closure decay ─────────────────────────────────────────────────────────────
//
// `fun` converts to `cl` by wrapping the function reference in a thunk over an
// empty environment.  This is the one coercion that needs a representation
// change, so it becomes an explicit node rather than being waved through by
// `isAssignable`.
//
// The sites are enumerated by type-contexts.js rather than here — see that file
// for why the two passes that need them must share one list.

function insertDecays(root, typeIndex) {
  forEachTypeContext(root, { typeIndex }, decayInto);
}

function decayInto(node, expectedType) {
  if (!node || !expectedType) return;
  const actual = callableParts(node.dataset?.['typeName']);
  const expected = callableParts(expectedType);
  if (!actual || !expected) return;
  if (actual.kind !== 'fun' || expected.kind !== 'cl') return;

  const doc = node.ownerDocument;
  const decay = createSyntheticNode(doc, T.CLOSURE_DECAY, node, 'lower-closures', 'closure-decay');
  decay.dataset['typeName'] = expectedType;
  node.replaceWith(decay);
  decay.appendChild(node);

  // A block's type is its tail's type, and the tail just changed
  // representation — from a function reference to an externref. Without this
  // the enclosing block keeps the pre-decay type and the backend rejects it.
  for (let child = decay, parent = decay.parentElement;
       parent?.lastElementChild === child && parent.dataset['typeName'];
       child = parent, parent = parent.parentElement) {
    parent.dataset['typeName'] = expectedType;
  }
}

// ── Runtime import surface ────────────────────────────────────────────────────
//
// Every distinct closure signature the program calls needs its own typed wasm
// import, because wasm imports are monomorphic.  The names are recorded on the
// document so the host can build a matching import object without re-deriving
// them from the IR.

function recordRuntimeImports(root) {
  const signatures = new Set();
  let needsNew = root.querySelector('ir-make-closure, ir-closure-decay') != null;

  for (const call of root.querySelectorAll('ir-call')) {
    const parts = callableParts(call.firstElementChild?.dataset?.['typeName']);
    if (parts?.kind === 'cl') signatures.add(closureCallImport(parts));
  }
  if (!needsNew && signatures.size === 0) return;

  root.dataset.closureRuntime = JSON.stringify({
    new: needsNew,
    calls: [...signatures].sort(),
  });
}

// Promise subscription needs one host import per operation, not per type: the
// promise and the callback are both externref whatever the element type is.
function recordPromiseImports(root) {
  const ops = new Set();
  if (root.querySelector('ir-promise-then')) ops.add('promise_then');
  if (root.querySelector('ir-promise-catch')) ops.add('promise_catch');

  // `await` needs one import per awaited value type, because the import's
  // result type is that value's type and wasm imports are monomorphic. The
  // host wraps each one in `WebAssembly.Suspending`, which is what actually
  // suspends the wasm stack.
  const awaits = new Set();
  for (const node of root.querySelectorAll('ir-await')) {
    const value = node.dataset['typeName'];
    if (value) awaits.add(value);
  }

  // Any function that can transitively await has to be reachable from a
  // `promising` entry point, so exports are recorded for the host to wrap.
  const asyncExports = [...root.querySelectorAll('ir-fn[data-export]')]
    .filter(fn => fn.querySelector('ir-await'))
    .map(fn => fn.getAttribute('name'))
    .filter(Boolean);

  if (ops.size === 0 && awaits.size === 0) return;
  root.dataset.promiseRuntime = JSON.stringify({
    ops: [...ops].sort(),
    awaits: [...awaits].sort(),
    asyncExports: asyncExports.sort(),
  });
}

/** Import field name for calling a closure of this signature. */
export function closureCallImport(parts) {
  const tag = [...parts.params, parts.ret]
    .map(type => type.replace(/[^A-Za-z0-9]/g, '_'))
    .join('_');
  return `closure_call_${tag || 'void'}`;
}

function liftClosure(closure, root, index, typeIndex) {
  const doc = closure.ownerDocument;
  const envType = `__ClosureEnv${index}`;
  const fnName = `__closure${index}`;
  const captures = readCaptures(closure, typeIndex);

  root.insertBefore(buildEnvStruct(doc, closure, envType, captures), root.firstChild);
  root.appendChild(buildLiftedFn(doc, closure, fnName, envType, captures));
  closure.replaceWith(buildMakeClosure(doc, closure, fnName, envType, captures));
}

// ── Captures ──────────────────────────────────────────────────────────────────

function readCaptures(closure, typeIndex) {
  const doc = closure.ownerDocument;
  return [...closure.querySelectorAll(':scope > ir-closure-env > ir-closure-cap')].map((cap) => {
    const decl = doc.getElementById(cap.dataset.bindingId);
    const type = captureTypeOf(decl);
    // Value types live on the wasm stack, so capturing one necessarily copies
    // it. Which types those are comes from the registry, not a list here — a
    // scalar added to the stdlib would otherwise be silently misclassified as
    // a shared reference.
    const isScalar = typeIndex?.get(type)?.scalarFamily != null;
    return {
      name: cap.getAttribute('name'),
      bindingId: cap.dataset.bindingId,
      type,
      mode: isScalar ? 'snapshot' : 'shared',
    };
  });
}

function captureTypeOf(decl) {
  if (!decl) return 'unknown';
  return declaredTypeStr(decl) ?? decl.dataset?.['typeName'] ?? 'unknown';
}

// ── Construction ──────────────────────────────────────────────────────────────

function buildEnvStruct(doc, site, envType, captures) {
  const struct = createSyntheticNode(doc, T.STRUCT, site, 'lower-closures', 'closure-env-struct');
  struct.setAttribute('name', envType);
  for (const capture of captures) {
    const field = createSyntheticNode(doc, T.FIELD, site, 'lower-closures', 'closure-env-field');
    field.setAttribute('name', capture.name);
    field.dataset.captureMode = capture.mode;
    field.appendChild(buildTypeNode(doc, site, capture.type));
    struct.appendChild(field);
  }
  return struct;
}

function buildLiftedFn(doc, closure, fnName, envType, captures) {
  const fn = createSyntheticNode(doc, T.FN, closure, 'lower-closures', 'closure-lifted-fn');
  fn.setAttribute('name', fnName);
  fn.dataset.closureLifted = 'true';

  const name = createSyntheticNode(doc, T.FN_NAME, closure, 'lower-closures', 'closure-lifted-name');
  name.setAttribute('kind', 'free');
  name.setAttribute('name', fnName);
  name.setAttribute('raw', fnName);
  fn.appendChild(name);

  // Environment first, then the closure's own parameters, moved across intact
  // so their binding ids stay valid for identifiers already resolved to them.
  const params = createSyntheticNode(doc, T.PARAM_LIST, closure, 'lower-closures', 'closure-lifted-params');
  const envParam = createSyntheticNode(doc, T.PARAM, closure, 'lower-closures', 'closure-env-param');
  envParam.setAttribute('name', ENV_PARAM);
  envParam.appendChild(buildTypeNode(doc, closure, envType));
  params.appendChild(envParam);

  const declared = closure.querySelector(':scope > ir-param-list');
  for (const param of [...(declared?.children ?? [])]) {
    // Parameters whose type came from the closure's expectation carry it on
    // data-type-name only.  Materialise a type node so the lifted function is
    // shaped like any other and codegen needs no special case.
    if (!firstTypeChild(param) && param.dataset['typeName']) {
      param.appendChild(buildTypeNode(doc, param, param.dataset['typeName']));
    }
    params.appendChild(param);
  }
  fn.appendChild(params);

  fn.appendChild(buildTypeNode(doc, closure, closureReturnType(closure)));

  const body = bodyOf(closure);
  if (body) {
    rewriteCaptureReads(body, captures, envParam, doc, closure);
    fn.appendChild(body);
  }
  return fn;
}

function buildMakeClosure(doc, closure, fnName, envType, captures) {
  const make = createSyntheticNode(doc, T.MAKE_CLOSURE, closure, 'lower-closures', 'make-closure');
  make.setAttribute('fn', fnName);
  make.setAttribute('env-type', envType);
  if (closure.dataset['typeName']) make.dataset['typeName'] = closure.dataset['typeName'];

  const init = createSyntheticNode(doc, T.STRUCT_INIT, closure, 'lower-closures', 'closure-env-init');
  init.setAttribute('type-name', envType);
  init.dataset['typeName'] = envType;
  for (const capture of captures) {
    const fieldInit = createSyntheticNode(doc, T.FIELD_INIT, closure, 'lower-closures', 'closure-env-init-field');
    fieldInit.setAttribute('field', capture.name);
    const ident = createSyntheticNode(doc, T.IDENT, closure, 'lower-closures', 'closure-env-init-value');
    ident.setAttribute('name', capture.name);
    ident.dataset.bindingId = capture.bindingId;
    if (capture.type !== 'unknown') ident.dataset['typeName'] = capture.type;
    fieldInit.appendChild(ident);
    init.appendChild(fieldInit);
  }
  make.appendChild(init);
  return make;
}

// ── Body rewriting ────────────────────────────────────────────────────────────

/**
 * Replace reads of captured bindings with `__env.<name>`. Matching is by
 * binding id rather than by name so a shadowed inner binding of the same name
 * is left alone.
 */
function rewriteCaptureReads(body, captures, envParam, doc, site) {
  if (captures.length === 0) return;
  const byBinding = new Map(captures.map(capture => [capture.bindingId, capture]));

  for (const ident of [...body.querySelectorAll('ir-ident')]) {
    const capture = byBinding.get(ident.dataset.bindingId);
    if (!capture) continue;

    const access = createSyntheticNode(doc, T.FIELD_ACCESS, ident, 'lower-closures', 'closure-capture-read');
    access.setAttribute('field', capture.name);
    access.dataset.fieldOwnerName = envParam.querySelector(':scope > ir-type-ref')?.getAttribute('name') ?? '';
    if (capture.type !== 'unknown') access.dataset['typeName'] = capture.type;

    const receiver = createSyntheticNode(doc, T.IDENT, ident, 'lower-closures', 'closure-env-receiver');
    receiver.setAttribute('name', ENV_PARAM);
    receiver.dataset.bindingId = envParam.id;
    receiver.dataset.bindingKind = 'ir-param';
    receiver.dataset.bindingName = ENV_PARAM;
    receiver.dataset['typeName'] = access.dataset.fieldOwnerName;

    access.appendChild(receiver);
    ident.replaceWith(access);
  }
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function closureReturnType(closure) {
  const declared = typeNodeToStr(firstTypeChild(closure));
  if (declared) return declared;
  const parts = callableParts(closure.dataset['typeName']);
  if (parts) return parts.ret;
  return bodyOf(closure)?.dataset['typeName'] ?? 'void';
}

/**
 * Build a type node for a type string. Named types become an `ir-type-ref`;
 * anything structural (callable, nullable) has no single-node spelling here, so
 * the string is carried on `data-type-name` and read back by `declaredTypeStr`'s
 * fallback.
 */
function buildTypeNode(doc, site, typeStr) {
  if (typeStr === 'void') {
    return createSyntheticNode(doc, T.TYPE_VOID, site, 'lower-closures', 'closure-type');
  }
  const node = createSyntheticNode(doc, T.TYPE_REF, site, 'lower-closures', 'closure-type');
  node.setAttribute('name', typeStr);
  return node;
}
