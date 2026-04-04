# More Stages Plan (A2, E2.5, E2.6)

This is a concrete plan to make expansion logic be stage files, not sidecar files loaded by stages.

Current problem:
- `e2_5_expand/collect/*` and `e2_5_expand/emit/*` are mixins on `ModuleExpander`.
- Stage passes call into this subsystem, but the subsystem still owns behavior.
- We want stage passes to own behavior directly.

## Target Rule

Every compiler behavior executes from a stage file (`a*` / `e*`), with explicit artifacts passed between stages.

## Required Split

`a2`, `e2.5`, and `e2.6` should each be split into at least 3 passes.

## A2 Split (Analysis)

Create explicit analysis passes:

1. `a2.14` Load Imports
- Own file loading and parse caching from `e2_5_expand/module-loading.js`.
- Output artifact: `analyses["a2.14"] = { loadedFiles, moduleBindings, parseCache, diagnostics }`.

2. `a2.15` Collect Top-Level Decls
- Move logic from `e2_5_expand/collect/top-level.js`.
- Build module templates, tagged protocol/type maps, and top-level symbol seeds.
- Output artifact: `analyses["a2.15"] = { moduleTemplates, topLevelFacts }`.

3. `a2.16` Build Namespace Model
- Move logic from:
  - `collect/namespaces-types.js`
  - `collect/namespaces-open.js`
  - `collect/namespaces-naming.js`
  - `collect/namespaces-expand.js`
- Output artifact: `analyses["a2.16"] = { namespaceCache, namespaceOrder, nameMangles }`.

4. `a2.17` Collect Symbol/Return Facts
- Move logic from `collect/symbols.js`.
- Output artifact: `analyses["a2.17"] = { valueTypes, fnReturns, assocReturns, protocolDispatchTables }`.

Use `a2.14 -> a2.15 -> a2.16 -> a2.17` before declaration rewrite.

## E2.5 Split (Declaration Rewrite)

Create explicit rewrite passes:

1. `e2.5.1` Emit Type Declarations
- Move logic from `emit/declarations-types.js`.
- Rewrites type/protocol declaration forms using `a2.16` namespace model.

2. `e2.5.2` Emit Function and Runtime Declarations
- Move logic from:
  - `emit/declarations-functions.js`
  - `emit/declarations-runtime.js`
- Rewrites function/global/jsgen declarations and protocol impl names.

3. `e2.5.3` Emit Top-Level Items and Materialize Source
- Move logic from `emit/declarations-items.js`.
- Produces expanded source text from rewritten declaration units.

4. `e2.5.4` Parse Materialized Source to Stage Tree
- Keep existing tree replacement/parsing logic from current `e2_5.js`.
- Output remains replacement `tree`, `legacyTree`, and expansion diagnostics.

Use `e2.5.1 -> e2.5.2 -> e2.5.3 -> e2.5.4`.

## E2.6 Split (Expression Rewrite)

Create explicit rewrite passes:

1. `e2.6.1` Type/Value Resolution Layer
- Move logic from:
  - `emit/type-info.js`
  - `emit/expressions-values.js`
- Builds expression-local type and value lookup helpers.

2. `e2.6.2` Call and Pipe Rewriting
- Move logic from:
  - `emit/expressions-resolution.js`
  - `emit/expressions-calls.js`
  - `emit/expressions-pipe.js`
- Handles associated/protocol dispatch and pipe normalization.

3. `e2.6.3` Core and Control Rewriting
- Move logic from:
  - `emit/expressions-core.js`
  - `emit/expressions-control.js`
- Handles the rest of expression normalization.

Use `e2.6.1 -> e2.6.2 -> e2.6.3`.

## File-to-Stage Mapping

Move these files into stage passes:

- `e2_5_expand/collect/top-level.js` -> `a2.15`
- `e2_5_expand/collect/symbols.js` -> `a2.17`
- `e2_5_expand/collect/namespaces-types.js` -> `a2.16`
- `e2_5_expand/collect/namespaces-open.js` -> `a2.16`
- `e2_5_expand/collect/namespaces-naming.js` -> `a2.16`
- `e2_5_expand/collect/namespaces-expand.js` -> `a2.16`
- `e2_5_expand/emit/declarations-types.js` -> `e2.5.1`
- `e2_5_expand/emit/declarations-functions.js` -> `e2.5.2`
- `e2_5_expand/emit/declarations-runtime.js` -> `e2.5.2`
- `e2_5_expand/emit/declarations-items.js` -> `e2.5.3`
- `e2_5_expand/emit/type-info.js` -> `e2.6.1`
- `e2_5_expand/emit/expressions-values.js` -> `e2.6.1`
- `e2_5_expand/emit/expressions-resolution.js` -> `e2.6.2`
- `e2_5_expand/emit/expressions-calls.js` -> `e2.6.2`
- `e2_5_expand/emit/expressions-pipe.js` -> `e2.6.2`
- `e2_5_expand/emit/expressions-core.js` -> `e2.6.3`
- `e2_5_expand/emit/expressions-control.js` -> `e2.6.3`
- `e2_5_expand/module-loading.js` -> `a2.14`

## Transitional Wrappers to Remove

Delete after migration:

- `e2_5_expand/mixin.js`
- `e2_5_expand/module-expander.js`
- any side-effect import chain that auto-installs mixins

`e2_5_expand/core.js` should be split into stage-local helper modules:
- A2 helper module for namespace/template discovery.
- E2.6 helper module for expression/type helpers.

## Implementation Order (Safe)

1. Add new stage files with pure functions first (no mixins).
2. Make stage runner call new files in sequence.
3. Keep old mixin path only as fallback for one commit.
4. Switch `a2.14/e2.5/e2.6` to new artifacts only.
5. Delete mixin system and old files.
6. Update `packages/compiler/stages.md` with new pass list.

## Done Condition

Done when:
- no stage behavior depends on mixin side effects
- no `installMixin(...)` remains
- expansion behavior only flows through stage pass files
- `stage2.js` is the sole orchestration entrypoint for expansion logic
