// Settled representation and semantic facts consumed by codegen.

import { buildLayoutGraph } from './semantic-graphs.js';
import { buildProgramIndex } from './program-index.js';
import { assertGraphRevision, replaceRetainedGraphs, retainGraph, retainedGraphs } from './graph-store.js';
import { BackendFacts, expectationMatters } from './backend-facts.js';
import { linkTypeDecls } from './link-type-decls.js';
import { rebuildSemanticGraphs } from './semantic-analysis.js';
import { projectGraphs } from './project-graphs.js';
import { callableParts } from './type-rules.js';
import { closureCallImport } from './closure-abi.js';

/**
 * Settled semantic and representation facts consumed by codegen.
 *
 * @typedef {Object} BackendPlan
 * @property {'backend-plan'} kind
 * @property {Document} doc
 * @property {number} programRevision
 * @property {string | null} fingerprint
 * @property {Map<string, object>} typeIndex
 * @property {Map<string, string>} nodeTypes
 * @property {Map<string, string>} expectations
 * @property {Map<string, string>} bindings
 * @property {Map<string, object>} fields
 * @property {Map<string, string>} callTargets
 * @property {object} runtime
 */

/**
 * The plan for `doc` from `facts` (by default, the retained graphs' facts) and,
 * for the runtime it needs, `callGraph` (by default, the retained one).
 *
 * @returns {BackendPlan}
 */
export function buildBackendPlan(doc, typeIndex, program = null, { facts = null, callGraph = null } = {}) {
  const root = doc.body.firstChild;
  const graphs = retainedGraphs(doc);
  const index = program ?? graphs.program ?? buildProgramIndex(doc);
  const layout = graphs.layout?.typeIndex === typeIndex ? graphs.layout : buildLayoutGraph(typeIndex);
  const types = graphs.types;
  const scope = graphs.scope;
  const calls = callGraph ?? graphs.calls;
  if (!facts) {
    for (const [name, graph] of [['scope', scope], ['types', types], ['calls', calls]]) {
      if (graph) assertGraphRevision(graph, index, `backend plan: ${name}`);
    }
    facts = BackendFacts.fromGraphs({ types, scope, calls });
  }
  // In document order, as code generation registers the types it meets.
  const nodeTypes = new Map();
  const expectations = new Map();
  const bindings = new Map();
  const fields = new Map();
  const protocolCalls = new Map();
  const callTargets = new Map();
  const byNode = [[facts.fields, fields], [facts.protocolCalls, protocolCalls]];
  const byId = [[facts.callTargets, callTargets]];
  for (const node of index.all) {
    const id = node.id;
    if (!id) continue;
    const type = facts.type(node);
    if (type && node.localName !== 'ir-fn' && node.localName !== 'ir-extern-fn') nodeTypes.set(id, type);
    const expected = facts.expectation(node);
    if (expected) expectations.set(id, expected);
    for (const [from, to] of byNode) {
      const value = from.get(node);
      if (value !== undefined) to.set(id, value);
    }
    const declaration = facts.declaration(id);
    if (declaration) bindings.set(id, declaration.id);
    for (const [from, to] of byId) {
      const value = from.get(id);
      if (value !== undefined) to.set(id, value);
    }
  }
  // By node: codegen asks about the node it is emitting.
  const resolutions = facts.resolutions;
  const runtime = buildRuntimePlan(index, calls);

  return {
    kind: 'backend-plan',
    doc,
    root,
    typeIndex,
    fingerprint: null,
    programRevision: index.revision ?? 0,
    program: index,
    layout,
    types,
    nodeTypes,
    expectations,
    bindings,
    fields,
    protocolCalls,
    resolutions,
    calls,
    callTargets,
    functionsByName: index.functions,
    functionsById: new Map([...index.functions.values()].filter(fn => fn.id).map(fn => [fn.id, fn])),
    emittableFunctions: (index.byKind.get('ir-fn') ?? []).filter(fn => fn.parentElement === root),
    exports: (index.byKind.get('ir-fn') ?? []).filter(fn =>
      fn.parentElement === root && fn.getAttribute('data-export') !== null),
    runtime,
    typeOf(node) {
      return nodeTypes.get(node?.id) ?? node?.getAttribute?.('data-type-name') ?? null;
    },
    expectedOf(node) {
      return expectations.get(node?.id) ?? node?.getAttribute?.('data-expect') ?? node?.getAttribute?.('data-expected-type') ?? null;
    },
    bindingIdOf(node) {
      return bindings.get(node?.id) ?? node?.getAttribute?.('data-binding-id') ?? null;
    },
    callTargetIdOf(node) {
      return callTargets.get(node?.id) ?? node?.getAttribute?.('data-fn-id') ?? null;
    },
    fieldOf(node) {
      return fields.get(node?.id) ?? null;
    },
  };
}

/**
 * Mark the plan as matching its document. Where the DOM supports it, a
 * MutationObserver records later edits instead of serializing the whole IR
 * now and again before code generation.
 */
export function sealBackendPlan(plan) {
  if (!plan?.doc) return plan;
  plan.observer?.disconnect();
  const Observer = plan.doc.defaultView?.MutationObserver;
  if (Observer) {
    plan.observer = new Observer(() => {});
    plan.observer.observe(plan.doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
    plan.fingerprint = 'observed';
  } else {
    plan.fingerprint = backendFingerprint(plan.doc);
  }
  return plan;
}

export function ensureBackendPlan(doc, plan) {
  if (!plan || !plan.fingerprint) return plan;
  if (plan.observer) {
    // Code generation's own bookkeeping on the root (sizes, facts) is not an edit.
    const root = doc.body.firstChild;
    const edits = plan.observer.takeRecords().filter(record => !(record.type === 'attributes' && record.target === root));
    return edits.length ? rebuildBackendPlan(doc) : plan;
  }
  return plan.fingerprint === backendFingerprint(doc) ? plan : rebuildBackendPlan(doc);
}

/** Re-analyse a deliberately edited compiled document before code generation. */
export function rebuildBackendPlan(doc) {
  const typeIndex = linkTypeDecls(doc);
  const { program } = rebuildSemanticGraphs(doc, typeIndex);
  retainGraph(doc, 'layout', buildLayoutGraph(typeIndex));
  const plan = retainGraph(doc, 'backend', buildBackendPlan(doc, typeIndex, program));
  projectGraphs(doc);
  return sealBackendPlan(plan);
}

export function backendFingerprint(doc) {
  return doc?.body?.firstChild?.outerHTML ?? '';
}

function buildRuntimePlan(program, callGraph) {
  const closureCalls = new Map();
  for (const edge of callGraph?.edges ?? []) {
    if (!edge.indirect) continue;
    const type = callGraph.callableTypes?.get(edge.call.id);
    const parts = callableParts(type);
    if (parts?.kind !== 'cl') continue;
    const field = closureCallImport(parts);
    closureCalls.set(field, { field, params: parts.params, result: parts.ret });
  }

  const sites = callGraph?.sites ?? { awaits: [], promiseThen: [], promiseCatch: [] };
  const ops = [
    ...(sites.promiseThen?.length ? ['promise_then'] : []),
    ...(sites.promiseCatch?.length ? ['promise_catch'] : []),
  ];
  const awaits = [...new Set((callGraph?.awaitTypes ?? []).filter(Boolean))].sort();
  const asyncExports = [...(callGraph?.functions.values() ?? [])]
    .filter(({ id, node }) => node.getAttribute('data-export') !== null
      && callGraph.effects.get(id)?.has('await'))
    .map(({ node }) => node.getAttribute('name')).filter(Boolean).sort();

  return {
    closures: {
      new: (program.byKind.get('ir-make-closure')?.length ?? 0) > 0
        || (program.byKind.get('ir-closure-decay')?.length ?? 0) > 0,
      calls: [...closureCalls.values()].sort((a, b) => a.field.localeCompare(b.field)),
    },
    promises: { ops: [...new Set(ops)].sort(), awaits, asyncExports },
    dslImports: readJson(program.root?.getAttribute('data-dsl-wasm-imports'), []),
  };
}

function readJson(value, fallback) {
  try {
    return JSON.parse(value || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Debug builds: analyze the lowered program from scratch and throw if the
 * plan it gives answers any question codegen asks differently from `plan`,
 * which was built from the facts the lowerings carried. The fresh analysis
 * may annotate the IR (literals take their context's type); the document and
 * the retained graphs are restored afterwards.
 */
export function checkBackendPlan(doc, typeIndex, plan, captures) {
  const root = doc.body.firstChild;
  const nodes = [root, ...root.querySelectorAll('*')];
  const attributes = nodes.map(node => [...node.attributes].map(({ name, value }) => [name, value]));
  const retained = { ...retainedGraphs(doc) };
  const { program } = rebuildSemanticGraphs(doc, typeIndex, { captures });
  const reference = buildBackendPlan(doc, typeIndex, program);
  if (root.querySelectorAll('*').length !== nodes.length - 1) throw new Error('backend plan check: a fresh analysis changed the program');
  nodes.forEach((node, index) => {
    const before = new Map(attributes[index]);
    for (const { name } of [...node.attributes]) if (!before.has(name)) node.removeAttribute(name);
    for (const [name, value] of before) if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  });
  replaceRetainedGraphs(doc, retained);
  const difference = backendPlanDifference(plan, reference, program);
  if (difference) throw new Error(`backend facts differ from a fresh analysis of the lowered program: ${difference}`);
}

/** The first question two plans answer differently on the nodes of `program`, or null. */
export function backendPlanDifference(a, b, program) {
  const json = value => (value && typeof value === 'object'
    ? JSON.stringify(value, (_, v) => (v?.nodeType ? v.id : v)) : value ?? null);
  const differ = (what, node, x, y) => (json(x) !== json(y)
    ? `${what} of ${node.localName}#${node.id} (${node.getAttribute('data-rewrite-kind') ?? 'as written'}): ${json(x)} vs ${json(y)}` : null);
  for (const node of program.all) {
    for (const method of ['typeOf', 'bindingIdOf', 'callTargetIdOf', 'fieldOf']) {
      const difference = differ(method, node, a[method](node), b[method](node));
      if (difference) return difference;
    }
    // Lowerings record expectations only where codegen reads them.
    if (expectationMatters(node, b.typeOf(node))) {
      const difference = differ('expectedOf', node, a.expectedOf(node), b.expectedOf(node));
      if (difference) return difference;
    }
    const difference = differ('protocol call', node, a.protocolCalls.get(node.id), b.protocolCalls.get(node.id))
      ?? differ('resolution', node, a.resolutions.get(node), b.resolutions.get(node));
    if (difference) return difference;
  }
  if (json(a.runtime) !== json(b.runtime)) return `runtime: ${json(a.runtime)} vs ${json(b.runtime)}`;
  return null;
}
