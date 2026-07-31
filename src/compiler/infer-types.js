// Legacy compatibility facade over the canonical type graph solver.
// New compiler code should call settleTypeGraph() and projectTypeGraph()
// explicitly. This module remains public for standalone pass consumers.

import { projectTypeGraph, settleTypeGraph } from './type-graph.js';

export { typeNodeToStr, fnReturnType } from './ir-helpers.js';

export function inferTypes(doc, typeIndex) {
  const graph = settleTypeGraph(doc, typeIndex);
  projectTypeGraph(graph);
  return graph;
}
