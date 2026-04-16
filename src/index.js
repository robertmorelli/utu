// Public API for the Utu compiler.

export { createCompiler, initParser } from './compiler/compiler.js';
export { treeToIR, createIRDocument, resetNodeIds, nextNodeId, restampSubtree } from './compiler/parse.js';
export { buildGraph } from './compiler/build-graph.js';
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
export { resolveMethods } from './compiler/resolve-methods.js';
export { createDslArtifactState, collectDslArtifacts, stampDslArtifacts } from './compiler/collect-dsl-artifacts.js';
export { expandDsls } from './compiler/expand-dsls.js';
export { createStandardDsls } from './compiler/standard-dsls.js';
export { PLATFORM_SOURCES } from './compiler/platform-sources.generated.js';
export { T } from './compiler/ir-tags.js';
