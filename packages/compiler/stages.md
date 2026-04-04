# packages/compiler stages

This document describes the compiler pipeline stages in `packages/compiler/pipeline.js`.

## Stage 1 (`stage1.js`): load, parse, normalize

Purpose: build the initial syntax artifacts and normalized stage tree.

Steps:
- `a1.1` (`a1_1.js`): load source context and setup inputs.
- `e1.2` (`e1_2.js`): parse source into the legacy syntax tree.
- `a1.3` (`a1_3.js`): collect syntax diagnostics.
- `e1.3` (`e1_3.js`): normalize syntax into the stage tree.
- `a1.4` (`a1_4.js`): collect header snapshot metadata.

## Stage 2 (`stage2.js`): expansion pipeline

Purpose: resolve declarations/imports and rewrite expanded forms before semantics.

Steps:
- `a2.0` (`a2_0.js`): tree-walk header items to cache type/module references.
- `a2.1` (`a2_1.js`): discover declarations.
- `a2.2` (`a2_2.js`): build module graph.
- `a2.3` (`a2_3.js`): resolve imports.
- `a2.4` (`a2_4.js`): construct namespaces.
- `a2.5` (`a2_5.js`): plan declaration expansion mode/recovery policy.
- `a2.6` (`a2_6.js`): normalize expansion options and gate whether expansion runs.
- `a2.14` (`a2_14.js`): load imported module files and initialize expansion parse cache state.
- `a2.15` (`a2_15.js`): collect top-level declaration/type/protocol facts.
- `a2.16` (`a2_16.js`): build the namespace model for construct-instantiated modules.
- `a2.17` (`a2_17.js`): collect value/function/associated return facts in source order.
- `e2.5.1` (`e2_5_1.js`): emit type/protocol declaration units.
- `e2.5.2` (`e2_5_2.js`): emit function/global/jsgen declaration units.
- `e2.5.3` (`e2_5_3.js`): materialize one expanded source artifact from namespace and top-level outputs.
- `e2.5.4` (`e2_5_4.js`): parse the materialized source back into the Stage-2 tree contract.
- `a2.7` (`a2_7.js`): index post-expansion syntax nodes and residual module syntax.
- `a2.8` (`a2_8.js`): index expanded declarations.
- `a2.9` (`a2_9.js`): detect expanded declaration collisions.
- `a2.10` (`a2_10.js`): plan Stage-2 rewrite walkers from tree facts.
- `a2.11` (`a2_11.js`): validate expansion boundary and aggregate diagnostics.
- `a2.12` (`a2_12.js`): freeze Stage-2 expansion facts artifact.
- `e2.6.1` (`e2_6_1.js`): reserve the type/value resolution rewrite boundary.
- `e2.6.2` (`e2_6_2.js`): reserve the call/pipe rewrite boundary.
- `e2.6.3` (`e2_6_3.js`): reserve the core/control rewrite boundary.
- `e2.7` (`e2_7.js`): post-expansion normalization.
- `e2.8` (`e2_8.js`): prune construct declarations.
- `e2.9` (`e2_9.js`): prune file import declarations.
- `e2.10` (`e2_10.js`): prune module declarations.
- `e2.11` (`e2_11.js`): normalize expansion residuals.
- `e2.12` (`e2_12.js`): finalize expanded stage tree.

## Stage 3 (`stage3.js`): semantic analysis

Purpose: produce semantic information needed for lowering and backend generation.

Steps:
- `a3.1` (`a3_1.js`): index symbols and declarations.
- `a3.2` (`a3_2.js`): bind references.
- `a3.3` (`a3_3.js`): perform semantic checks and produce source metadata.
- `a3.4` (`a3_4.js`): normalize compile target/intent and construct compile plans.

## Stage 4 (`stage4.js`): lowering and backend IR

Purpose: lower checked stage trees and build backend-oriented artifacts.

Steps:
- `a4.1` (`a4_1.js`): collect lowering metadata.
- `e4.1` (`e4_1.js`): lower high-level constructs.
- `a4.2` (`a4_2.js`): collect Binaryen/backend metadata.
- `e4.2` (`e4_2.js`): build Binaryen-ready artifacts.

## Stage 5 (`stage5.js`): final output emission

Purpose: validate the final representation and emit compiler outputs.

Steps:
- `a5.1` (`a5_1.js`): validate/optimize output plan.
- `e5.1` (`e5_1.js`): build backend artifacts (WAT/Binaryen).
- `a5.2` (`a5_2.js`): analyze JS emission inputs (string table/import plan/export notes).
- `e5.2` (`e5_2.js`): emit final output artifacts.
