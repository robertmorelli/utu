// Public API for the Utu compiler.

import { readRuntimeSpec, utuRuntimeImports } from './runtime/host-imports.js';

export { createCompiler, initParser } from './compiler/compiler.js';
export { treeToIR, createIRDocument, resetNodeIds, nextNodeId, restampSubtree } from './compiler/parse.js';
export { buildGraph, buildModuleGraph } from './compiler/build-graph.js';
export { clipFileIRTree } from './compiler/clip-file-ir-tree.js';
export { bringTargetToTopLevel } from './compiler/bring-target-to-top-level.js';
export { checkModuleVariance } from './compiler/check-module-variance.js';
export { lowerImplicitStructInit } from './compiler/lower-implicit-struct-init.js';
export { lowerPipe } from './compiler/lower-pipe.js';
export { inlineImports } from './compiler/inline-imports.js';
export { instantiateModules } from './compiler/instantiate-modules.js';
export { hoistModules } from './compiler/hoist-modules.js';
export { linkTypeDecls } from './compiler/link-type-decls.js';
export { resolveBindings } from './compiler/resolve-bindings.js';
export { inferTypes, typeNodeToStr, fnReturnType } from './compiler/infer-types.js';
export {
  actualType, actualizeTypeGraph, applyContextualRewrites, bindingOf, buildTypeGraph,
  checkTypeGraph, expectedTypes, invalidateTypeGraph, originOf, planCoercions,
  planContextualRewrites, projectTypeGraph, projectedActualType, projectedBindingOf,
  recordTypeGraph, resolvedFieldOf, resolvedFunctionOf, settleTypeGraph, solveTypeGraph,
} from './compiler/type-graph.js';
export { resolveMethods } from './compiler/resolve-methods.js';
export { buildDeclarationGraph, typeUses } from './compiler/declaration-graph.js';
export { buildElaborationGraph } from './compiler/elaboration-graph.js';
export { buildProgramIndex, nodesOf, refreshProgramIndex } from './compiler/program-index.js';
export { buildBackendPlan } from './compiler/backend-plan.js';
export { rebuildSemanticGraphs } from './compiler/semantic-analysis.js';
export { projectGraphs } from './compiler/project-graphs.js';
export {
  buildCallGraph, buildControlFlowGraph, buildLayoutGraph, buildTypeDeclarationGraph,
  retainGraph, retainedGraphs,
} from './compiler/semantic-graphs.js';
export { assertGraphRevision, replaceRetainedGraphs } from './compiler/graph-store.js';
export { createDslArtifactState, collectDslArtifacts, stampDslArtifacts } from './compiler/collect-dsl-artifacts.js';
export { expandDsls } from './compiler/expand-dsls.js';
export { createStandardDsls } from './compiler/standard-dsls.js';
export { PLATFORM_SOURCES } from './compiler/platform-sources.generated.js';
export {
  createExplainabilityArtifacts,
  pushDiagnostic,
  pushLowering,
  pushSizeFact,
  pushProfileFact,
  explainNode,
  loweringTrace,
} from './compiler/explainability.js';
export { collectAnalysisDiagnostics } from './compiler/collect-analysis-diagnostics.js';
export { createAnalysisSnapshot, collectRangeEntries } from './compiler/analysis-snapshot.js';
export { createAnalysisQueries } from './compiler/analysis-queries.js';
export { renderGraphHtml } from './compiler/graph-html.js';
export { formatDiagnostic, formatDiagnostics } from './compiler/format-diagnostics.js';
export { renderHighlightedSource, computeLineStarts, lineForOffset } from './compiler/source-renderer.js';
export { validateIrStructure } from './compiler/validate-ir-structure.js';
export { T } from './compiler/ir-tags.js';
export {
  buildModule,
  emitBinary,
  emitText,
  instantiateLowered,
  JS_STRING_BUILTINS_COMPILE_OPTIONS,
} from './compiler/codegen/index.js';

/**
 * Build a WebAssembly import object from DSL-emitted JS import artifacts.
 *
 * This intentionally evaluates JavaScript source from the compiled document
 * using `new Function('return ' + body)()`. Embedders that call this helper
 * are accepting eval-like semantics for any `@es` bodies in the source.
 *
 * @param {Document} doc
 * @returns {Record<string, Record<string, unknown>>}
 */
export function buildImportObject(doc) {
  const root = doc?.body?.firstChild;
  const imports = {};

  const raw = root?.dataset?.dslImportsJs;
  if (raw) {
    const spec = JSON.parse(raw);
    for (const [module, fields] of Object.entries(spec)) {
      imports[module] = {};
      for (const [field, body] of Object.entries(fields ?? {})) {
        const value = new Function(`return (${body});`)();
        imports[module][field] = typeof value === 'function' ? value : () => value;
      }
    }
  }

  addClosureRuntime(imports, root);
  return imports;
}

/** Attach the `utu` runtime namespace the compiled module expects. */
function addClosureRuntime(imports, root) {
  const closures = readRuntimeSpec(root, 'closureRuntime');
  const promises = readRuntimeSpec(root, 'promiseRuntime');
  if (!closures && !promises) return;
  Object.assign(imports.utu ?? (imports.utu = {}), utuRuntimeImports(closures, promises));
}
