import { foreignActual } from './foreign-abi.js';
import { foreignAssignmentType } from './foreign-lowering.js';
import { arrayElementType, literalArrayElement } from './array-literal-defaults.js';
// type-graph.js — build, solve, then check the program's type graph

import {
  argCount, argsOf, bodyOf, childOf, childrenOf, closestOf, declaredTypeStr, directCalleeDecl, firstTypeChild,
  fnNameOf, fnReturnType, fnSignatureType, isFunctionDecl, paramsOf, selfParamOf, setDataIfAbsent, sourceId,
  stampType, typeArgsOf, typeNodeToStr,
} from './ir-helpers.js';
import { diagnosticFacts, DIAGNOSTIC_KINDS } from './diagnostics.js';
import { BINARY_OP_FN, UNARY_OP_FN } from './operator-specs.js';
import { callableParts, callableTypeStr, INFERRED_PRIMITIVES, isAssignable, unifyTypes, unwrapNullable } from './type-rules.js';
import { isInstanceOf, moduleArgsOf } from './module-names.js';
import { retainedGraphs } from './graph-store.js';
import { tupleParts, tupleTypeStr } from './type-strings.js';
import { buildProgramIndex, nodesOf } from './program-index.js';
import { reportTypeGraphDiagnostics } from './type-graph-diagnostics.js';
import { NO_EDGES, TypeFacts } from './fact-store.js';


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

/** An array of `size` undefineds with fast, packed elements. */
function denseArray(size) {
  return new Array(size).fill(undefined);
}

/** @returns {TypeGraph} */
export function buildTypeGraph(doc, typeIndex) {
  const root = doc?.body?.firstChild;
  const retained = retainedGraphs(doc);
  const programIndex = retained.program ?? buildProgramIndex(doc);
  const graph = {
    doc, root, typeIndex, programIndex, programRevision: programIndex.revision,
    byKind: programIndex.byKind, nodesByKind: programIndex.byKind,
    scopeGraph: retained.scope, facts: null, slots: null, rules: [], expectations: [],
    failures: [], coercions: [], changed: false,
    nativeMember: (owner, member) => memberFn(graph, owner, member),
  };
  // One row of facts per node, in document order; `slots` reads them as objects.
  const facts = graph.facts = new TypeFacts(doc, root ? programIndex.all : []);
  graph.slots = facts.views();
  if (!root) return graph;
  for (let r = 0; r < facts.nodes.length; r++) facts.setTypeName(r, facts.nodes[r].getAttribute('data-type-name'));

  // Each identifier's declaration, by its index: bindingOf is the solver's
  // hottest query. (Only identifiers are resolved; others ask the scope graph.)
  const resolutions = graph.scopeGraph?.resolutions;
  if (resolutions) {
    const bindings = graph.bindings = denseArray(doc.count);
    for (const ident of programIndex.byKind.get('ir-ident') ?? []) {
      const decl = resolutions.get(ident.id);
      if (decl !== undefined) bindings[ident.$] = decl;
    }
  }
  graph.fnIndex = programIndex.functions;
  graph.literalDefaults = collectLiteralDefaults(graph);
  for (const node of facts.nodes) {
    addActualRule(graph, node);
    addExpectations(graph, node);
  }
  return graph;
}

export function settleTypeGraph(doc, typeIndex) {
  // Build and solve once; each round of contextual rewrites (literal types,
  // closure parameters, record and array types) then re-solves only the rules
  // of the nodes it changed and their dependents.
  const graph = buildTypeGraph(doc, typeIndex);
  // Written types do not change while settling (rewrites set attributes and
  // parameter types, never type nodes), so each is read off the IR once.
  graph.declaredTypes = new Map();
  try {
    solveTypeGraph(graph);
    for (;;) {
      applyContextualRewrites(graph, planContextualRewrites(graph));
      if (!graph.changed) { planCoercions(graph); return graph; }
      propagate(graph, [...graph.touched].map(node => ruleOf(graph, node)).filter(Boolean));
    }
  } finally {
    graph.declaredTypes = null;
  }
}

/** declaredTypeStr(node), remembered while the graph settles. */
function declared(graph, node) {
  const cache = graph.declaredTypes;
  if (!cache || !node) return declaredTypeStr(node);
  let type = cache.get(node);
  if (type === undefined) {
    type = declaredTypeStr(node);
    cache.set(node, type);
  }
  return type;
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
    // `[a, b]` adopts a native `Array[T]` or a declared host array type from context.
    const arrayContext = graph.typeIndex?.get(unwrapNullable(expected));
    if (value?.localName === 'ir-array-lit' && !value.getAttribute('type-name') && !assignsOpenArray(graph, value)
        && (arrayContext?.foreign || arrayContext?.kind === 'wasm-array')) {
      rewrites.push({ kind: 'array-type', node: value, type: unwrapNullable(expected), edge });
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
      for (const literal of operandLiterals(value)) {
        if (adopters.get(literal.getAttribute('kind'))?.has(wanted)) {
          rewrites.push({ kind: 'literal-type', node: literal, type: wanted, edge });
        }
      }
    }
    if (value?.localName === 'ir-closure') {
      rewrites.push({ kind: 'closure-context', node: value, type: expected, edge });
    }
    // `let handler = cl(event) {...}; target.on("x", handler)` — an untyped
    // closure binding takes its parameter types from its first contextual use.
    const binding = value?.localName === 'ir-ident' ? bindingOf(graph, value) : null;
    const bound = binding?.localName === 'ir-let' && !declaredTypeStr(binding) ? binding.lastElementChild : null;
    // `let xs = [...]` takes its array type from the first place `xs` needs one:
    // a declaration slot makes it a JS array, a native context an `Array[T]`.
    if (isUntypedArray(bound) && (arrayContext?.foreign || arrayContext?.kind === 'wasm-array' && isOpenArray(bound))) {
      rewrites.push({ kind: 'array-type', node: bound, type: unwrapNullable(expected), edge });
    }
    // …or from an array assigned to it: `xs = [1.5, 2.5]`.
    const assignment = value?.parentElement?.localName === 'ir-assign' && value.parentElement.lastElementChild === value ? value.parentElement : null;
    const target = assignment?.firstElementChild?.localName === 'ir-ident' ? bindingOf(graph, assignment.firstElementChild) : null;
    const initial = target?.localName === 'ir-let' && !declaredTypeStr(target) ? target.lastElementChild : null;
    const assigned = actual(graph, value);
    if (isOpenArray(initial) && assigned && graph.typeIndex?.get(assigned)?.kind === 'wasm-array') {
      rewrites.push({ kind: 'array-type', node: initial, type: assigned, edge });
    }
    if (bound?.localName === 'ir-closure' && paramsOf(bound).some(p => !firstTypeChild(p) && !p.getAttribute('data-type-name'))) {
      rewrites.push({ kind: 'closure-context', node: bound, type: expected, edge });
    }
  }
  // `16 + x * 40` with `x: F64`: an untyped literal operand adopts its sibling's type.
  for (const binary of nodesOf(graph, 'ir-binary')) {
    const [left, right] = [...binary.children];
    for (const [literal, other] of [[left, right], [right, left]]) {
      if (literal?.localName !== 'ir-lit' || literal.getAttribute('type-name')) continue;
      const wanted = actual(graph, other);
      // Adopting the literal's own default is a no-op, and could pin a still-provisional type.
      if (wanted && wanted !== graph.literalDefaults.get(literal.getAttribute('kind'))
          && adopters.get(literal.getAttribute('kind'))?.has(wanted)) rewrites.push({ kind: 'literal-type', node: literal, type: wanted });
    }
  }
  // `let items = []; items.push(x)`: a member native arrays lack (`push`,
  // `length`, `join`, …) means a JS array.
  for (const access of nodesOf(graph, 'ir-field-access')) {
    const base = access.firstElementChild;
    const declaration = base?.localName === 'ir-ident' ? bindingOf(graph, base) : null;
    const init = base?.localName === 'ir-array-lit' ? base
      : declaration?.localName === 'ir-let' && !declaredTypeStr(declaration) ? declaration.lastElementChild : null;
    const native = actual(graph, base);
    if (!isUntypedArray(init) || !native || graph.nativeMember(native, access.getAttribute('field'))) continue;
    const host = hostArrayType(graph, arrayElementType(init, child => actual(graph, child)));
    if (host) rewrites.push({ kind: 'array-type', node: init, type: host });
  }
  return rewrites;
}

/**
 * The host `Array<T>` type for a literal becoming a JS array, when declarations
 * that include it are loaded. Primitive and host elements keep their type
 * (`["a", "b"]` is `Str[]`); anything else is `any[]`.
 */
function hostArrayType(graph, element = null) {
  const abi = graph.doc.__utuForeign;
  for (const [index, schema] of abi?.schemas.entries() ?? []) {
    const ref = Object.hasOwn(schema.names, 'Array') ? schema.names.Array : schema.types.findIndex(type => type?.lib === 'Array');
    if (ref === -1) continue;
    const foreign = element && abi.values.get(element);
    const argument = ['Str', 'F64', 'Bool'].includes(element) ? element
      : foreign ? foreign.index === index ? foreign.ref : { external: foreign } : 'any';
    return abi.type(index, { template: ref, arguments: [argument] }, graph);
  }
  return null;
}

/** `xs = [...]` where `xs` was declared `let xs = []`: the open array adopts this value's type instead. */
function assignsOpenArray(graph, value) {
  const assignment = value.parentElement?.localName === 'ir-assign' && value.parentElement.lastElementChild === value ? value.parentElement : null;
  const target = assignment?.firstElementChild?.localName === 'ir-ident' ? bindingOf(graph, assignment.firstElementChild) : null;
  return target?.localName === 'ir-let' && !declaredTypeStr(target) && isOpenArray(target.lastElementChild);
}

/** An array literal whose representation is still decided by context. */
function isUntypedArray(node) {
  return node?.localName === 'ir-array-lit' && !node.getAttribute('type-name');
}

/** An empty, untyped `[]` whose element type is still open. */
function isOpenArray(node) {
  return node?.localName === 'ir-array-lit' && !node.children.length && !node.getAttribute('type-name');
}

const OPERATOR_TREE = new Set(['ir-binary', 'ir-unary', 'ir-paren']);

/** Untyped literals that are operands of an operator tree, not nested in calls or indexes. */
function operandLiterals(node, found = []) {
  for (const child of node.children) {
    if (child.localName === 'ir-lit' && !child.getAttribute('type-name')) found.push(child);
    else if (OPERATOR_TREE.has(child.localName)) operandLiterals(child, found);
  }
  return found;
}

/** Apply a contextual rewrite plan, reporting structural/type-seed changes. */
export function applyContextualRewrites(graph, rewrites) {
  graph.changed = false;
  graph.touched = new Set();
  const touch = node => { graph.touched.add(node); graph.changed = true; };
  for (const rewrite of rewrites) {
    if (rewrite.kind === 'implicit-struct') {
      rewrite.node.setAttribute('type-name', rewrite.type);
      rewrite.node.removeAttribute('implicit');
      rewrite.node.setAttribute('data-lowered-implicit-struct-init', 'true');
      touch(rewrite.node);
    } else if (rewrite.kind === 'array-type') {
      // The first context decides; a conflicting later use is then a type error.
      if (rewrite.node.getAttribute('type-name')) continue;
      rewrite.node.setAttribute('type-name', rewrite.type);
      touch(rewrite.node);
    } else if (rewrite.kind === 'literal-type') {
      rewrite.node.setAttribute('type-name', rewrite.type);
      touch(rewrite.node);
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

/** Rules that read a node, by the node's index. Reads like a Map from nodes to rule lists. */
class DependentTable {
  constructor(size) {
    this.byIndex = denseArray(size);
    this.nodes = denseArray(size);
  }
  get(node) {
    if (node == null || this.nodes[node.$] !== node) return undefined;
    return this.byIndex[node.$];
  }
  add(node, rule) {
    const i = node.$;
    if (this.nodes[i] !== node) {
      this.nodes[i] = node;
      this.byIndex[i] = [rule];
    } else {
      this.byIndex[i].push(rule);
    }
  }
}

export function solveTypeGraph(graph) {
  const dependents = graph.dependents = new DependentTable(graph.doc?.count ?? 0);
  const rules = graph.rules;
  for (let r = 0; r < rules.length; r++) {
    const deps = rules[r].deps;
    for (let d = 0; d < deps.length; d++) dependents.add(deps[d], rules[r]);
  }

  propagate(graph, rules);
  return graph;
}

/** Run `rules`, then every rule depending on a node whose type changed, to a fixed point. */
function propagate(graph, rules) {
  const queue = rules.slice();
  // A rule is queued at most once at a time: `queued` holds its position marker.
  const queued = new Uint8Array(graph.rules.length);
  for (let i = 0; i < queue.length; i++) queued[queue[i].index] = 1;
  for (let i = 0; i < queue.length; i++) {
    const rule = queue[i];
    queued[rule.index] = 0;
    const type = rule.read();
    if (!type || actual(graph, rule.node) === type) continue;
    setActual(graph, rule.node, type, rule.source);
    const next = graph.dependents.get(rule.node);
    if (next === undefined) continue;
    for (let k = 0; k < next.length; k++) {
      const dependent = next[k];
      if (!queued[dependent.index]) { queue.push(dependent); queued[dependent.index] = 1; }
    }
  }
}

export function projectTypeGraph(graph) {
  for (const [node, value] of graph.slots) {
    if (value.project && value.actual) stampType(node, value.actual, value.inferenceSource ?? value.rule?.source ?? 'graph');
  }
  for (const edge of graph.expectations) {
    const expected = edge.read();
    const value = edge.value;
    if (!expected || value?.nodeType !== 1) continue;
    // DOM attributes are the compact public projection of the richer graph.
    setDataIfAbsent(value, 'data-expect', expected);
    setDataIfAbsent(value, 'data-expect-site', edge.site);
    const source = edgeSource(edge);
    const from = sourceId(source);
    if (from) setDataIfAbsent(value, 'data-expect-from', source.id || from);
  }
  return graph;
}

/** @deprecated Use projectTypeGraph(). */
export const recordTypeGraph = projectTypeGraph;

export function checkTypeGraph(graph) {
  return reportTypeGraphDiagnostics(graph, {
    actual, actualOrigin, collectFailures, compatible, edgeSource,
    knownType, planCoercions, valueForDiagnostic,
  });
}

export const actualType = (graph, node) => actual(graph, node);
/** The type a declaration binds its name to (a `promote` binds the unwrapped value, not its own result). */
export function declarationType(graph, decl) {
  if (decl?.localName === 'ir-promote') return unwrapNullable(actual(graph, decl.firstElementChild) ?? '') || null;
  if (decl?.localName === 'ir-alt-arm') return decl.getAttribute('variant');
  return actual(graph, decl);
}
/** Compatibility-only query for projected DOM IR without a retained graph. */
export const projectedActualType = node => node?.getAttribute?.('data-type-name') ?? null;
export const expectedTypes = (graph, node) =>
  (graph.slots.get(node)?.expected ?? []).map(edge => edge.read()).filter(Boolean);
export const bindingOf = (graph, node) => {
  if (!graph.scopeGraph) return projectedBindingOf(graph.doc, node);
  if (node == null) return graph.scopeGraph.resolutions.get(undefined) ?? null;
  // Identifiers indexed when the graph was built answer from the array.
  if (graph.bindings !== undefined && node.localName === 'ir-ident' && graph.facts.rowOf(node) >= 0) {
    return graph.bindings[node.$] ?? null;
  }
  return graph.scopeGraph.resolutions.get(node.id) ?? null;
};
/** Compatibility-only binding query for projected DOM IR. */
export const projectedBindingOf = (doc, node) =>
  node?.attr?.('data-binding-id') ? doc?.getElementById(node.attr('data-binding-id')) : null;
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


const FN = new Set(['ir-fn']);
const FOR = new Set(['ir-for']);
const FUNCTION_SCOPES = new Set(['ir-fn', 'ir-closure']);
const RETURN_SURFACES = new Set(['ir-fn', 'ir-export-main', 'ir-closure']);

function actual(graph, node) {
  const r = graph.facts.rowOf(node);
  if (r >= 0) return graph.facts.typeName(r);
  return projectedActualType(node);
}

function setActual(graph, node, type, source) {
  const { facts } = graph;
  const r = facts.rowOf(node);
  if (r >= 0) {
    facts.setTypeName(r, type);
    facts.source[r] = source;
    facts.project[r] = 1;
  }
}

/** The edges expecting something of `node` (shared empty list when none). */
function expectedOf(graph, node) {
  const r = graph.facts.rowOf(node);
  return r >= 0 ? graph.facts.expected[r] : undefined;
}

function ruleOf(graph, node) {
  const r = graph.facts.rowOf(node);
  return r >= 0 ? graph.facts.rule[r] : undefined;
}

function functionOf(graph, node) {
  const r = graph.facts.rowOf(node);
  return r >= 0 ? graph.facts.function[r] : undefined;
}

function rareFactOf(graph, node, key) {
  const r = graph.facts.rowOf(node);
  return r >= 0 ? graph.facts.rareFact(r, key) : undefined;
}

// ── Rules and expectation edges ──────────────────────────────────────────────
//
// A rule computes one node's actual type from other nodes; an edge says what
// type a value is expected to have. Both are records with a kind, read by a
// switch, not closures: there are a few per IR node.

const R = Object.freeze({
  FIXED: 0, MEMBER: 1, LITERAL: 2, IDENT: 3, PARAM: 4, BINDING: 5, VALUE: 6, UNARY: 7, BINARY: 8,
  TUPLE: 9, TUPLE_GET: 10, CONFLUENCE: 11, UNWRAP: 12, CALL: 13, AWAIT: 14, CLOSURE: 15,
  TYPE_MEMBER: 16, FIELD: 17, STRUCT: 18, ARRAY: 19,
});

class Rule {
  constructor(graph, node, deps, kind, a, b, source, index) {
    this.graph = graph;
    this.node = node;
    this.deps = deps;
    this.kind = kind;
    this.a = a;
    this.b = b;
    this.source = source;
    this.index = index;
  }

  read() {
    const { graph, node, a } = this;
    switch (this.kind) {
      case R.FIXED: return a;
      case R.MEMBER: return foreignActual(graph, node) ?? memberResult(graph, node, actual(graph, a), this.b);
      // Read lazily: contextual rewrites retype literals between solver rounds.
      case R.LITERAL: return node.getAttribute('type-name') ?? graph.literalDefaults.get(a) ?? a;
      case R.IDENT: return bindingActual(graph, node);
      // Closure parameters may be seeded from context between solver rounds.
      case R.PARAM: return declared(graph, node) ?? node.getAttribute('data-type-name');
      case R.BINDING: return declared(graph, node) ?? actual(graph, a);
      case R.VALUE: return actual(graph, a);
      case R.UNARY: return operatorResult(graph, node, actual(graph, a), UNARY_OP_FN);
      case R.BINARY: return foreignActual(graph, node) ?? operatorResult(graph, node, actual(graph, a), BINARY_OP_FN);
      case R.TUPLE: {
        const parts = a.map(child => actual(graph, child));
        return parts.every(Boolean) ? tupleTypeStr(parts) : null;
      }
      case R.TUPLE_GET: {
        // A mismatched let .{…} is reported once, at element 0; its names get no type.
        const parts = tupleParts(actual(graph, a));
        return parts?.length === Number(node.getAttribute('count')) ? parts[Number(node.getAttribute('index'))] : null;
      }
      case R.CONFLUENCE: return confluence(graph, node, a.map(child => actual(graph, child)));
      case R.UNWRAP: return actual(graph, a) && unwrapNullable(actual(graph, a));
      case R.CALL: return callResult(graph, node);
      case R.AWAIT: return awaitedType(actual(graph, a), graph);
      case R.CLOSURE: return closureType(graph, node, a);
      case R.TYPE_MEMBER: return foreignActual(graph, node);
      case R.FIELD: return foreignActual(graph, node) ?? fieldActual(graph, node, actual(graph, a));
      case R.STRUCT: return foreignActual(graph, node) ?? node.getAttribute('type-name');
      case R.ARRAY: return foreignActual(graph, node) ?? nativeArrayType(graph, node);
      default: throw new Error(`type graph: unknown rule kind ${this.kind}`);
    }
  }
}

function rule(graph, node, deps, kind, a, b, source) {
  // An assigned value may take its type from the assignment target's declared
  // slot (a host property), so it is re-read when the target resolves.
  const assignment = node.parentElement?.localName === 'ir-assign' && node.parentElement.lastElementChild === node ? node.parentElement : null;
  if (assignment) deps = [...deps, assignment.firstElementChild];
  // An operand may take its type from the other operand (`item.price * 2`).
  if (node.parentElement?.localName === 'ir-binary') deps = [...deps, ...[...node.parentElement.children].filter(c => c !== node)];
  const value = new Rule(graph, node, deps.filter(Boolean), kind, a, b, source, graph.rules.length);
  graph.rules.push(value);
  graph.facts.rule[graph.facts.rowOf(node)] = value;
}

const E = Object.freeze({
  CONST: 0, DECLARED: 1, ASSIGN: 2, ARGUMENT: 3, TUPLE_PART: 4, ELEMENT: 5, FIELD_INIT: 6,
  ACTUAL: 7, CONFLUENCE: 8, UNWRAP: 9,
});

class Edge {
  constructor(graph, value, kind, a, b, c, site, source, mode, label) {
    this.graph = graph;
    this.value = value;
    this.kind = kind;
    this.a = a;
    this.b = b;
    this.c = c;
    this.site = site;
    this.ownSource = source;
    this.mode = mode;
    this.label = label;
  }

  read() {
    const { graph, a } = this;
    switch (this.kind) {
      case E.CONST: return a;
      case E.DECLARED: return a ?? actual(graph, this.b);
      case E.ASSIGN: return foreignAssignmentType(graph, a) ?? actual(graph, this.b);
      case E.ARGUMENT: return callParameter(graph, a, this.b, this.c)?.type;
      case E.TUPLE_PART: return tupleParts(expectedType(graph, a))?.[this.c];
      case E.ELEMENT: return rareFactOf(graph, a, 'foreign')?.params[this.c] ?? (this.b ? arrayElementContext(graph, a) : undefined);
      case E.FIELD_INIT: return fieldInitInfo(graph, a, this.b).field?.type;
      case E.ACTUAL: return actual(graph, a);
      case E.CONFLUENCE: return unifiedBranchType(graph, a, this.b);
      case E.UNWRAP: return unwrapNullable(actual(graph, a) ?? '');
      default: throw new Error(`type graph: unknown expectation kind ${this.kind}`);
    }
  }

  /** What the expectation comes from; some are only known once calls and fields resolve. */
  get source() {
    const { graph, a } = this;
    switch (this.kind) {
      case E.ASSIGN: return declaredSource(graph, this.b);
      case E.ARGUMENT: return callParameter(graph, a, this.b, this.c)?.source ?? a.firstElementChild;
      case E.FIELD_INIT: {
        const { entry, field } = fieldInitInfo(graph, a, this.b);
        return field ? fieldDecl(entry, field.name) : a;
      }
      default: return this.ownSource;
    }
  }
}

function expect(graph, value, kind, a, b, c, site, source, mode, label) {
  if (!value) return;
  const edge = new Edge(graph, value, kind, a, b, c, site, source, mode, label);
  graph.expectations.push(edge);
  const { facts } = graph;
  const r = facts.rowOf(value);
  if (r >= 0) {
    if (facts.expected[r] === NO_EDGES) facts.expected[r] = [edge];
    else facts.expected[r].push(edge);
  }
}

/** A struct literal's field and its declaration, read lazily: an implicit `&{…}` learns its type between solver rounds. */
function fieldInitInfo(graph, node, field) {
  const entry = graph.typeIndex?.get(node.getAttribute('type-name'));
  return { entry, field: entry?.fields?.find(item => item.name === field.getAttribute('field')) };
}

/** The first type this node is expected to have, if any. */
function expectedType(graph, node) {
  for (const edge of expectedOf(graph, node) ?? []) {
    const type = edge.read();
    if (type) return type;
  }
  return null;
}

function edgeSource(edge) {
  return typeof edge.source === 'function' ? edge.source() : edge.source;
}

function addActualRule(graph, node) {
  const one = node.firstElementChild;
  const two = node.lastElementChild;
  // A copy: rules keep it, and lowerings edit the live list later.
  const children = () => [...node.children];
  const fixed = (type, source) => rule(graph, node, [], R.FIXED, type, null, source);

  switch (node.localName) {
    case 'ir-assign': case 'ir-while': case 'ir-for': case 'ir-loop-match': case 'ir-defer': case 'ir-assert':
      return fixed('void', node.localName.slice(3));
    // Control transfers never complete, so like `fatal` they fit any context:
    // `if b { return 1; } else { return 2; }` can end an I32 function.
    case 'ir-return': case 'ir-break': case 'ir-continue':
      return fixed('never', node.localName.slice(3));
    case 'ir-index': return rule(graph, node, children(), R.MEMBER, one, 'get_index', 'return-of');
    case 'ir-slice': return rule(graph, node, children(), R.MEMBER, one, 'get_slice', 'return-of');
    case 'ir-lit':
      return rule(graph, node, [], R.LITERAL, node.getAttribute('kind'), null, 'literal');
    case 'ir-ident':
      return rule(graph, node, [bindingDependency(graph, node)], R.IDENT, null, null, 'binding');
    case 'ir-param':
      return rule(graph, node, [], R.PARAM, null, null, 'parameter');
    case 'ir-let': case 'ir-global': {
      // Iterator identities (0/1) take the element type even for an empty
      // stream. This is a dependency edge, not speculative evaluation of its
      // first element, and needs no specialization pass.
      const iteratorElement = node.getAttribute('data-iterator-element');
      const element = iteratorElement
        ? (closestOf(node, FUNCTION_SCOPES) ?? graph.root).querySelector(`ir-let[name="${iteratorElement}"]`) : null;
      return rule(graph, node, [element ?? two], R.BINDING, element ?? two, null, 'binding-value');
    }
    case 'ir-self-param': {
      const name = fnNameOf(closestOf(node, FN));
      const implementation = typeArgsOf(name)?.firstElementChild;
      return fixed(typeNodeToStr(implementation) ?? name?.getAttribute('receiver'), 'self');
    }
    case 'ir-fn': case 'ir-extern-fn':
      // Function declarations seed identifier uses, but stamping their
      // structural signature would make backend callable-type discovery treat
      // every declaration as a first-class function value.
      graph.facts.setTypeName(graph.facts.rowOf(node), fnSignatureType(node));
      return;
    case 'ir-block': case 'ir-paren': {
      const value = node.localName === 'ir-block' ? two : one;
      // A binding statement produces no value, even though the binding has a type.
      if (node.localName === 'ir-block' && (!value || value.localName === 'ir-let')) return fixed('void', 'tail');
      return rule(graph, node, [value], R.VALUE, value, null, node.localName === 'ir-block' ? 'tail' : 'identity');
    }
    case 'ir-unary':
      return rule(graph, node, [one], R.UNARY, one, null, 'operator');
    case 'ir-binary':
      return rule(graph, node, children(), R.BINARY, one, null, 'operator');
    case 'ir-tuple': {
      const parts = children();
      return rule(graph, node, parts, R.TUPLE, parts, null, 'tuple');
    }
    case 'ir-tuple-get':
      return rule(graph, node, [one], R.TUPLE_GET, one, null, 'tuple-element');
    case 'ir-if': {
      const kids = node.children;
      const then = kids[1];
      const otherwise = kids[2];
      if (!otherwise) return fixed('void', 'one-arm-if');
      return rule(graph, node, [then, otherwise], R.CONFLUENCE, [then, otherwise], null, 'confluence');
    }
    case 'ir-match': case 'ir-alt': {
      const bodies = [...node.children]
        .filter(child => /-arm$/.test(child.localName))
        .map(arm => arm.lastElementChild).filter(Boolean);
      return rule(graph, node, bodies, R.CONFLUENCE, bodies, null, 'confluence');
    }
    case 'ir-promote': {
      const arm = childOf(node, 'ir-promote-arm')?.lastElementChild;
      const fallback = childOf(node, 'ir-default-arm')?.lastElementChild;
      const branches = [arm, fallback].filter(Boolean);
      return rule(graph, node, branches, R.CONFLUENCE, branches, null, 'confluence');
    }
    case 'ir-else':
      return rule(graph, node, [one], R.UNWRAP, one, null, 'unwrap-nullable');
    case 'ir-fatal':
      // Never returns, so it fits any context: `lookup(id) orelse fatal`.
      return fixed('never', 'fatal');
    case 'ir-call': {
      const callee = node.firstElementChild;
      return rule(graph, node, [...children(), callee?.firstElementChild, ...argsOf(node)], R.CALL, null, null, 'return-of');
    }
    case 'ir-await':
      return rule(graph, node, [one], R.AWAIT, one, null, 'awaited-type');
    case 'ir-closure': {
      const body = bodyOf(node);
      const deps = [body, ...paramsOf(node)];
      return rule(graph, node, deps, R.CLOSURE, body, null, 'closure');
    }
    case 'ir-type-member':
      return rule(graph, node, [one], R.TYPE_MEMBER, null, null, 'foreign-member');
    case 'ir-field-access':
      return rule(graph, node, [one], R.FIELD, one, null, 'field-of');
    case 'ir-struct-init':
      return rule(graph, node, children().map(c => c.firstElementChild), R.STRUCT, null, null, 'struct-init');
    case 'ir-try': {
      const [body, handler] = node.children;
      return rule(graph, node, [body, handler], R.CONFLUENCE, [body, handler], null, 'confluence');
    }
    case 'ir-caught':
      // Whatever the host threw: a dynamic host value (`e.message`), or opaque without declarations.
      return fixed(graph.doc.__utuForeign?.type(0, 'any', graph) ?? 'Externref', 'caught');
    case 'ir-array-lit':
      return rule(graph, node, children(), R.ARRAY, null, null, 'array-literal');
    case 'ir-null-ref':
      return fixed(node.getAttribute('type-name') ? `?${node.getAttribute('type-name')}` : 'null', 'null');
    case 'ir-ref-test': case 'ir-ref-is-null':
      return fixed(graph.literalDefaults.get('bool') ?? 'Bool', 'predicate');
    case 'ir-ref-cast':
      return fixed(node.getAttribute('type-name'), 'cast');
    default: {
      const type = node.getAttribute('data-type-name');
      if (type) fixed(type, node.getAttribute('data-inference-source') ?? 'existing');
    }
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
    return decl.getAttribute('data-value-accessor') === 'true' ? fnReturnType(decl) : fnSignatureType(decl);
  }
  if (decl.localName === 'ir-alt-arm') return decl.getAttribute('variant');
  if (decl.localName === 'ir-promote') return unwrapNullable(actual(graph, decl.firstElementChild));
  if (decl.localName === 'ir-capture') {
    const source = captureSource(decl);
    return actual(graph, source?.firstElementChild) ?? actual(graph, source?.lastElementChild);
  }
  return declared(graph, decl) ?? actual(graph, decl);
}

function captureSource(decl) {
  return childOf(closestOf(decl, FOR), 'ir-for-source');
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
  const foreignResult = call.getAttribute('data-foreign-result');
  if (foreignResult) return foreignResult;
  const foreign = foreignActual(graph, call);
  if (foreign) return foreign;
  const fn = resolveCall(graph, call);
  if (fn) return fnReturnType(fn);
  const protocol = resolveProtocolCall(graph, call);
  if (protocol) return protocol.result;
  return callableParts(actual(graph, call.firstElementChild))?.ret ?? null;
}

function resolveCall(graph, call) {
  const known = functionOf(graph, call);
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
  if (callee.getAttribute('data-rewrite-kind') === 'operator-callee') return graph.fnIndex.get(`${type}:${method}`) ?? null;
  return memberFn(graph, type, method);
}

function resolveProtocolCall(graph, call) {
  const callee = call.firstElementChild;
  if (callee?.localName !== 'ir-field-access') return null;
  const owner = unwrapNullable(actual(graph, callee.firstElementChild) ?? '');
  const decl = graph.typeIndex?.get(owner)?.decl;
  if (decl?.localName !== 'ir-proto') return null;
  const member = callee.getAttribute('field');
  const method = childrenOf(decl, 'ir-proto-method').find(node => node.getAttribute('name') === member);
  if (!method) return null;
  const result = typeNodeToStr(firstTypeChild(method)) ?? 'void';
  const fact = { protocol: owner, member, declaration: method, result };
  graph.facts.setRareFact(graph.facts.rowOf(call), 'protocolCall', fact);
  graph.facts.setRareFact(graph.facts.rowOf(callee), 'protocolCall', fact);
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
  const { facts } = graph;
  const r = facts.rowOf(node);
  if (r < 0) return fn;
  facts.function[r] = fn;
  if (resolution) facts.resolution[r] = resolution;
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
    if (field.getAttribute('data-optional-chain-rejected')) continue;
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
    const foreignError = call.getAttribute('data-foreign-error');
    if (foreignError) {
      fail(graph, call, DIAGNOSTIC_KINDS.TYPE_MISMATCH, foreignError, {});
      continue;
    }
    checkArity(graph, call);
    const callee = call.firstElementChild;
    if (rareFactOf(graph, call, 'foreign') || resolvedFunction(graph, call) || rareFactOf(graph, call, 'protocolCall')
      || callableParts(actual(graph, callee))) continue;
    if (callee?.localName !== 'ir-field-access' && callee?.localName !== 'ir-type-member') continue;
    if (call.getAttribute('data-for-array-access')) continue;
    const operator = call.getAttribute('data-operator-name') ?? undefined;
    const recv = callee.firstElementChild;
    // Lowered operators name their receiver type on the call; the callee has no receiver child.
    const owner = operator
      ? call.getAttribute('data-operator-receiver-name') ?? callee.getAttribute('type-name')
      : isTypeNamespace(graph, recv) ? recv.getAttribute('name') : actual(graph, recv);
    if (!owner || owner === 'undefined') continue;
    const member = callee.getAttribute('field') ?? callee.getAttribute('method');
    const kind = operator ? DIAGNOSTIC_KINDS.UNKNOWN_OPERATOR : DIAGNOSTIC_KINDS.UNKNOWN_METHOD;
    const symbol = call.getAttribute('data-operator-symbol') ?? undefined;
    const message = operator
      ? `${owner} has no '${symbol ?? operator}' operator${symbol && symbol !== operator ? ` (${owner}.${operator})` : ''}`
      : `Unknown method '${unwrapNullable(owner)}.${member}'`;
    fail(graph, call, kind, message, { method: member, operator, receiverName: owner });
  }
}

function checkArity(graph, call) {
  if (rareFactOf(graph, call, 'foreign')) return;
  const fn = resolvedFunction(graph, call);
  const callee = call.firstElementChild;
  const protocol = rareFactOf(graph, call, 'protocolCall') ?? resolveProtocolCall(graph, call);
  const signature = fn ? paramsOf(fn)
    : protocol ? paramsOf(protocol.declaration)
    : callableParts(actual(graph, callee))?.params;
  if (!signature) return;
  const expected = signature.length;
  const actualCount = argCount(call);
  // `T.method(value, args)` passes the receiver explicitly; that extra
  // argument only exists when the function actually takes `self`.
  const receiverArg = fn && graph.facts.resolution[graph.facts.rowOf(call)]?.resolvedAs === 'static-method'
    && fnNameOf(fn)?.getAttribute('kind') === 'method'
    && selfParamOf(fn) && actualCount === expected + 1;
  if (receiverArg || actualCount === expected) return;
  const name = fn?.getAttribute('name') ?? callee?.getAttribute('name');
  fail(graph, call, DIAGNOSTIC_KINDS.WRONG_ARITY,
    `Wrong arity: expected ${expected}, got ${actualCount}`, {
      expected, actual: actualCount, function: name,
      relatedNodes: fn ? [{ node: fn, label: `function '${name}' is declared here` }] : [],
    });
}

const DIAGNOSTIC_ATTRIBUTES = ['data-error', 'data-error-kind', 'data-error-message', 'data-error-data'];

function clearDiagnostic(node) {
  if (node?.nodeType !== 1) return;
  diagnosticFacts(node.ownerDocument).delete(node.id);
  for (const name of DIAGNOSTIC_ATTRIBUTES) if (node.getAttribute(name) !== null) node.removeAttribute(name);
}

/**
 * Element context for a native array literal. A declared array type always
 * provides one; an inferred type only turns `[1, 2.5]` into F64, so a later
 * declaration context can still claim the literal.
 */
function arrayElementContext(graph, node) {
  const named = node.getAttribute('type-name');
  if (named) return graph.typeIndex?.get(named)?.arrayElem;
  // Integer literals and `null` follow their neighbours: `[x, 2]` with `x: F64`, `[p, null]`.
  const element = literalArrayElement(node) ?? arrayElementType(node, child => actual(graph, child));
  // Elements need context when they adapt to their neighbours, or when a
  // function reference must convert to the closure the array stores.
  const adapts = [...node.children].some(c => (c.localName === 'ir-lit' && ['int', 'null'].includes(c.getAttribute('kind')))
    || actual(graph, c)?.replace(/^\?/, '').startsWith('fun('));
  return element && element !== 'I32' && adapts ? element : undefined;
}

/** A native array literal's type: its context, or the `Array[T]` matching its elements. */
function nativeArrayType(graph, node) {
  const named = node.getAttribute('type-name');
  if (named) return graph.typeIndex?.get(named)?.kind === 'wasm-array' ? named : null;
  const element = literalArrayElement(node) ?? arrayElementType(node, child => actual(graph, child));
  if (!element) return null;
  for (const [name, entry] of graph.typeIndex ?? []) {
    if (entry.kind === 'wasm-array' && entry.arrayElem === element) return name;
  }
  return null;
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
    if (!firstTypeChild(param) && !param.getAttribute('data-type-name') && expected.params[i]) {
      param.setAttribute('data-type-name', expected.params[i]);
      graph.touched?.add(param);
      graph.changed = true;
    }
  });
  if (firstTypeChild(closure)) return;
  const body = bodyOf(closure);
  const tail = returnedValue(body?.lastElementChild);
  if (tail) expect(graph, tail, E.CONST, expected.ret, null, null, 'return', source ?? closure, 'assign');
  for (const ret of body?.querySelectorAll('ir-return') ?? []) {
    const value = ret.firstElementChild;
    if (value && ret !== body.lastElementChild) expect(graph, value, E.CONST, expected.ret, null, null, 'return', source ?? closure, 'assign');
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
    graph.facts.field[graph.facts.rowOf(node)] = { owner: unwrapNullable(owner), type, index: null, declaration };
    return type;
  }
  const index = entry?.fields?.findIndex(field => field.name === fieldName) ?? -1;
  if (index < 0) return null;
  const field = entry.fields[index];
  const fact = graph.facts.field[graph.facts.rowOf(node)] = {
    owner: unwrapNullable(owner), type: field.type, index,
    declaration: fieldDecl(entry, field.name),
  };
  return field.type;
}

function awaitedType(type, graph) {
  const entry = graph.typeIndex?.get(unwrapNullable(type ?? ''));
  return isInstanceOf(entry, 'Promise') ? moduleArgsOf(entry)[0] ?? null : null;
}

const CONDITION_LABELS = Object.freeze({
  if: () => 'if condition must be Bool',
  while: () => 'while condition must be Bool',
  assert: () => 'assert condition must be Bool',
});
const LOOP_STATE_LABEL = expected => `loop match state is ${expected}`;
const PROMOTE_LABEL = () => 'promote requires a nullable value';
const RANGE_LABEL = () => 'range bounds must have the same type';
const ORELSE_LABEL = () => 'orelse requires a nullable value';
const BRANCH_LABEL = expected => `other branch has type ${expected}`;

function addExpectations(graph, node) {
  const tag = node.localName;
  if (tag === 'ir-let' || tag === 'ir-global') {
    const type = declaredTypeStr(node);
    if (type || node.getAttribute('data-iterator-element')) expect(graph, node.lastElementChild, E.DECLARED, type, node, null, 'binding', firstTypeChild(node) ?? node, 'assign');
  }
  if (tag === 'ir-assign') {
    const [target, value] = [...node.children];
    expect(graph, value, E.ASSIGN, node, target, null, 'assign', null, 'assign');
  }
  if (tag === 'ir-call') {
    const args = argsOf(node);
    args.forEach((arg, index) => expect(graph, arg, E.ARGUMENT, node, args, index, 'argument', null, 'assign'));
  }
  if (tag === 'ir-tuple') {
    // A tuple gives each element its part of the tuple it is expected to be.
    [...node.children].forEach((value, index) => expect(graph, value, E.TUPLE_PART, node, null, index, 'field', node, 'assign'));
  }
  if (tag === 'ir-struct-init' || tag === 'ir-array-lit') {
    // Records and arrays give each element their declared context.
    const array = tag === 'ir-array-lit';
    const values = array ? [...node.children] : [...node.children].map(field => field.firstElementChild);
    values.forEach((value, index) => expect(graph, value, E.ELEMENT, node, array, index, 'field', node, 'assign'));
  }
  if (tag === 'ir-struct-init') {
    for (const field of childrenOf(node, 'ir-field-init')) {
      expect(graph, field.firstElementChild, E.FIELD_INIT, node, field, null, 'field', null, 'assign');
    }
  }
  if (tag === 'ir-fn' || tag === 'ir-export-main' || tag === 'ir-closure') {
    addReturnExpectations(graph, node);
  }
  if (tag === 'ir-if' || tag === 'ir-while' || tag === 'ir-assert') {
    expect(graph, node.firstElementChild, E.CONST, 'Bool', null, null, 'condition', node, 'assign', CONDITION_LABELS[tag.slice(3)]);
  }
  if (tag === 'ir-continue' && node.firstElementChild) {
    // `continue v` re-dispatches its loop match, so v has the state's type.
    const target = loopMatchTarget(node);
    if (target) expect(graph, node.firstElementChild, E.ACTUAL, target.firstElementChild, null, null, 'assign', target.firstElementChild, 'assign', LOOP_STATE_LABEL);
  }
  if (tag === 'ir-if') addConfluence(graph, node, [...node.children].slice(1));
  if (tag === 'ir-try') addConfluence(graph, node, [...node.children]);
  if (tag === 'ir-match' || tag === 'ir-alt' || tag === 'ir-promote') {
    addConfluence(graph, node, [...node.children]
      .filter(child => /-arm$/.test(child.localName)).map(arm => arm.lastElementChild));
  }
  if (tag === 'ir-promote') {
    expect(graph, node.firstElementChild, E.CONST, 'nullable', null, null, 'promote', node, 'nullable', PROMOTE_LABEL);
  }
  if (tag === 'ir-for-source') {
    // Both bounds of a range share one integer type.
    const [start, end] = [...node.children];
    expect(graph, end, E.ACTUAL, start, null, null, 'range', start, 'assign', RANGE_LABEL);
  }
  if (tag === 'ir-else') {
    const [value, fallback] = [...node.children];
    expect(graph, value, E.CONST, 'nullable', null, null, 'orelse', node, 'nullable', ORELSE_LABEL);
    expect(graph, fallback, E.UNWRAP, value, null, null, 'orelse', value, 'assign');
  }
}

const BRANCHING = new Set(['ir-if', 'ir-match', 'ir-alt', 'ir-promote']);

function addReturnExpectations(graph, surface) {
  const type = surface.localName === 'ir-closure'
    ? typeNodeToStr(firstTypeChild(surface)) : fnReturnType(surface);
  if (!type || type === 'void') return;
  const body = bodyOf(surface);
  const source = firstTypeChild(surface) ?? surface;
  const tail = returnedValue(body?.lastElementChild);
  if (tail) expect(graph, tail, E.CONST, type, null, null, 'return', source, 'assign');
  // A branching expression at the end of nested blocks also learns the return
  // type, so its literal branches (`else { -1; }`) take it.
  let inner = tail;
  while ((inner?.localName === 'ir-block' || inner?.localName === 'ir-paren') && inner.lastElementChild?.localName !== 'ir-let') {
    inner = returnedValue(inner.lastElementChild);
  }
  if (inner && inner !== tail && BRANCHING.has(inner.localName)) expect(graph, inner, E.CONST, type, null, null, 'return', source, 'assign');
  for (const ret of body?.querySelectorAll('ir-return') ?? []) {
    if (ret !== body.lastElementChild
      && closestOf(ret, RETURN_SURFACES) === surface
      && ret.firstElementChild) {
      expect(graph, ret.firstElementChild, E.CONST, type, null, null, 'return', source, 'assign');
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
  const foreign = rareFactOf(graph, call, 'foreign');
  if (foreign) return { type: foreign.expected[index], source: call };
  const foreignParams = call.getAttribute('data-foreign-params');
  if (foreignParams) return { type: JSON.parse(foreignParams)[index], source: call };
  const fn = resolvedFunction(graph, call);
  if (!fn) {
    const protocol = rareFactOf(graph, call, 'protocolCall');
    const param = protocol ? paramsOf(protocol.declaration)[index] : null;
    const type = declared(graph, param)
      ?? callableParts(actual(graph, call.firstElementChild))?.params[index];
    return type && { type, source: param ?? call.firstElementChild };
  }
  const params = paramsOf(fn);
  const receiverType = call.getAttribute('data-operator-receiver-name')
    ?? call.firstElementChild?.getAttribute('type-name')
    ?? childOf(call.firstElementChild, 'ir-type-ref')?.getAttribute('name');
  // Lowered receiver methods carry self as argument zero, while paramsOf
  // intentionally excludes ir-self-param.
  const offset = (graph.facts.rowOf(call) >= 0 ? graph.facts.resolution[graph.facts.rowOf(call)] : undefined)?.resolvedAs === 'static-method'
    && selfParamOf(fn) && args.length === params.length + 1 ? 1 : 0;
  if (offset && index === 0) return receiverType && { type: receiverType, source: selfParamOf(fn) };
  const param = params[index - offset];
  // Operator declarations use inferred `&` parameters with no explicit type
  // children. At a lowered call site those parameters are the concrete
  // receiver type (I64:add, F32:mul, and so on).
  const type = declared(graph, param) ?? param?.getAttribute('data-type-name')
    ?? (fn.getAttribute('receiver') === '&' ? receiverType : null);
  return type && { type, source: param ?? fn };
}

function resolvedFunction(graph, call) {
  const resolved = functionOf(graph, call);
  if (isFunctionDecl(resolved)) return resolved;
  const direct = bindingOf(graph, call?.firstElementChild);
  return isFunctionDecl(direct) ? direct : directCalleeDecl(call, graph.doc);
}

function fieldDecl(entry, name) {
  return childrenOf(entry?.decl, 'ir-field').find(field => field.getAttribute('name') === name) ?? entry?.decl;
}

// Numeric context types that branch literals adopt directly.
const LITERAL_CONTEXT = new Set(['I32', 'U32', 'I64', 'U64', 'F32', 'F64']);

function addConfluence(graph, owner, values) {
  const branches = values.filter(Boolean);
  const first = branches[0];
  for (const branch of branches) {
    // The block needs the unified backend result type, while its returned
    // expression needs the same context to type literals such as bare null.
    expect(graph, branch, E.CONFLUENCE, owner, first, null, 'confluence', first, 'unify', BRANCH_LABEL);
    let value = branch;
    while (value?.localName === 'ir-block' || value?.localName === 'ir-paren') value = value.lastElementChild;
    value = returnedValue(value);
    if (value?.localName === 'ir-unary' && value.getAttribute('op') === '-') value = value.firstElementChild;
    if (value?.localName === 'ir-lit' && ['null', 'int', 'float'].includes(value.getAttribute('kind'))
        || value?.localName === 'ir-tuple') {
      expect(graph, value, E.CONFLUENCE, owner, first, null, 'confluence', first, 'unify', BRANCH_LABEL);
    }
  }
}

/** The type every branch of `owner` must have. */
function unifiedBranchType(graph, owner, first) {
  // The surrounding context (a return type, an annotated let) decides what
  // every branch must be. Without it, branches meet each other, which can
  // leave a literal branch to default before a block branch has a type.
  const context = expectedOf(graph, owner)?.map(edge => edge.read())
    .find(type => type && type !== 'null' && type !== 'void' && type !== 'nullable');
  // A tuple context reaches inside the branches' tuples the same way.
  if (context && (LITERAL_CONTEXT.has(context) || tupleParts(context))) return context;
  const unified = actual(graph, owner) ?? actual(graph, first);
  if (unified !== 'null') return unified;
  return expectedOf(graph, owner)?.map(edge => edge.read()).find(type => type && type !== 'null') ?? unified;
}

/**
 * Branch types meet at a common type. Host-boxed numbers meet their primitive.
 * In statement position, branches that cannot meet are void and their values
 * are discarded; in value position the branch mismatch is reported.
 */
function confluence(graph, node, types) {
  const meet = list => list.reduce((type, next) => unifyTypes(type, next), null);
  const unboxed = type => graph.doc.__utuForeign?.values.get(unwrapNullable(type ?? ''))?.ref?.boxed ?? type;
  const unified = meet(types) ?? (types.some(t => unboxed(t) !== t) ? meet(types.map(unboxed)) : null);
  if (unified || !types.length || !types.every(Boolean)) return unified;
  const used = expectedOf(graph, node)?.some(edge => { const type = edge.read(); return type && type !== 'void'; });
  return used ? null : 'void';
}

function compatible(mode, actualType, expected, ctx) {
  if (mode === 'nullable') return actualType.startsWith('?');
  if (mode === 'unify' && expected === 'void') return true;
  if (mode === 'unify') return actualType === 'null' || expected === 'null'
    || isAssignable(actualType, expected, ctx) || isAssignable(expected, actualType, ctx);
  return isAssignable(actualType, expected, ctx);
}

function coercionKind(from, to, ctx) {
  if (from === to || !isAssignable(from, to, ctx)) return null;
  const a = callableParts(from);
  const b = callableParts(to);
  if (a?.kind === 'cl' && b?.kind === 'cl') return 'closure-widen';
  if (a?.kind === 'fun' && b?.kind === 'cl') return 'fun-to-cl';
  if (to.startsWith('?')) return 'nullable-widen';
  if (ctx.typeIndex?.get(to)?.typeRepr === 'wasm-externref') return 'externref-widen';
  return 'variant-to-enum';
}

function collectFailures(graph) {
  graph.failures = [];
  // Explicit type references are checked by linkTypeDecls, but inferred types
  // can become stale across module hoisting. Report those as diagnostics too
  // instead of letting debug assertions or codegen crash on an unknown name.
  // Names already reported where they were written need no second report
  // on every value whose inferred type mentions them.
  const reportedUnknown = new Set([...graph.doc.querySelectorAll('ir-type-ref[name]')]
    .map(ref => ref.getAttribute('name'))
    .filter(name => !knownType(graph, name)));
  for (const [node, typeSlot] of graph.slots) {
    const foreignError = node.getAttribute('data-foreign-error');
    if (foreignError) fail(graph, node, DIAGNOSTIC_KINDS.TYPE_MISMATCH, foreignError, {});
    const type = typeSlot.actual;
    if (type && !knownType(graph, type) && !unknownTypeNames(graph, type).every(name => reportedUnknown.has(name))) {
      fail(graph, node, DIAGNOSTIC_KINDS.UNKNOWN_TYPE, `Unknown inferred type '${type}'`, { type });
    }
  }
  // `let .{a, b} = value` names every value of a tuple.
  for (const get of nodesOf(graph, 'ir-tuple-get')) {
    if (get.getAttribute('index') !== '0') continue;
    const type = actual(graph, get.firstElementChild);
    const parts = tupleParts(type);
    const count = Number(get.getAttribute('count'));
    if (type && !parts) {
      fail(graph, get, DIAGNOSTIC_KINDS.TYPE_MISMATCH, `let .{…} takes apart a tuple, but this value is ${type}`, { actual: type });
    } else if (parts && parts.length !== count) {
      fail(graph, get, DIAGNOSTIC_KINDS.TYPE_MISMATCH,
        `This tuple has ${parts.length} values (${type}); name each one in let .{…}`, { actual: type });
    }
  }
  for (const array of nodesOf(graph, 'ir-array-lit')) {
    if (!actual(graph, array) && !rareFactOf(graph, array, 'foreignError')) fail(graph, array, DIAGNOSTIC_KINDS.TYPE_MISMATCH,
      'An array literal needs a known type: annotate it (`let xs: Array[I32] = [1, 2]`) or pass it where an array is expected', {});
  }
  for (const closure of nodesOf(graph, 'ir-closure')) {
    for (const param of paramsOf(closure)) {
      if (declaredTypeStr(param) || actual(graph, param)) continue;
      fail(graph, param, DIAGNOSTIC_KINDS.UNKNOWN_TYPE,
        `Cannot infer the type of closure parameter '${param.getAttribute('name')}'; annotate it or pass the closure where its type is known`,
        { parameter: param.getAttribute('name') });
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

/** The loop match a `continue v` re-dispatches: the nearest one in the same function. */
export function loopMatchTarget(node) {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent.localName === 'ir-loop-match') return parent;
    if (parent.localName === 'ir-closure' || parent.localName === 'ir-fn') return null;
  }
  return null;
}

function knownType(graph, type) {
  const name = unwrapNullable(type);
  if (name === '&' || name === 'nullable' || name === 'unknown' || name === 'never') return true;
  const callable = callableParts(name);
  if (callable) return [...callable.params, callable.ret]
    .every(part => part === 'void' || knownType(graph, part));
  const tuple = tupleParts(name);
  if (tuple) return tuple.every(part => knownType(graph, part));
  return INFERRED_PRIMITIVES.has(name) || graph.typeIndex?.has(name);
}

/** The unknown base names inside a type string, e.g. `fun(Nope) I32` → ['Nope']. */
function unknownTypeNames(graph, type) {
  const name = unwrapNullable(type);
  const callable = callableParts(name);
  if (callable) return [...callable.params, callable.ret].filter(part => part !== 'void').flatMap(part => unknownTypeNames(graph, part));
  const tuple = tupleParts(name);
  if (tuple) return tuple.flatMap(part => unknownTypeNames(graph, part));
  return knownType(graph, name) ? [] : [name];
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
  const rule = ruleOf(graph, node);
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
  // Expansion-generated parentheses (Wutu, iterators) wrap user source that
  // keeps its own range; point at that source rather than the whole template.
  if (node?.localName === 'ir-paren' && node.getAttribute('data-synthetic') === 'true'
      && node.firstElementChild?.getAttribute('data-synthetic') !== 'true') {
    return node.firstElementChild;
  }
  return node;
}
