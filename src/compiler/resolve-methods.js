// Member resolution is an activation step in the type graph. These exports are
// retained as small compatibility facades for embedders using the old passes.

import { buildTypeGraph, projectTypeGraph, solveTypeGraph } from './type-graph.js';

export function resolveMethods(doc, typeIndex) {
  const graph = solveTypeGraph(buildTypeGraph(doc, typeIndex));
  projectTypeGraph(graph);
  return graph;
}

export const stampFieldAccessTypes = resolveMethods;
