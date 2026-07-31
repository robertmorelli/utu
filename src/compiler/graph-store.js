// Shared document-local storage for retained compiler graphs.

const GRAPHS = Symbol.for('utu.semanticGraphs');

/**
 * The stable names exposed by analysis results. Graph values remain purpose-
 * specific because their edges have different meanings.
 *
 * @typedef {Object} GraphSet
 * @property {object} [modules]
 * @property {object} [elaboration]
 * @property {object} [program]
 * @property {object} [scope]
 * @property {object} [types]
 * @property {object} [calls]
 * @property {object} [controlFlow]
 * @property {object} [layout]
 * @property {object} [declarations]
 * @property {object} [diagnostics]
 * @property {object} [ranges]
 * @property {object} [backend]
 */

export function retainGraph(doc, name, graph) {
  const graphs = doc[GRAPHS] ??= Object.create(null);
  graphs[name] = graph;
  return graph;
}

/** Replace a related set of retained graphs as one explicit operation. */
export function replaceRetainedGraphs(doc, replacements) {
  const graphs = doc[GRAPHS] ??= Object.create(null);
  Object.assign(graphs, replacements);
  return graphs;
}

/** @returns {GraphSet} */
export function retainedGraphs(doc) {
  return doc?.[GRAPHS] ?? Object.create(null);
}

/** Assert that a phase-local graph belongs to the supplied program revision. */
export function assertGraphRevision(graph, program, name = graph?.kind ?? 'graph') {
  if (!graph) throw new Error(`${name}: missing retained graph`);
  if (graph.programRevision == null) {
    throw new Error(`${name}: graph has no program revision`);
  }
  if (graph.programRevision !== program.revision) {
    throw new Error(`${name}: stale graph (program revision ${graph.programRevision}, expected ${program.revision})`);
  }
  return graph;
}
