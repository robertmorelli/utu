// Public API for the Utu compiler.

export { generateBindingsFromProgram } from './bindings/generate.js';

import {
  glueIsEmpty, glueModuleSource, importObjectFromEval, importObjectFromGlue,
  liveGlueFields, readRuntimeSpec, utuRuntimeImports,
} from './runtime/host-imports.js';

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
 * `@es` bodies are evaluated as the exports of a generated ES module, which is
 * what allows them to `import` npm packages and use top-level `await`. The
 * module is written next to the project's `node_modules` so bare specifiers
 * resolve the way they would from the project's own source.
 *
 * Either way this executes JavaScript carried in the compiled document —
 * embedders calling this accept eval-like semantics for any `@es` body.
 *
 * @param {Document} doc
 * @param {{projectRoot?: string, wasm?: Uint8Array}} [options]
 *   `projectRoot` is where npm imports resolve from. `wasm` is the emitted
 *   binary; passing it drops any `@es` binding the binary does not import, so
 *   the glue module neither carries nor loads dead dependencies.
 * @returns {Promise<Record<string, Record<string, unknown>>>}
 */
export async function buildImportObject(doc, options = {}) {
  const root = doc?.body?.firstChild;
  const declared = readRuntimeSpec(root, 'dslImportsJs') ?? {};
  const live = options.wasm ? await liveGlueFields(options.wasm) : null;
  // Filter before either loader path. An empty live set must not fall back to
  // evaluating the original (dead) imports, especially in browser bundles.
  const spec = live ? Object.fromEntries(Object.entries(declared).map(([module, fields]) =>
    [module, Object.fromEntries(Object.entries(fields).filter(([name]) => live.has(name)))],
  )) : declared;

  const glue = glueIsEmpty(spec) ? null : await loadGlueModule(spec, options, live);
  const imports = glue ? importObjectFromGlue(spec, glue) : importObjectFromEval(spec);

  addClosureRuntime(imports, root);
  return imports;
}

/**
 * Write the glue module to disk and import it, or return null to fall back.
 *
 * Null means "this host has no module loader" — the VS Code web extension and
 * sandboxed embedders land here and get the eval path, which covers every `@es`
 * body that does not reach for npm.
 */
async function loadGlueModule(spec, options, live = null) {
  const source = glueModuleSource(spec, live);
  if (!source) return null;
  let moduleUrl;
  try {
    // In a browser bundle these resolve to stubs that throw, which the catch
    // below turns into the eval fallback — the intended behaviour there.
    const [fs, path, os, url] = await Promise.all([
      import('node:fs/promises'), import('node:path'),
      import('node:os'), import('node:url'),
    ]);
    const dir = await glueDirectory(fs, path, os, options.projectRoot ?? process.cwd());
    const file = path.join(dir, `glue-${digestOf(source)}.mjs`);
    // Content-addressed, so a concurrent writer can only be writing identical
    // bytes. Written before import because bare specifiers resolve from the
    // file's own location, not from a data: URL or the cwd.
    await fs.writeFile(file, source);
    moduleUrl = url.pathToFileURL(file).href;
  } catch {
    return null;
  }
  return import(moduleUrl);
}

/**
 * FNV-1a over the glue source, as a cache key.
 *
 * Only needs to separate distinct glue modules within a directory, so a short
 * non-cryptographic digest is enough — and it keeps `node:crypto` out of a
 * module that also has to bundle for the browser.
 */
function digestOf(source) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash = Math.imul(hash ^ source.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Pick a directory the glue module can be imported from.
 *
 * `node_modules/.utu` is preferred because Node resolves a bare specifier by
 * walking up from the importing file — landing inside `node_modules` puts the
 * project's dependencies one directory up. Projects without dependencies fall
 * back to a temp directory, where builtins and relative paths still resolve.
 */
async function glueDirectory(fs, path, os, projectRoot) {
  const nested = path.join(projectRoot, 'node_modules', '.utu');
  try {
    await fs.access(path.join(projectRoot, 'node_modules'));
    await fs.mkdir(nested, { recursive: true });
    return nested;
  } catch {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'utu-glue-'));
  }
}

/** Attach the `utu` runtime namespace the compiled module expects. */
function addClosureRuntime(imports, root) {
  const closures = readRuntimeSpec(root, 'closureRuntime');
  const promises = readRuntimeSpec(root, 'promiseRuntime');
  if (!closures && !promises) return;
  Object.assign(imports.utu ?? (imports.utu = {}), utuRuntimeImports(closures, promises));
}
