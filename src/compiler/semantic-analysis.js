// Canonical rebuild boundary for phase-local semantic graphs.
//
// Destructive lowerings invalidate structure, scope, type, call, and control
// facts together. Rebuild them together so no caller can accidentally retain a
// mixed-revision set.

import { buildCallGraph, buildControlFlowGraph } from './semantic-graphs.js';
import { replaceRetainedGraphs } from './graph-store.js';
import { refreshProgramIndex } from './program-index.js';
import { resolveBindings } from './resolve-bindings.js';
import { settleTypeGraph } from './type-graph.js';

/**
 * @typedef {Object} SemanticGraphSet
 * @property {ReturnType<typeof refreshProgramIndex>} program
 * @property {ReturnType<typeof resolveBindings>} scope
 * @property {ReturnType<typeof buildTypeGraph>} types
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
