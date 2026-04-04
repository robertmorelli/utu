# packages/compiler stages

This document describes the compiler pipeline stages in `packages/compiler/pipeline.js`.

## Stage 1 (`stage1.js`): load, parse, normalize

Purpose: build the initial syntax artifacts and normalized stage tree.

Steps:
- `a1.1` (`analyze-load.js`): load source context and setup inputs.
- `e1.2` (`edit-parse.js`): parse source into legacy syntax artifacts.
- `a1.3` (`analyze-syntax-diagnostics.js`): collect syntax diagnostics.
- `e1.3` (`edit-syntax-normalize.js`): normalize syntax into the stage tree.
- `e1.4` (`edit-stage-tree.js`): finalize the public Stage-1 tree contract and tree helper boundary.
- `a1.5` (`analyze-source-layout.js`): analyze source layout for later header/index passes.
- `a1.4` (`analyze-header-snapshot.js`): collect header snapshot metadata.

## Stage 2 (`stage2.js`): expansion pipeline

Purpose: resolve declarations/imports and rewrite expanded forms before semantics.

Steps:
- `a2.0` (`analyze-header-references.js`): tree-walk header items to cache type/module references.
- `a2.1` (`analyze-discover-declarations.js`): discover declarations.
- `a2.2` (`analyze-build-module-graph.js`): build module graph.
- `a2.3` (`analyze-resolve-imports.js`): resolve imports.
- `a2.4` (`analyze-construct-namespaces.js`): construct namespaces.
- `a2.5` (`analyze-plan-declaration-expansion.js`): plan declaration expansion mode/recovery policy.
- `a2.6` (`analyze-prepare-declaration-expansion.js`): normalize expansion options and gate whether expansion runs.
- `a2.14` (`analyze-load-imports.js`): load imported module files and initialize expansion parse cache state.
- `a2.15` (`analyze-collect-top-level-declarations.js`): collect top-level declaration/type/protocol facts.
- `a2.16` (`analyze-build-namespace-model.js`): build the namespace model for construct-instantiated modules.
- `a2.17` (`analyze-collect-symbol-return-facts.js`): collect value/function/associated return facts in source order.
- `e2.5.0` (`edit-prepare-declaration-emission.js`): establish the explicit declaration-emission edit boundary and helper contract.
- `e2.5.1` (`edit-emit-type-declarations.js`): emit type/protocol declaration units.
- `e2.5.2` (`edit-emit-function-and-runtime-declarations.js`): emit function/global/jsgen declaration units.
- `e2.5.3` (`edit-materialize-expanded-source.js`): materialize one expanded source artifact from namespace and top-level outputs.
- `e2.5.4` (`edit-parse-materialized-source.js`): parse the materialized source back into the Stage-2 tree contract.
- `a2.7` (`analyze-index-expanded-tree.js`): index post-expansion syntax nodes and residual module syntax.
- `a2.8` (`analyze-index-expanded-declarations.js`): index expanded declarations.
- `a2.9` (`analyze-detect-expanded-collisions.js`): detect expanded declaration collisions.
- `a2.10` (`analyze-plan-rewrite-walks.js`): plan Stage-2 rewrite walkers from tree facts.
- `a2.11` (`analyze-validate-expansion-boundary.js`): validate expansion boundary and aggregate diagnostics.
- `a2.12` (`analyze-freeze-expansion-facts.js`): freeze Stage-2 expansion facts artifact.
- `a2.13` (`analyze-index-post-expansion-layout.js`): cache finalized Stage-2 layout facts for semantics.
- `e2.6.1` (`edit-type-value-resolution.js`): reserve the type/value resolution rewrite boundary.
- `e2.6.2` (`edit-call-and-pipe-rewriting.js`): reserve the call/pipe rewrite boundary.
- `e2.6.3` (`edit-core-and-control-rewriting.js`): reserve the core/control rewrite boundary.
- `e2.7` (`edit-post-expand-normalize.js`): post-expansion normalization.
- `e2.8` (`edit-prune-construct-declarations.js`): prune construct declarations.
- `e2.9` (`edit-prune-file-imports.js`): prune file import declarations.
- `e2.10` (`edit-prune-module-declarations.js`): prune module declarations.
- `e2.11` (`edit-normalize-expansion-residuals.js`): normalize expansion residuals.
- `e2.12` (`edit-finalize-expansion-tree.js`): finalize expanded stage tree.

## Stage 3 (`stage3.js`): semantic analysis

Purpose: produce semantic information needed for lowering and backend generation.

Steps:
- `a3.1` (`analyze-index-symbols-and-declarations.js`): index symbols and declarations.
- `a3.2` (`analyze-bind-references.js`): bind references.
- `a3.3` (`analyze-semantic-checks.js`): perform semantic checks and produce source metadata.
- `a3.4` (`analyze-plan-compile.js`): normalize compile target/intent and construct compile plans.

## Stage 4 (`stage4.js`): lowering and backend IR

Purpose: lower checked stage trees and build backend-oriented artifacts.

Steps:
- `a4.1` (`analyze-collect-lowering-metadata.js`): collect lowering metadata.
- `e4.1` (`edit-lower-to-backend-ir.js`): lower high-level constructs.
- `a4.2` (`analyze-collect-binaryen-metadata.js`): collect Binaryen/backend metadata.
- `a4.3` (`analyze-prepare-backend-metadata-defaults.js`): normalize backend metadata defaults before emission.
- `e4.2` (`edit-build-binaryen-artifacts.js`): build Binaryen-ready artifacts.

## Stage 5 (`stage5.js`): final output emission

Purpose: validate the final representation and emit compiler outputs.

Steps:
- `a5.1` (`analyze-validate-optimize-output-plan.js`): validate/optimize output plan.
- `e5.1` (`edit-build-backend-artifacts.js`): build backend artifacts (WAT/Binaryen).
- `a5.2` (`analyze-js-emission-inputs.js`): analyze JS emission inputs (string table/import plan/export notes).
- `e5.2` (`edit-emit-output-artifacts.js`): emit final output artifacts.
