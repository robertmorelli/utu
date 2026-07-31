// type-graph.js — build, solve, then check the program's type graph

import {
  bodyOf, declaredTypeStr, directCalleeDecl, firstTypeChild, fnReturnType,
  fnSignatureType, isFunctionDecl, paramsOf, selfParamOf, sourceId, stampType, typeNodeToStr,
} from './ir-helpers.js';
import { diagnosticFacts, DIAGNOSTIC_KINDS } from './diagnostics.js';
import { BINARY_OP_FN, UNARY_OP_FN } from './operator-specs.js';
import { callableParts, callableTypeStr, INFERRED_PRIMITIVES, isAssignable, unifyTypes, unwrapNullable } from './type-rules.js';
import { isInstanceOf, moduleArgsOf } from './module-names.js';
import { retainedGraphs } from './graph-store.js';
import { buildProgramIndex, nodesOf } from './program-index.js';
import { reportTypeGraphDiagnostics } from './type-graph-diagnostics.js';

const VOID_NODES = new Set([
  'ir-assign', 'ir-while', 'ir-for', 'ir-return', 'ir-break', 'ir-assert', 'ir-fatal',
]);
const MEMBER_OPERATIONS = new Map([['ir-index', 'get_index'], ['ir-slice', 'get_slice']]);

/**
 * @typedef {Object} TypeSlot
 * @property {Element} node
 * @property {string | null} actual
 * @property {Array<object>} expected
 * @property {Element | null} function
 * @property {object | null} resolution
 * @property {object} [field]
 */

/**
 * @typedef {Object} TypeGraph
 * @property {Document} doc
 * @property {Map<string, object>} typeIndex
 * @property {number} programRevision
 * @property {Map<Element, TypeSlot>} slots
 * @property {Array<object>} rules
 * @property {Array<object>} expectations
 * @property {Array<object>} failures
 * @property {Array<object>} coercions
 */

/** @returns {TypeGraph} */
export function buildTypeGraph(doc, typeIndex) {
  const root = doc?.body?.firstChild;
  const retained = retainedGraphs(doc);
  const programIndex = retained.program ?? buildProgramIndex(doc);
  const graph = {
    doc, root, typeIndex, programIndex, programRevision: programIndex.revision,
    byKind: programIndex.byKind, nodesByKind: programIndex.byKind,
    scopeGraph: retained.scope, slots: new Map(), rules: [], expectations: [],
    failures: [], coercions: [], changed: false,
  };
  if (!root) return graph;

  for (const node of programIndex.all) graph.slots.set(node, slot(node));
  graph.fnIndex = programIndex.functions;
  graph.literalDefaults = collectLiteralDefaults(graph);
  for (const node of graph.slots.keys()) {
    addActualRule(graph, node);
    addExpectations(graph, node);
  }
  return graph;
}

export function settleTypeGraph(doc, typeIndex) {
  for (;;) {
    const graph = solveTypeGraph(buildTypeGraph(doc, typeIndex));
    const rewrites = planContextualRewrites(graph);
    applyContextualRewrites(graph, rewrites);
    if (!graph.changed) { planCoercions(graph); return graph; }
  }
}

/** Plan context-dependent IR changes without applying them. */
export function planContextualRewrites(graph) {
  const rewrites = [];
  const adopters = collectLiteralAdopters(graph);
  for (const edge of graph.expectations) {
    const expected = edge.read();
    if (!expected) continue;
    const value = unwrapParens(edge.value);
    if (value?.localName === 'ir-struct-init' && value.getAttribute('implicit') === 'true') {
      rewrites.push({ kind: 'implicit-struct', node: value, type: unwrapNullable(expected), edge });
      continue;
    }
    if (value?.localName === 'ir-lit' && !value.getAttribute('type-name')) {
      const wanted = unwrapNullable(expected);
      if (adopters.get(value.getAttribute('kind'))?.has(wanted)) {
        rewrites.push({ kind: 'literal-type', node: value, type: wanted, edge });
      }
      continue;
    }
    // Return/binding context also reaches homogeneous numeric operator trees.
    // Without this, `fn f() F32 { 2.0 * field; }` chooses F64 from the first
    // literal before the surrounding F32 expectation can participate.
    if (value?.matches?.('ir-binary, ir-unary')) {
      const wanted = unwrapNullable(expected);
      for (const literal of value.querySelectorAll('ir-lit:not([type-name])')) {
        if (adopters.get(literal.getAttribute('kind'))?.has(wanted)) {
          rewrites.push({ kind: 'literal-type', node: literal, type: wanted, edge });
        }
      }
    }
    if (value?.localName === 'ir-closure') {
      rewrites.push({ kind: 'closure-context', node: value, type: expected, edge });
    }
  }
  return rewrites;
}

/** Apply a contextual rewrite plan, reporting structural/type-seed changes. */
export function applyContextualRewrites(graph, rewrites) {
  graph.changed = false;
  for (const rewrite of rewrites) {
    if (rewrite.kind === 'implicit-struct') {
      rewrite.node.setAttribute('type-name', rewrite.type);
      rewrite.node.removeAttribute('implicit');
      rewrite.node.dataset.loweredImplicitStructInit = 'true';
      graph.changed = true;
    } else if (rewrite.kind === 'literal-type') {
      rewrite.node.setAttribute('type-name', rewrite.type);
      graph.changed = true;
    } else if (rewrite.kind === 'closure-context') {
      seedClosure(graph, rewrite.node, rewrite.type, edgeSource(rewrite.edge));
    }
  }
  return graph.changed;
}

/** @deprecated Use planContextualRewrites() and applyContextualRewrites(). */
export function actualizeTypeGraph(graph) {
  applyContextualRewrites(graph, planContextualRewrites(graph));
  return graph;
}

export function solveTypeGraph(graph) {
  const dependents = graph.dependents = new Map();
  graph.rules.forEach(rule => {
    for (const dep of rule.deps) {
      const list = dependents.get(dep) ?? [];
      list.push(rule);
      dependents.set(dep, list);
    }
  });

  const queue = [...graph.rules];
  const queued = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const rule = queue[i];
    queued.delete(rule);
    const type = rule.read();
    if (!type || actual(graph, rule.node) === type) continue;
    setActual(graph, rule.node, type, rule.source);
    for (const next of dependents.get(rule.node) ?? []) {
      if (!queued.has(next)) { queue.push(next); queued.add(next); }
    }
  }
  return graph;
}

export function projectTypeGraph(graph) {
  for (const [node, value] of graph.slots) {
    if (value.project && value.actual) stampType(node, value.actual, value.inferenceSource ?? value.rule?.source ?? 'graph');
  }
  for (const edge of graph.expectations) {
    const expected = edge.read();
    if (!expected || !edge.value?.dataset) continue;
    // DOM attributes are the compact public projection of the richer graph.
    edge.value.dataset.expect ??= expected;
    edge.value.dataset.expectSite ??= edge.site;
    const source = edgeSource(edge);
    const from = sourceId(source);
    if (from) edge.value.dataset.expectFrom ??= source.id || from;
  }
  return graph;
}

/** @deprecated Use projectTypeGraph(). */
export const recordTypeGraph = projectTypeGraph;

export function checkTypeGraph(graph) {
  return reportTypeGraphDiagnostics(graph, {
    actual, actualOrigin, collectFailures, compatible, edgeSource,
    planCoercions, valueForDiagnostic,
  });
}

export const actualType = (graph, node) => actual(graph, node);
/** Compatibility-only query for projected DOM IR without a retained graph. */
export const projectedActualType = node => node?.dataset?.typeName ?? null;
export const expectedTypes = (graph, node) =>
  (graph.slots.get(node)?.expected ?? []).map(edge => edge.read()).filter(Boolean);
export const bindingOf = (graph, node) => graph.scopeGraph
  ? graph.scopeGraph.resolutions.get(node?.id) ?? null
  : projectedBindingOf(graph.doc, node);
/** Compatibility-only binding query for projected DOM IR. */
export const projectedBindingOf = (doc, node) =>
  node?.dataset.bindingId ? doc?.getElementById(node.dataset.bindingId) : null;
export const resolvedFunctionOf = (graph, call) => resolvedFunction(graph, call);
export const resolvedFieldOf = (graph, node) => graph.slots.get(node)?.field ?? null;
export const originOf = (graph, node) => actualOrigin(graph, node);

export function invalidateTypeGraph(graph, changed) {
  const affected = new Set(changed);
  const queue = [...affected];
  for (let i = 0; i < queue.length; i++) {
    for (const rule of graph.dependents?.get(queue[i]) ?? []) {
      if (!affected.has(rule.node)) { affected.add(rule.node); queue.push(rule.node); }
    }
  }
  return affected;
}

export function planCoercions(graph) {
  graph.coercions = [];
  const ctx = { typeIndex: graph.typeIndex };
  for (const edge of graph.expectations) {
    const from = actual(graph, edge.value);
    const to = edge.read();
    const kind = from && to && coercionKind(from, to, ctx);
    if (kind) graph.coercions.push({ node: edge.value, from, to, kind, edge });
  }
  return graph.coercions;
}

function slot(node) {
  return { node, actual: projectedActualType(node), expected: [], function: null, resolution: null };
}

function actual(graph, node) {
  if (graph.slots.has(node)) return graph.slots.get(node).actual;
  return projectedActualType(node);
}

function setActual(graph, node, type, source) {
  const value = graph.slots.get(node);
  if (value) {
    value.actual = type;
    value.inferenceSource = source;
    value.project = true;
  }
}

function rule(graph, node, deps, read, source) {
  const value = { node, deps: deps.filter(Boolean), read, source };
  graph.rules.push(value);
  graph.slots.get(node).rule = value;
}

function expect(graph, value, read, site, source, mode, label) {
  if (!value) return;
  const edge = { value, read, site, source, mode, label };
  graph.expectations.push(edge);
  graph.slots.get(value)?.expected.push(edge);
}

function edgeSource(edge) {
  return typeof edge.source === 'function' ? edge.source() : edge.source;
}

function addActualRule(graph, node) {
  const children = [...(node.children ?? [])];
  const one = node.firstElementChild;
  const two = node.lastElementChild;
  const read = n => actual(graph, n);
  const fixed = (type, source) => rule(graph, node, [], () => type, source);
  if (VOID_NODES.has(node.localName)) return fixed('void', node.localName.slice(3));
  const member = MEMBER_OPERATIONS.get(node.localName);
  if (member) return rule(graph, node, [one], () => memberResult(graph, node, read(one), member), 'return-of');

  switch (node.localName) {
    case 'ir-lit': {
      const kind = node.getAttribute('kind');
      return fixed(node.getAttribute('type-name') ?? graph.literalDefaults.get(kind) ?? kind, 'literal');
    }
    case 'ir-ident':
      return rule(graph, node, [bindingDependency(graph, node)], () => bindingActual(graph, node), 'binding');
    case 'ir-param': {
      const type = declaredTypeStr(node) ?? node.dataset.typeName;
      if (type) graph.slots.get(node).actual = type;
      return;
    }
    case 'ir-let': case 'ir-global':
      return fixed(declaredTypeStr(node) ?? node.dataset.typeName, 'declared');
    case 'ir-self-param': {
      const name = node.closest('ir-fn')?.querySelector(':scope > ir-fn-name');
      const implementation = name?.querySelector(':scope > ir-type-args')?.firstElementChild;
      return fixed(typeNodeToStr(implementation) ?? name?.getAttribute('receiver'), 'self');
    }
    case 'ir-fn': case 'ir-extern-fn':
      // Function declarations seed identifier uses, but stamping their
      // structural signature would make backend callable-type discovery treat
      // every declaration as a first-class function value.
      graph.slots.get(node).actual = fnSignatureType(node);
      return;
    case 'ir-block': case 'ir-paren': {
      const value = node.localName === 'ir-block' ? two : one;
      return rule(graph, node, [value], () => read(value), node.localName === 'ir-block' ? 'tail' : 'identity');
    }
    case 'ir-unary':
      return rule(graph, node, [one], () => operatorResult(graph, node, read(one), UNARY_OP_FN), 'operator');
    case 'ir-binary':
      return rule(graph, node, children, () => operatorResult(graph, node, read(one), BINARY_OP_FN), 'operator');
    case 'ir-if': {
      const then = children[1];
      const otherwise = children[2];
      if (!otherwise) return fixed('void', 'one-arm-if');
      return rule(graph, node, [then, otherwise], () => unifyTypes(read(then), read(otherwise)), 'confluence');
    }
    case 'ir-match': case 'ir-alt': {
      const bodies = [...node.children]
        .filter(child => /-arm$/.test(child.localName))
        .map(arm => arm.lastElementChild).filter(Boolean);
      return rule(graph, node, bodies,
        () => bodies.map(read).reduce((type, next) => unifyTypes(type, next), null), 'confluence');
    }
    case 'ir-promote': {
      const arm = node.querySelector(':scope > ir-promote-arm')?.lastElementChild;
      const fallback = node.querySelector(':scope > ir-default-arm')?.lastElementChild;
      return rule(graph, node, [arm, fallback], () => unifyTypes(read(arm), read(fallback)), 'confluence');
    }
    case 'ir-else':
      return rule(graph, node, [one], () => read(one) && unwrapNullable(read(one)), 'unwrap-nullable');
    case 'ir-call': {
      const callee = node.firstElementChild;
      return rule(graph, node, [...children, callee?.firstElementChild], () => callResult(graph, node), 'return-of');
    }
    case 'ir-await':
      return rule(graph, node, [one], () => awaitedType(read(one), graph), 'awaited-type');
    case 'ir-closure': {
      const body = bodyOf(node);
      const deps = [body, ...paramsOf(node)];
      return rule(graph, node, deps, () => closureType(graph, node, body), 'closure');
    }
    case 'ir-field-access':
      return rule(graph, node, [one], () => fieldActual(graph, node, read(one)), 'field-of');
    case 'ir-struct-init':
      return fixed(node.getAttribute('type-name'), 'struct-init');
    case 'ir-null-ref':
      return fixed(node.getAttribute('type-name') ? `?${node.getAttribute('type-name')}` : 'null', 'null');
    case 'ir-ref-test': case 'ir-ref-is-null':
      return fixed(graph.literalDefaults.get('bool') ?? 'Bool', 'predicate');
    case 'ir-ref-cast':
      return fixed(node.getAttribute('type-name'), 'cast');
    default:
      if (node.dataset?.typeName) fixed(node.dataset.typeName, node.dataset.inferenceSource ?? 'existing');
  }
}

function bindingDependency(graph, ident) {
  const decl = bindingOf(graph, ident);
  if (decl?.localName === 'ir-promote') return decl.firstElementChild;
  if (decl?.localName === 'ir-capture') {
    const source = captureSource(decl);
    return source?.firstElementChild ?? source?.lastElementChild;
  }
  return decl;
}

function bindingActual(graph, ident) {
  const decl = bindingOf(graph, ident);
  if (!decl) return null;
  if (decl.localName === 'ir-fn' || decl.localName === 'ir-extern-fn') {
    return decl.dataset.valueAccessor === 'true' ? fnReturnType(decl) : fnSignatureType(decl);
  }
  if (decl.localName === 'ir-alt-arm') return decl.getAttribute('variant');
  if (decl.localName === 'ir-promote') return unwrapNullable(actual(graph, decl.firstElementChild));
  if (decl.localName === 'ir-capture') {
    const source = captureSource(decl);
    return actual(graph, source?.firstElementChild) ?? actual(graph, source?.lastElementChild);
  }
  return declaredTypeStr(decl) ?? actual(graph, decl);
}

function captureSource(decl) {
  return decl.closest('ir-for')?.querySelector(':scope > ir-for-source');
}

function operatorResult(graph, node, operandType, names) {
  if (!operandType) return null;
  const name = names[node.getAttribute('op')];
  const fn = name && graph.fnIndex.get(`${operandType}:${name}`);
  if (!fn) return operandType;
  rememberFunction(graph, node, fn);
  return fnReturnType(fn);
}

function callResult(graph, call) {
  const fn = resolveCall(graph, call);
  if (fn) return fnReturnType(fn);
  const protocol = resolveProtocolCall(graph, call);
  if (protocol) return protocol.result;
  return callableParts(actual(graph, call.firstElementChild))?.ret ?? null;
}

function resolveCall(graph, call) {
  const known = graph.slots.get(call)?.function;
  const direct = bindingOf(graph, call.firstElementChild);
  const fn = known ?? (isFunctionDecl(direct) ? direct : directCalleeDecl(call, graph.doc)) ?? memberCall(graph, call);
  if (!fn) return null;

  const callee = call.firstElementChild;
  let resolvedAs = callee.localName === 'ir-field-access' ? 'method' : 'static-method';
  if (callee.localName === 'ir-field-access') {
    const recv = callee.firstElementChild;
    if (isTypeNamespace(graph, recv)) {
      clearDiagnostic(recv);
      resolvedAs = 'static-method';
    }
    setActual(graph, callee, fnReturnType(fn), 'return-of');
  }
  rememberFunction(graph, call, fn, { resolvedAs });
  rememberFunction(graph, callee, fn, { resolvedAs });
  clearDiagnostic(call);
  clearDiagnostic(callee);
  return fn;
}

function memberCall(graph, call) {
  const callee = call.firstElementChild;
  if (callee?.localName === 'ir-field-access') {
    const recv = callee.firstElementChild;
    const owner = isTypeNamespace(graph, recv)
      ? recv.getAttribute('name')
      : unwrapNullable(actual(graph, recv) ?? '');
    return memberFn(graph, owner, callee.getAttribute('field'));
  }
  if (callee?.localName !== 'ir-type-member') return null;
  const type = typeNodeToStr(callee.firstElementChild)
    ?? callee.getAttribute('type-name') ?? callee.getAttribute('type');
  const method = callee.getAttribute('method');
  if (callee.dataset.rewriteKind === 'operator-callee') return graph.fnIndex.get(`${type}:${method}`) ?? null;
  return memberFn(graph, type, method);
}

function resolveProtocolCall(graph, call) {
  const callee = call.firstElementChild;
  if (callee?.localName !== 'ir-field-access') return null;
  const owner = unwrapNullable(actual(graph, callee.firstElementChild) ?? '');
  const decl = graph.typeIndex?.get(owner)?.decl;
  if (decl?.localName !== 'ir-proto') return null;
  const member = callee.getAttribute('field');
  const method = [...decl.querySelectorAll(':scope > ir-proto-method')]
    .find(node => node.getAttribute('name') === member);
  if (!method) return null;
  const result = typeNodeToStr(firstTypeChild(method)) ?? 'void';
  const fact = { protocol: owner, member, declaration: method, result };
  graph.slots.get(call).protocolCall = fact;
  graph.slots.get(callee).protocolCall = fact;
  setActual(graph, callee, result, 'protocol-return');
  clearDiagnostic(call);
  clearDiagnostic(callee);
  return fact;
}

function memberFn(graph, owner, member) {
  if (!owner || !member) return null;
  return graph.fnIndex.get(`${owner}.${member}`)
    ?? graph.fnIndex.get(`${owner}__${member}`)
    ?? null;
}

function memberResult(graph, node, owner, member) {
  const fn = memberFn(graph, unwrapNullable(owner ?? ''), member);
  if (!fn) return null;
  rememberFunction(graph, node, fn);
  return fnReturnType(fn);
}

function rememberFunction(graph, node, fn, resolution = null) {
  const value = graph.slots.get(node);
  if (!value) return fn;
  value.function = fn;
  if (resolution) value.resolution = resolution;
  return fn;
}

function isTypeNamespace(graph, node) {
  return node?.localName === 'ir-ident'
    && !bindingOf(graph, node)
    && graph.typeIndex?.has(node.getAttribute('name'));
}

function collectOperationFailures(graph) {
  for (const field of nodesOf(graph, 'ir-field-access')) {
    const owner = actual(graph, field.firstElementChild);
    if (owner?.startsWith('?')) {
      fail(graph, field, DIAGNOSTIC_KINDS.NULLABLE_ACCESS,
        `Cannot access field '${field.getAttribute('field')}' on nullable ${owner}`,
        { field: field.getAttribute('field'), receiverName: owner });
      continue;
    }
    if (field.parentElement?.localName === 'ir-call' && field.parentElement.firstElementChild === field) continue;
    if (owner && !actual(graph, field)) fail(graph, field, DIAGNOSTIC_KINDS.UNKNOWN_FIELD,
      `Unknown field '${field.getAttribute('field')}'`, { field: field.getAttribute('field'), receiverName: owner });
  }

  for (const call of nodesOf(graph, 'ir-call')) {
    checkArity(graph, call);
    const callee = call.firstElementChild;
    if (resolvedFunction(graph, call) || graph.slots.get(call)?.protocolCall
      || callableParts(actual(graph, callee))) continue;
    if (callee?.localName !== 'ir-field-access' && callee?.localName !== 'ir-type-member') continue;
    const recv = callee.firstElementChild;
    const owner = isTypeNamespace(graph, recv) ? recv.getAttribute('name') : actual(graph, recv);
    if (!owner) continue;
    const member = callee.getAttribute('field') ?? callee.getAttribute('method');
    const operator = call.dataset.operatorName;
    const kind = operator ? DIAGNOSTIC_KINDS.UNKNOWN_OPERATOR : DIAGNOSTIC_KINDS.UNKNOWN_METHOD;
    const message = operator
      ? `Cannot resolve operator '${operator}' for ${owner}`
      : `Unknown method '${unwrapNullable(owner)}.${member}'`;
    fail(graph, call, kind, message, { method: member, operator, receiverName: owner });
  }
}

function checkArity(graph, call) {
  const fn = resolvedFunction(graph, call);
  const callee = call.firstElementChild;
  const protocol = graph.slots.get(call)?.protocolCall ?? resolveProtocolCall(graph, call);
  const signature = fn ? paramsOf(fn)
    : protocol ? paramsOf(protocol.declaration)
    : callableParts(actual(graph, callee))?.params;
  if (!signature) return;
  const expected = signature.length;
  const actualCount = call.querySelector(':scope > ir-arg-list')?.children.length ?? 0;
  const receiverArg = fn && graph.slots.get(call)?.resolution?.resolvedAs === 'static-method'
    && fn.querySelector(':scope > ir-fn-name')?.getAttribute('kind') === 'method'
    && actualCount === expected + 1;
  if (receiverArg || actualCount === expected) return;
  const name = fn?.getAttribute('name') ?? callee?.getAttribute('name');
  fail(graph, call, DIAGNOSTIC_KINDS.WRONG_ARITY,
    `Wrong arity: expected ${expected}, got ${actualCount}`, {
      expected, actual: actualCount, function: name,
      relatedNodes: fn ? [{ node: fn, label: `function '${name}' is declared here` }] : [],
    });
}

function clearDiagnostic(node) {
  if (!node?.dataset) return;
  diagnosticFacts(node.ownerDocument).delete(node.id);
  for (const key of ['error', 'errorKind', 'errorMessage', 'errorData']) delete node.dataset[key];
}

function closureType(graph, closure, body) {
  const params = paramsOf(closure).map(param => declaredTypeStr(param) ?? actual(graph, param) ?? 'unknown');
  const ret = typeNodeToStr(firstTypeChild(closure)) ?? actual(graph, body) ?? 'void';
  return callableTypeStr('cl', params, ret);
}

function seedClosure(graph, closure, expectedType, source) {
  const expected = callableParts(expectedType);
  if (!expected) return;
  paramsOf(closure).forEach((param, i) => {
    if (!firstTypeChild(param) && !param.dataset.typeName && expected.params[i]) {
      param.dataset.typeName = expected.params[i];
      graph.slots.get(param).actual = expected.params[i];
      graph.changed = true;
    }
  });
  if (firstTypeChild(closure)) return;
  const body = bodyOf(closure);
  const tail = returnedValue(body?.lastElementChild);
  if (tail) expect(graph, tail, () => expected.ret, 'return', source ?? closure, 'assign');
  for (const ret of body?.querySelectorAll('ir-return') ?? []) {
    const value = ret.firstElementChild;
    if (value && ret !== body.lastElementChild) expect(graph, value, () => expected.ret, 'return', source ?? closure, 'assign');
  }
}

function fieldActual(graph, node, owner) {
  const entry = owner && graph.typeIndex?.get(unwrapNullable(owner));
  const fieldName = node.getAttribute('field');
  if (entry?.decl?.localName === 'ir-proto') {
    const declaration = [...entry.decl.children].find(member =>
      ['ir-proto-get', 'ir-proto-set', 'ir-proto-get-set'].includes(member.localName)
      && member.getAttribute('name') === fieldName);
    const type = declaredTypeStr(declaration);
    if (!type) return null;
    graph.slots.get(node).field = { owner: unwrapNullable(owner), type, index: null, declaration };
    return type;
  }
  const index = entry?.fields?.findIndex(field => field.name === fieldName) ?? -1;
  if (index < 0) return null;
  const field = entry.fields[index];
  const fact = graph.slots.get(node).field = {
    owner: unwrapNullable(owner), type: field.type, index,
    declaration: fieldDecl(entry, field.name),
  };
  return field.type;
}

function awaitedType(type, graph) {
  const entry = graph.typeIndex?.get(unwrapNullable(type ?? ''));
  return isInstanceOf(entry, 'Promise') ? moduleArgsOf(entry)[0] ?? null : null;
}

function addExpectations(graph, node) {
  const tag = node.localName;
  if (tag === 'ir-let' || tag === 'ir-global') {
    const type = declaredTypeStr(node);
    if (type) expect(graph, node.lastElementChild, () => type, 'binding', firstTypeChild(node) ?? node, 'assign');
  }
  if (tag === 'ir-assign') {
    const [target, value] = [...node.children];
    expect(graph, value, () => actual(graph, target), 'assign', () => declaredSource(graph, target), 'assign');
  }
  if (tag === 'ir-call') {
    const args = [...(node.querySelector(':scope > ir-arg-list')?.children ?? [])];
    args.forEach((arg, index) => expect(graph, arg,
      () => callParameter(graph, node, args, index)?.type,
      'argument', () => callParameter(graph, node, args, index)?.source ?? node.firstElementChild, 'assign'));
  }
  if (tag === 'ir-struct-init') {
    const entry = graph.typeIndex?.get(node.getAttribute('type-name'));
    for (const field of node.querySelectorAll(':scope > ir-field-init')) {
      const info = entry?.fields?.find(item => item.name === field.getAttribute('field'));
      if (info) expect(graph, field.firstElementChild, () => info.type, 'field', fieldDecl(entry, info.name), 'assign');
    }
  }
  if (tag === 'ir-fn' || tag === 'ir-export-main' || tag === 'ir-closure') {
    addReturnExpectations(graph, node);
  }
  if (tag === 'ir-if' || tag === 'ir-while' || tag === 'ir-assert') {
    const name = tag.slice(3);
    expect(graph, node.firstElementChild, () => 'Bool', 'condition', node, 'assign',
      () => name === 'assert' ? 'assert condition must be Bool' : `${name} condition must be Bool`);
  }
  if (tag === 'ir-if') addConfluence(graph, node, [...node.children].slice(1));
  if (tag === 'ir-match' || tag === 'ir-alt' || tag === 'ir-promote') {
    addConfluence(graph, node, [...node.children]
      .filter(child => /-arm$/.test(child.localName)).map(arm => arm.lastElementChild));
  }
  if (tag === 'ir-else') {
    const [value, fallback] = [...node.children];
    expect(graph, value, () => 'nullable', 'orelse', node, 'nullable', () => 'orelse requires a nullable value');
    expect(graph, fallback, () => unwrapNullable(actual(graph, value) ?? ''), 'orelse', value, 'assign');
  }
}

function addReturnExpectations(graph, surface) {
  const type = surface.localName === 'ir-closure'
    ? typeNodeToStr(firstTypeChild(surface)) : fnReturnType(surface);
  if (!type || type === 'void') return;
  const body = bodyOf(surface);
  const source = firstTypeChild(surface) ?? surface;
  const tail = returnedValue(body?.lastElementChild);
  if (tail) expect(graph, tail, () => type, 'return', source, 'assign');
  for (const ret of body?.querySelectorAll('ir-return') ?? []) {
    if (ret !== body.lastElementChild
      && ret.closest('ir-fn, ir-export-main, ir-closure') === surface
      && ret.firstElementChild) {
      expect(graph, ret.firstElementChild, () => type, 'return', source, 'assign');
    }
  }
}

function declaredSource(graph, node) {
  if (node?.localName === 'ir-ident') {
    const decl = bindingOf(graph, node);
    if (decl) return firstTypeChild(decl) ?? decl;
  }
  if (node?.localName === 'ir-field-access') {
    return resolvedFieldOf(graph, node)?.declaration ?? node;
  }
  return node;
}

function callParameter(graph, call, args, index) {
  const fn = resolvedFunction(graph, call);
  if (!fn) {
    const protocol = graph.slots.get(call)?.protocolCall;
    const param = protocol ? paramsOf(protocol.declaration)[index] : null;
    const type = declaredTypeStr(param)
      ?? callableParts(actual(graph, call.firstElementChild))?.params[index];
    return type && { type, source: param ?? call.firstElementChild };
  }
  const params = paramsOf(fn);
  const receiverType = call.dataset.operatorReceiverName
    ?? call.firstElementChild?.getAttribute('type-name')
    ?? call.firstElementChild?.querySelector(':scope > ir-type-ref')?.getAttribute('name');
  // Lowered receiver methods carry self as argument zero, while paramsOf
  // intentionally excludes ir-self-param.
  const offset = graph.slots.get(call)?.resolution?.resolvedAs === 'static-method'
    && selfParamOf(fn) && args.length === params.length + 1 ? 1 : 0;
  if (offset && index === 0) return receiverType && { type: receiverType, source: selfParamOf(fn) };
  const param = params[index - offset];
  // Operator declarations use inferred `&` parameters with no explicit type
  // children. At a lowered call site those parameters are the concrete
  // receiver type (I64:add, F32:mul, and so on).
  const type = declaredTypeStr(param) ?? param?.dataset.typeName
    ?? (fn.getAttribute('receiver') === '&' ? receiverType : null);
  return type && { type, source: param ?? fn };
}

function resolvedFunction(graph, call) {
  const resolved = graph.slots.get(call)?.function;
  if (isFunctionDecl(resolved)) return resolved;
  const direct = bindingOf(graph, call?.firstElementChild);
  return isFunctionDecl(direct) ? direct : directCalleeDecl(call, graph.doc);
}

function fieldDecl(entry, name) {
  return [...(entry?.decl?.querySelectorAll(':scope > ir-field') ?? [])]
    .find(field => field.getAttribute('name') === name) ?? entry?.decl;
}

function addConfluence(graph, owner, values) {
  const branches = values.filter(Boolean);
  const first = branches[0];
  for (const branch of branches) {
    const readUnified = () => {
      const unified = actual(graph, owner) ?? actual(graph, first);
      if (unified !== 'null') return unified;
      return graph.slots.get(owner)?.expected?.map(edge => edge.read()).find(type => type && type !== 'null') ?? unified;
    };
    const message = expected => `other branch has type ${expected}`;
    // The block needs the unified backend result type, while its returned
    // expression needs the same context to type literals such as bare null.
    expect(graph, branch, readUnified, 'confluence', first, 'unify', message);
    let value = branch;
    while (value?.localName === 'ir-block' || value?.localName === 'ir-paren') value = value.lastElementChild;
    value = returnedValue(value);
    if (value?.localName === 'ir-lit' && value.getAttribute('kind') === 'null') {
      expect(graph, value, readUnified, 'confluence', first, 'unify', message);
    }
  }
}

function compatible(mode, actualType, expected, ctx) {
  if (mode === 'nullable') return actualType.startsWith('?');
  if (mode === 'unify') return actualType === 'null' || expected === 'null'
    || isAssignable(actualType, expected, ctx) || isAssignable(expected, actualType, ctx);
  return isAssignable(actualType, expected, ctx);
}

function coercionKind(from, to, ctx) {
  if (from === to || !isAssignable(from, to, ctx)) return null;
  const a = callableParts(from);
  const b = callableParts(to);
  if (a?.kind === 'fun' && b?.kind === 'cl') return 'fun-to-cl';
  if (to.startsWith('?')) return 'nullable-widen';
  return 'variant-to-enum';
}

function collectFailures(graph) {
  graph.failures = [];
  // Explicit type references are checked by linkTypeDecls, but inferred types
  // can become stale across module hoisting. Report those as diagnostics too
  // instead of letting debug assertions or codegen crash on an unknown name.
  for (const [node, typeSlot] of graph.slots) {
    const type = typeSlot.actual;
    if (type && !knownType(graph, type)) {
      fail(graph, node, DIAGNOSTIC_KINDS.UNKNOWN_TYPE, `Unknown inferred type '${type}'`, { type });
    }
  }
  for (const node of nodesOf(graph, 'ir-await')) {
    const input = actual(graph, node.firstElementChild);
    if (input && !actual(graph, node)) fail(graph, node, DIAGNOSTIC_KINDS.INVALID_AWAIT,
      `Cannot await non-promise ${input}`, { actual: input });
  }
  for (const call of nodesOf(graph, 'ir-call')) {
    const callee = call.firstElementChild;
    const type = actual(graph, callee);
    if (type && !resolvedFunction(graph, call) && !callableParts(type)
      && callee.localName !== 'ir-field-access' && callee.localName !== 'ir-type-member') {
      fail(graph, call, DIAGNOSTIC_KINDS.NOT_CALLABLE, `Cannot call value of type ${type}`, { actual: type });
    }
  }
  for (const node of nodesOf(graph, 'ir-binary', 'ir-unary', 'ir-index', 'ir-slice')) {
    const input = actual(graph, node.firstElementChild) ?? 'unknown';
    fail(graph, node, DIAGNOSTIC_KINDS.UNKNOWN_OPERATOR,
      `Cannot resolve operator for ${input}`, { operandType: input });
  }
  collectOperationFailures(graph);
}

function knownType(graph, type) {
  const name = unwrapNullable(type);
  if (name === '&' || name === 'nullable' || name === 'unknown') return true;
  const callable = callableParts(name);
  if (callable) return [...callable.params, callable.ret]
    .every(part => part === 'void' || knownType(graph, part));
  return INFERRED_PRIMITIVES.has(name) || graph.typeIndex?.has(name);
}

function fail(graph, node, kind, message, data) {
  graph.failures.push({ node, kind, message, data });
}

function actualOrigin(graph, node, seen = new Set()) {
  if (!node || seen.has(node)) return null;
  seen.add(node);
  if (node.localName === 'ir-ident') {
    const declaration = bindingOf(graph, node);
    if (declaration) return declaration;
  }
  if (node.localName === 'ir-call') {
    const fn = resolvedFunction(graph, node);
    if (fn) return fn;
  }
  const rule = graph.slots.get(node)?.rule;
  const same = rule?.deps.find(dep => actual(graph, dep) === actual(graph, node));
  return same ? actualOrigin(graph, same, seen) ?? same : null;
}

function collectLiteralDefaults(graph) {
  return collectLiteralFacts(graph, 'type-name', value => value);
}

function collectLiteralAdopters(graph) {
  return collectLiteralFacts(graph, 'adopts', value => new Set(value.split(/\s+/).filter(Boolean)));
}

function collectLiteralFacts(graph, attr, parse) {
  const facts = new Map();
  const defaults = nodesOf(graph, 'ir-default')
    .filter(node => node.parentElement?.localName === 'ir-literal-defaults');
  for (const entry of defaults) {
    const kind = entry.getAttribute('kind');
    const value = entry.getAttribute(attr);
    if (kind && value) facts.set(kind, parse(value));
  }
  return facts;
}

function unwrapParens(node) {
  while (node?.localName === 'ir-paren') node = node.firstElementChild;
  return node;
}

function returnedValue(node) {
  return node?.localName === 'ir-return' ? node.firstElementChild : node;
}

function valueForDiagnostic(node) {
  if (node?.localName === 'ir-block') return valueForDiagnostic(node.lastElementChild);
  if (node?.localName === 'ir-return') return valueForDiagnostic(node.firstElementChild);
  return node;
}
