// Settled representation and semantic facts consumed by codegen.

import { buildLayoutGraph } from './semantic-graphs.js';
import { buildProgramIndex } from './program-index.js';
import { assertGraphRevision, retainGraph, retainedGraphs } from './graph-store.js';
import { actualType } from './type-graph.js';
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

/** @returns {BackendPlan} */
export function buildBackendPlan(doc, typeIndex, program = null) {
  const root = doc.body.firstChild;
  const graphs = retainedGraphs(doc);
  const index = program ?? graphs.program ?? buildProgramIndex(doc);
  const layout = graphs.layout?.typeIndex === typeIndex ? graphs.layout : buildLayoutGraph(typeIndex);
  const types = graphs.types;
  const scope = graphs.scope;
  const calls = graphs.calls;
  for (const [name, graph] of [['scope', scope], ['types', types], ['calls', calls]]) {
    if (graph) assertGraphRevision(graph, index, `backend plan: ${name}`);
  }
  const nodeTypes = new Map();
  const expectations = new Map();
  const fields = new Map();
  const protocolCalls = new Map();
  for (const [node, slot] of types?.slots ?? []) {
    if (node.id && slot.actual && node.localName !== 'ir-fn' && node.localName !== 'ir-extern-fn') {
      nodeTypes.set(node.id, slot.actual);
    }
    const expected = slot.expected?.map(edge => edge.read()).find(Boolean);
    if (node.id && expected) expectations.set(node.id, expected);
    if (node.id && slot.field) fields.set(node.id, slot.field);
    if (node.id && slot.protocolCall) protocolCalls.set(node.id, slot.protocolCall);
  }
  const bindings = new Map([...scope?.resolutions ?? []].map(([id, decl]) => [id, decl.id]));
  const callTargets = new Map([...calls?.targets ?? []].map(([id, decl]) => [id, decl.id]));
  const runtime = buildRuntimePlan(index, types, calls);

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
    calls,
    callTargets,
    functionsByName: index.functions,
    functionsById: new Map([...index.functions.values()].filter(fn => fn.id).map(fn => [fn.id, fn])),
    emittableFunctions: (index.byKind.get('ir-fn') ?? []).filter(fn => fn.parentElement === root),
    exports: (index.byKind.get('ir-fn') ?? []).filter(fn =>
      fn.parentElement === root && (fn.dataset.export != null || fn.hasAttribute('data-export'))),
    runtime,
    typeOf(node) {
      return nodeTypes.get(node?.id) ?? node?.dataset?.typeName ?? null;
    },
    expectedOf(node) {
      return expectations.get(node?.id) ?? node?.dataset?.expect ?? node?.dataset?.expectedType ?? null;
    },
    bindingIdOf(node) {
      return bindings.get(node?.id) ?? node?.dataset?.bindingId ?? null;
    },
    callTargetIdOf(node) {
      return callTargets.get(node?.id) ?? node?.dataset?.fnId ?? null;
    },
    fieldOf(node) {
      return fields.get(node?.id) ?? null;
    },
  };
}

export function sealBackendPlan(plan) {
  if (plan?.doc) plan.fingerprint = backendFingerprint(plan.doc);
  return plan;
}

export function ensureBackendPlan(doc, plan) {
  if (!plan || !plan.fingerprint || plan.fingerprint === backendFingerprint(doc)) return plan;
  return rebuildBackendPlan(doc);
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

function buildRuntimePlan(program, typeGraph, callGraph) {
  const closureCalls = new Map();
  for (const edge of callGraph?.edges ?? []) {
    if (!edge.indirect) continue;
    const type = callGraph.callableTypes?.get(edge.call.id)
      ?? (typeGraph ? actualType(typeGraph, edge.call.firstElementChild) : null);
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
  const awaits = [...new Set((sites.awaits ?? [])
    .map(node => typeGraph ? actualType(typeGraph, node) : node.dataset?.typeName)
    .filter(Boolean))].sort();
  const asyncExports = [...(callGraph?.functions.values() ?? [])]
    .filter(({ id, node }) => (node.dataset.export != null || node.hasAttribute('data-export'))
      && callGraph.effects.get(id)?.has('await'))
    .map(({ node }) => node.getAttribute('name')).filter(Boolean).sort();

  return {
    closures: {
      new: (program.byKind.get('ir-make-closure')?.length ?? 0) > 0
        || (program.byKind.get('ir-closure-decay')?.length ?? 0) > 0,
      calls: [...closureCalls.values()].sort((a, b) => a.field.localeCompare(b.field)),
    },
    promises: { ops: [...new Set(ops)].sort(), awaits, asyncExports },
    dslImports: readJson(program.root?.dataset.dslWasmImports, []),
  };
}

function readJson(value, fallback) {
  try {
    return JSON.parse(value || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
