// graph-view.js — read the compiler's graphs back out as nodes and edges
//
// utu records several graphs directly on the IR rather than in side structures,
// so "extracting" them is really just naming the attributes that already carry
// them:
//
//   binding      data-binding-id     a use → the declaration it resolves to
//   expectation  data-expect-from    a value → the declaration whose type it
//                                    must satisfy (docs/type-graph.md)
//   provenance   data-rewrite-of     a synthesised node → what it was rewritten
//                                    from, across every lowering pass
//
// Nothing here computes anything. If a graph needs deriving, it belongs in the
// pass that knows how — this is the read side, shared by the visualiser and by
// anything else that wants to traverse rather than re-query the DOM.

export const EDGE_KINDS = Object.freeze(['binding', 'expectation', 'provenance']);

/**
 * @param {Document} doc  a compiled IR document
 * @returns {{ nodes: Map<string, object>, edges: object[] }}
 */
export function extractGraphs(doc) {
  const root = doc?.body?.firstChild;
  const nodes = new Map();
  const edges = [];
  if (!root) return { nodes, edges };

  const record = (node) => {
    if (!node?.id || nodes.has(node.id)) return nodes.get(node.id);
    const entry = {
      id: node.id,
      tag: node.localName,
      name: node.getAttribute?.('name') ?? node.getAttribute?.('field') ?? null,
      type: node.dataset?.['typeName'] ?? null,
      expect: node.dataset?.expect ?? null,
      pass: node.dataset?.rewritePass ?? null,
      file: node.dataset?.sourceFile ?? null,
      row: toInt(node.dataset?.row),
      col: toInt(node.dataset?.col),
      endRow: toInt(node.dataset?.endRow),
      endCol: toInt(node.dataset?.endCol),
      error: node.dataset?.errorKind ?? null,
    };
    nodes.set(node.id, entry);
    return entry;
  };

  const link = (fromNode, toId, kind, label) => {
    if (!toId) return;
    const target = doc.getElementById(toId);
    if (!target) return;
    record(fromNode);
    record(target);
    edges.push({ from: fromNode.id, to: target.id, kind, label });
  };

  for (const node of root.querySelectorAll('*')) {
    if (!node.localName?.startsWith('ir-')) continue;

    if (node.dataset.bindingId) {
      link(node, node.dataset.bindingId, 'binding', 'resolves to');
    }
    if (node.dataset.expectFrom) {
      link(node, node.dataset.expectFrom, 'expectation', node.dataset.expectSite ?? 'expects');
    }
    // Provenance names an *origin* id, which is often the id of a node that
    // has since been replaced — `link` drops those. A synthetic node inherits
    // its origin id from its source, so it can also name itself; skip that.
    if (node.dataset.rewriteOf && node.dataset.rewriteOf !== node.id) {
      link(node, node.dataset.rewriteOf, 'provenance', node.dataset.rewritePass ?? 'rewritten from');
    }
  }

  return { nodes, edges };
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
