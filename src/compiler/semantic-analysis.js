// Canonical rebuild boundary for phase-local semantic graphs.
//
// Destructive lowerings invalidate structure, scope, type, call, and control
// facts together. Rebuild them together so no caller can accidentally retain a
// mixed-revision set.

import { buildCallGraph, buildControlFlowGraph } from './semantic-graphs.js';
import { replaceRetainedGraphs } from './graph-store.js';
import { refreshProgramIndex } from './program-index.js';
import { resolveBindings } from './resolve-bindings.js';
import { refreshTypeGraph, settleTypeGraph } from './type-graph.js';

/**
 * @typedef {Object} SemanticGraphSet
 * @property {ReturnType<typeof refreshProgramIndex>} program
 * @property {ReturnType<typeof resolveBindings>} scope
 * @property {ReturnType<typeof settleTypeGraph>} types
 * @property {ReturnType<typeof buildCallGraph>} calls
 * @property {ReturnType<typeof buildControlFlowGraph>} controlFlow
 */

/**
 * Rebuild every phase-local semantic graph against one fresh program revision.
 *
 * @param {Document} doc
 * @param {Map<string, object>} typeIndex
 * @param {{ captures?: Map<string, Map<string, Element>> }} [options]
 * @returns {SemanticGraphSet}
 */
export function rebuildSemanticGraphs(doc, typeIndex, { captures = new Map() } = {}) {
  const program = refreshProgramIndex(doc);
  const scope = resolveBindings(doc);
  scope.captures = new Map([...captures, ...scope.captures]);
  // Lowerings synthesize fresh call/argument contexts. Settle again rather
  // than merely solving once, so numeric literals and closures can adopt the
  // signatures of newly created operator/intrinsic calls.
  const types = settleTypeGraph(doc, typeIndex);
  const calls = buildCallGraph(doc.body.firstChild, types);
  const controlFlow = buildControlFlowGraph(doc.body.firstChild, program);
  replaceRetainedGraphs(doc, { program, scope, types, calls, controlFlow });
  return { program, scope, types, calls, controlFlow };
}

/**
 * Watch the document for edits, as a lowering is about to make. Returns a
 * function that stops watching and gives the mutation records.
 */
export function watchEdits(doc) {
  const Observer = doc.defaultView?.MutationObserver;
  if (!Observer) return () => null;
  const observer = new Observer(() => {});
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, characterData: true });
  return () => {
    const records = observer.takeRecords();
    observer.disconnect();
    return records;
  };
}

/**
 * The same graph set as rebuildSemanticGraphs after a lowering, with the type
 * graph brought up to date (refreshTypeGraph) instead of rebuilt. With
 * `check`, a full settle is compared against it and any difference throws.
 */
export function refreshSemanticGraphs(doc, typeIndex, previous, records, { captures = new Map(), check = false } = {}) {
  if (!previous || !records) return rebuildSemanticGraphs(doc, typeIndex, { captures });
  const program = refreshProgramIndex(doc);
  const scope = resolveBindings(doc);
  scope.captures = new Map([...captures, ...scope.captures]);
  replaceRetainedGraphs(doc, { program, scope });
  const types = refreshTypeGraph(previous, doc, typeIndex, records);
  if (check) checkAgainstSettle(doc, typeIndex, types);
  const calls = buildCallGraph(doc.body.firstChild, types);
  const controlFlow = buildControlFlowGraph(doc.body.firstChild, program);
  replaceRetainedGraphs(doc, { program, scope, types, calls, controlFlow });
  return { program, scope, types, calls, controlFlow };
}

/** Throw if a full settle of the document disagrees with `types` about anything. */
function checkAgainstSettle(doc, typeIndex, types) {
  const before = doc.body.firstChild?.outerHTML;
  const full = settleTypeGraph(doc, typeIndex);
  if (doc.body.firstChild?.outerHTML !== before) throw new Error('type graph refresh: a full settle still rewrote the IR');
  const difference = typeGraphDifference(types, full);
  if (difference) throw new Error(`type graph refresh differs from a full settle: ${difference}`);
}

function describeNode(node) {
  return node ? `${node.localName}#${node.id}` : String(node);
}

/** The first way two settled graphs differ, or null. */
export function typeGraphDifference(a, b) {
  const fa = a.facts;
  const fb = b.facts;
  if (fa.nodes.length !== fb.nodes.length) return `${fa.nodes.length} vs ${fb.nodes.length} nodes`;
  const display = (facts, r) => facts.source[r] ?? facts.rule[r]?.source;
  const json = value => JSON.stringify(value, (key, v) => (v?.nodeType ? describeNode(v) : v));
  for (let r = 0; r < fa.nodes.length; r++) {
    const node = fa.nodes[r];
    if (fb.nodes[r] !== node) return `row ${r}: ${describeNode(node)} vs ${describeNode(fb.nodes[r])}`;
    const where = describeNode(node);
    if (fa.typeName(r) !== fb.typeName(r)) return `${where}: type ${fa.typeName(r)} vs ${fb.typeName(r)}`;
    if (display(fa, r) !== display(fb, r)) return `${where}: source ${display(fa, r)} vs ${display(fb, r)}`;
    if (fa.function[r] !== fb.function[r]) return `${where}: function ${describeNode(fa.function[r])} vs ${describeNode(fb.function[r])}`;
    if (json(fa.resolution[r]) !== json(fb.resolution[r])) return `${where}: resolution`;
    if (json(fa.field[r]) !== json(fb.field[r])) return `${where}: field ${json(fa.field[r])} vs ${json(fb.field[r])}`;
    for (const key of ['protocolCall', 'foreignError', 'foreignChecked']) {
      if (json(fa.rareFact(r, key)) !== json(fb.rareFact(r, key))) return `${where}: ${key} ${json(fa.rareFact(r, key))} vs ${json(fb.rareFact(r, key))}`;
    }
    if (Boolean(fa.rareFact(r, 'foreign')) !== Boolean(fb.rareFact(r, 'foreign'))) return `${where}: foreign`;
    const ra = fa.rule[r];
    const rb = fb.rule[r];
    if (Boolean(ra) !== Boolean(rb) || (ra && (ra.kind !== rb.kind || ra.source !== rb.source
        || ra.deps.length !== rb.deps.length || ra.deps.some((dep, i) => dep !== rb.deps[i])))) return `${where}: rule`;
    const ea = fa.expected[r];
    const eb = fb.expected[r];
    if (ea.length !== eb.length) return `${where}: ${ea.length} vs ${eb.length} expectations`;
    for (let i = 0; i < ea.length; i++) {
      if (ea[i].kind !== eb[i].kind || ea[i].site !== eb[i].site || ea[i].mode !== eb[i].mode
          || ea[i].read() !== eb[i].read() || ea[i].source !== eb[i].source) return `${where}: expectation ${i}`;
    }
  }
  if (a.rules.length !== b.rules.length) return `${a.rules.length} vs ${b.rules.length} rules`;
  for (let i = 0; i < a.rules.length; i++) if (a.rules[i].node !== b.rules[i].node) return `rule ${i} order`;
  if (a.expectations.length !== b.expectations.length) return `${a.expectations.length} vs ${b.expectations.length} expectations`;
  for (let i = 0; i < a.expectations.length; i++) {
    if (a.expectations[i].value !== b.expectations[i].value || a.expectations[i].kind !== b.expectations[i].kind) return `expectation ${i} order`;
  }
  if (a.coercions.length !== b.coercions.length) return `${a.coercions.length} vs ${b.coercions.length} coercions`;
  for (let i = 0; i < a.coercions.length; i++) {
    const x = a.coercions[i];
    const y = b.coercions[i];
    if (x.node !== y.node || x.from !== y.from || x.to !== y.to || x.kind !== y.kind) return `coercion ${i}`;
  }
  return null;
}
