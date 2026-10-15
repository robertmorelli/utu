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
// This pass must run after resolveBindings (it consumes scope-graph captures)
// and before the type registry is finalised, since it introduces new structs.
//
// Given backend facts, it reads types from them and records the facts of
// every node it creates (backend-facts.js).

import { bodyOf, childOf, createSyntheticNode, firstTypeChild, replaceTypedNode, typeNodeToStr } from './ir-helpers.js';
import { declarationType, planCoercions } from './type-graph.js';
import { callableParts } from './type-rules.js';
import { T } from './ir-tags.js';
import { retainedGraphs } from './graph-store.js';
export { closureCallImport } from './closure-abi.js';

/**
 * @param {Document} doc
 * @returns {boolean} whether literals or function-to-closure coercions changed the IR
 */
export function lowerClosures(doc, typeIndex, graph, facts = null) {
  const root = doc.body.firstChild;
  if (!root) return false;
  const scopeGraph = retainedGraphs(doc).scope;
  const lowering = {
    facts,
    typeOf: facts ? node => facts.type(node) : node => node?.attr?.('data-type-name') ?? null,
  };

  if (!graph.coercions.length) planCoercions(graph);
  let changed = insertDecays(graph, lowering);
  const closures = closurePostorder(root);
  if (closures.length === 0) return changed;
  const names = new Set([...root.querySelectorAll('[name]')].map(node => node.getAttribute('name')));
  let index = 0;
  // Snapshot postorder once. Repeatedly querying the entire growing program
  // made independent closures quadratic; parents must still follow children.
  for (const closure of closures) {
    while (names.has(`__ClosureEnv${index}`) || names.has(`__closure${index}`)) index++;
    liftClosure(closure, root, index++, typeIndex, graph, scopeGraph, lowering);
    changed = true;
  }

  return changed;
}

// ── Closure decay ─────────────────────────────────────────────────────────────
//
// `fun` converts to `cl` by wrapping the function reference in a thunk over an
// empty environment. This representation-changing coercion is planned by the
// graph and materialized here.
//
// Sites come directly from the graph's expectation edges.

function insertDecays(graph, lowering) {
  let changed = false;
  for (const coercion of graph.coercions) {
    if (coercion.kind === 'fun-to-cl') changed = decayInto(coercion.node, coercion.to, lowering) || changed;
  }
  return changed;
}

function decayInto(node, expectedType, { facts }) {
  if (!node || !expectedType) return false;

  const doc = node.ownerDocument;
  const decay = createSyntheticNode(doc, T.CLOSURE_DECAY, node, 'lower-closures', 'closure-decay');
  replaceTypedNode(node, decay, facts);
  decay.setAttribute('data-type-name', expectedType);
  facts?.setType(decay, expectedType);
  decay.appendChild(node);

  // A block's type is its tail's type, and the tail just changed
  // representation — from a function reference to an externref. Without this
  // the enclosing block keeps the pre-decay type and the backend rejects it.
  for (let child = decay, parent = decay.parentElement;
       parent?.lastElementChild === child && parent.attr('data-type-name');
       child = parent, parent = parent.parentElement) {
    parent.setAttribute('data-type-name', expectedType);
  }
  for (let child = decay, parent = decay.parentElement;
       facts && parent?.lastElementChild === child && (parent.localName === 'ir-block' || parent.localName === 'ir-paren');
       child = parent, parent = parent.parentElement) {
    facts.setType(parent, expectedType);
  }
  return true;
}

// By program: each environment shape (captured names, types, and modes) and
// its struct, so closures capturing alike share one (and their bodies one
// function type).
const environments = new WeakMap();

function liftClosure(closure, root, index, typeIndex, graph, scopeGraph, lowering) {
  const doc = closure.ownerDocument;
  const fnName = `__closure${index}`;
  const captures = readCaptures(closure, typeIndex, graph, scopeGraph);

  if (!environments.has(root)) environments.set(root, new Map());
  const shapes = environments.get(root);
  const shape = JSON.stringify(captures.map(capture => [capture.name, capture.type, capture.mode]));
  let env = shapes.get(shape);
  if (!env?.isConnected) {
    env = buildEnvStruct(doc, closure, `__ClosureEnv${index}`, captures, lowering);
    root.insertBefore(env, root.firstChild);
    shapes.set(shape, env);
  }
  const envType = env.getAttribute('name');
  root.appendChild(buildLiftedFn(doc, closure, fnName, envType, captures, scopeGraph, env, lowering));
  replaceTypedNode(closure, buildMakeClosure(doc, closure, fnName, envType, captures, lowering), lowering.facts);
}

// ── Captures ──────────────────────────────────────────────────────────────────

function readCaptures(closure, typeIndex, graph, scopeGraph) {
  return [...(scopeGraph?.captures.get(closure.id) ?? [])].map(([name, decl]) => {
    const type = declarationType(graph, decl) ?? 'unknown';
    // Value types live on the wasm stack, so capturing one necessarily copies
    // it. Which types those are comes from the registry, not a list here — a
    // scalar added to the stdlib would otherwise be silently misclassified as
    // a shared reference.
    const isScalar = typeIndex?.get(type)?.scalarFamily != null;
    return {
      name,
      bindingId: decl.id,
      declaration: decl,
      type,
      mode: isScalar ? 'snapshot' : 'shared',
    };
  });
}

// ── Construction ──────────────────────────────────────────────────────────────

function buildEnvStruct(doc, site, envType, captures, lowering) {
  const struct = createSyntheticNode(doc, T.STRUCT, site, 'lower-closures', 'closure-env-struct');
  struct.setAttribute('name', envType);
  for (const capture of captures) {
    const field = createSyntheticNode(doc, T.FIELD, site, 'lower-closures', 'closure-env-field');
    field.setAttribute('name', capture.name);
    field.setAttribute('data-capture-mode', capture.mode);
    field.appendChild(buildTypeNode(doc, site, capture.type, lowering));
    struct.appendChild(field);
  }
  return struct;
}

function buildLiftedFn(doc, closure, fnName, envType, captures, scopeGraph, env, lowering) {
  const { facts, typeOf } = lowering;
  const fn = createSyntheticNode(doc, T.FN, closure, 'lower-closures', 'closure-lifted-fn');
  fn.setAttribute('name', fnName);
  fn.setAttribute('data-closure-lifted', 'true');

  const name = createSyntheticNode(doc, T.FN_NAME, closure, 'lower-closures', 'closure-lifted-name');
  name.setAttribute('kind', 'free');
  name.setAttribute('name', fnName);
  name.setAttribute('raw', fnName);
  fn.appendChild(name);

  // Environment first, then the closure's own parameters, moved across intact
  // so their binding ids stay valid for identifiers already resolved to them.
  const params = createSyntheticNode(doc, T.PARAM_LIST, closure, 'lower-closures', 'closure-lifted-params');
  const envParam = createSyntheticNode(doc, T.PARAM, closure, 'lower-closures', 'closure-env-param');
  const occupied = new Set([...closure.querySelectorAll('[name]')].map(node => node.getAttribute('name')));
  let envName = '__env';
  for (let suffix = 0; occupied.has(envName); suffix++) envName = `__env${suffix}`;
  envParam.setAttribute('name', envName);
  envParam.appendChild(buildTypeNode(doc, closure, envType, lowering));
  facts?.setType(envParam, envType);
  params.appendChild(envParam);

  const declared = childOf(closure, 'ir-param-list');
  for (const param of [...(declared?.children ?? [])]) {
    // Parameters whose type came from the closure's expectation carry it on
    // data-type-name only.  Materialise a type node so the lifted function is
    // shaped like any other and codegen needs no special case.
    if (!firstTypeChild(param) && typeOf(param)) {
      param.appendChild(buildTypeNode(doc, param, typeOf(param), lowering));
    }
    params.appendChild(param);
  }
  fn.appendChild(params);

  fn.appendChild(buildTypeNode(doc, closure, closureReturnType(closure, typeOf), lowering));

  const body = bodyOf(closure);
  if (body) {
    rewriteCaptureReads(body, captures, envParam, doc, scopeGraph, env, lowering);
    fn.appendChild(body);
  }
  return fn;
}

function buildMakeClosure(doc, closure, fnName, envType, captures, { facts, typeOf }) {
  const make = createSyntheticNode(doc, T.MAKE_CLOSURE, closure, 'lower-closures', 'make-closure');
  make.setAttribute('fn', fnName);
  make.setAttribute('env-type', envType);
  if (typeOf(closure)) make.setAttribute('data-type-name', typeOf(closure));

  const init = createSyntheticNode(doc, T.STRUCT_INIT, closure, 'lower-closures', 'closure-env-init');
  init.setAttribute('type-name', envType);
  init.setAttribute('data-type-name', envType);
  facts?.setType(init, envType);
  for (const capture of captures) {
    const fieldInit = createSyntheticNode(doc, T.FIELD_INIT, closure, 'lower-closures', 'closure-env-init-field');
    fieldInit.setAttribute('field', capture.name);
    const ident = createSyntheticNode(doc, T.IDENT, closure, 'lower-closures', 'closure-env-init-value');
    ident.setAttribute('name', capture.name);
    ident.setAttribute('data-binding-id', capture.bindingId);
    if (capture.type !== 'unknown') ident.setAttribute('data-type-name', capture.type);
    if (capture.type !== 'unknown') facts?.setType(ident, capture.type);
    facts?.bindings.set(ident.id, capture.declaration);
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
function rewriteCaptureReads(body, captures, envParam, doc, scopeGraph, env, { facts }) {
  if (captures.length === 0) return;
  const byBinding = new Map(captures.map(capture => [capture.bindingId, capture]));
  const envType = env.getAttribute('name');
  const fieldNodes = [...env.children];

  for (const ident of [...body.querySelectorAll('ir-ident')]) {
    const bindingId = scopeGraph?.resolutions.get(ident.id)?.id ?? ident.attr('data-binding-id');
    const capture = byBinding.get(bindingId);
    if (!capture) continue;

    const access = createSyntheticNode(doc, T.FIELD_ACCESS, ident, 'lower-closures', 'closure-capture-read');
    access.setAttribute('field', capture.name);
    access.setAttribute('data-field-owner-name', childOf(envParam, 'ir-type-ref')?.getAttribute('name') ?? '');
    if (capture.type !== 'unknown') access.setAttribute('data-type-name', capture.type);

    const receiver = createSyntheticNode(doc, T.IDENT, ident, 'lower-closures', 'closure-env-receiver');
    receiver.setAttribute('name', envParam.getAttribute('name'));
    receiver.setAttribute('data-binding-id', envParam.id);
    receiver.setAttribute('data-binding-kind', 'ir-param');
    receiver.setAttribute('data-binding-name', envParam.getAttribute('name'));
    receiver.setAttribute('data-type-name', access.attr('data-field-owner-name'));

    access.appendChild(receiver);
    replaceTypedNode(ident, access, facts);
    if (facts) {
      const index = captures.indexOf(capture);
      if (capture.type !== 'unknown') facts.setType(access, capture.type);
      facts.fields.set(access, { owner: envType, type: capture.type, index, declaration: fieldNodes[index] });
      facts.bindings.delete(access.id);
      facts.setType(receiver, envType);
      facts.bindings.set(receiver.id, envParam);
    }
  }
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function closurePostorder(root) {
  const result = [];
  const stack = [[root, false]];
  while (stack.length) {
    const [node, visited] = stack.pop();
    if (visited) {
      if (node.localName === T.CLOSURE) result.push(node);
      continue;
    }
    stack.push([node, true]);
    for (let child = node.lastElementChild; child; child = child.previousElementSibling) {
      stack.push([child, false]);
    }
  }
  return result;
}

function closureReturnType(closure, typeOf) {
  const declared = typeNodeToStr(firstTypeChild(closure));
  if (declared) return declared;
  const parts = callableParts(typeOf(closure));
  if (parts) return parts.ret;
  return typeOf(bodyOf(closure)) ?? 'void';
}

/**
 * Build a type node for a type string. Named types become an `ir-type-ref`;
 * structural types use their canonical type string as the reference name.
 * This is internal IR, not a source-level declaration spelling.
 */
function buildTypeNode(doc, site, typeStr, { facts }) {
  if (typeStr === 'void') {
    return createSyntheticNode(doc, T.TYPE_VOID, site, 'lower-closures', 'closure-type');
  }
  const node = createSyntheticNode(doc, T.TYPE_REF, site, 'lower-closures', 'closure-type');
  node.setAttribute('name', typeStr);
  facts?.setType(node, typeStr);
  return node;
}
