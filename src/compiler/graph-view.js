// graph-view.js — read the compiler's graphs back out as nodes and edges
//
// The live type, scope, and provenance graphs are canonical. Their settled
// public projection is also recorded on the IR for node labels and compatibility:
//
//   binding      data-binding-id     a use → the declaration it resolves to
//   expectation  data-expect-from    a value → the declaration whose type it
//                                    must satisfy (docs/type-graph.md)
//   provenance   data-rewrite-of     a synthesised node → what it was rewritten
//                                    from, across every lowering pass
//
// Edges below come from retained graphs; projected attributes are read only for
// display metadata and as a provenance fallback for standalone pass users.

import { retainedGraphs } from './graph-store.js';

export const EDGE_KINDS = Object.freeze(['binding', 'expectation', 'provenance']);

/**
 * @param {Document} doc  a compiled IR document
 * @returns {{ nodes: Map<string, object>, edges: object[], graphs: object }}
 */
export function extractGraphs(doc) {
  const root = doc?.body?.firstChild;
  const graphs = retainedGraphs(doc);
  const nodes = new Map();
  const edges = [];
  if (!root) return { nodes, edges, graphs };

  const record = (node) => {
    if (!node?.id || nodes.has(node.id)) return nodes.get(node.id);
    const entry = {
      id: node.id,
      tag: node.localName,
      name: node.getAttribute?.('name') ?? node.getAttribute?.('field') ?? null,
      type: node.dataset?.['typeName'] ?? null,
      expect: node.dataset?.expect ?? null,
      pass: node.dataset?.rewritePass ?? null,
      file: node.dataset?.sourceFile ?? node.dataset?.originFile ?? node.dataset?.file ?? null,
      row: toInt(node.dataset?.row),
      col: toInt(node.dataset?.col),
      endRow: toInt(node.dataset?.endRow),
      endCol: toInt(node.dataset?.endCol),
      error: node.dataset?.errorKind ?? null,
    };
    nodes.set(node.id, entry);
    return entry;
  };

  const link = (from, to, kind, label) => {
    if (!from?.id || !to?.id) return;
    record(from); record(to);
    edges.push({ from: from.id, to: to.id, kind, label });
  };

  const uses = new Map([...graphs.scope?.scopes.values() ?? []]
    .flatMap(scope => [...scope.uses].map(use => [use.id, use])));
  for (const [id, declaration] of graphs.scope?.resolutions ?? []) {
    link(uses.get(id) ?? doc.getElementById(id), declaration, 'binding', 'resolves to');
  }
  for (const expectation of graphs.types?.expectations ?? []) {
    const source = typeof expectation.source === 'function' ? expectation.source() : expectation.source;
    link(expectation.value, source, 'expectation', expectation.site ?? 'expects');
  }
  const provenance = graphs.program?.provenance
    ?? [...root.querySelectorAll('[data-rewrite-of]')].map(node => ({
      node, source: doc.getElementById(node.dataset.rewriteOf), pass: node.dataset.rewritePass,
    }));
  for (const fact of provenance) {
    if (fact.source && fact.source !== fact.node) {
      link(fact.node, fact.source, 'provenance', fact.pass ?? 'rewritten from');
    }
  }

  return { nodes, edges, graphs };
}

/** Group edges by kind, for a legend or per-kind toggles. */
export function countByKind(edges) {
  const counts = Object.fromEntries(EDGE_KINDS.map(kind => [kind, 0]));
  for (const edge of edges) counts[edge.kind] = (counts[edge.kind] ?? 0) + 1;
  return counts;
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
