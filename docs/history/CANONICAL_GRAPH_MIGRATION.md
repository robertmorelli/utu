# Canonical graph migration

The migration is complete only when semantic graphs are the compiler's source of
truth, destructive phases rebuild the facts they invalidate, and DOM `data-*`
values are an explicit compatibility projection rather than hidden pass state.

## 1. Identity and graph lifetime

- [x] Replace the process-global IR node counter with a document-local allocator.
- [x] Import and restamp cross-document modules, DSL products, and prelude clones against the destination document.
- [x] Rebuild the program, scope, type, call, and control-flow facts after every destructive semantic/backend boundary.
- [x] Record the program revision on retained graphs and reject mixed-revision backend plans.

## 2. Canonical semantic resolution

- [x] Store resolved functions and operators in type-graph slots instead of `data-fn-id` / `data-resolved-fn-id`.
- [x] Build call/effect edges from type-graph resolution facts.
- [x] Make operator lowering consume the type graph and let the post-lowering graph resolve generated calls.
- [x] Make binding, call, field, expected-type, and actual-type query helpers prefer canonical graphs, retaining DOM reads only as standalone compatibility fallbacks.

## 3. Backend and runtime plan

- [x] Derive closure and promise runtime imports from final type/call/program graphs.
- [x] Remove runtime discovery writes from closure lowering.
- [x] Put node types, expectations, bindings, call targets, fields, runtime imports, functions, layouts, and exports in one final backend plan.
- [x] Make codegen consume backend-plan queries instead of semantic DOM projections on the normal compiler path.
- [x] Detect post-compilation IR mutation with a complete backend fingerprint and perform full semantic/backend reanalysis instead of mixing stale and fresh facts.

## 4. Compatibility and analysis surface

- [x] Centralize settled semantic, diagnostic, and runtime `data-*` output in explicit projection functions.
- [x] Build analysis snapshots from a frozen graph-set view rather than exposing the mutable document graph container.
- [x] Preserve compatibility facades while making them project their graph results explicitly rather than becoming parallel sources of truth.
- [x] Document graph phase validity, compatibility projection, snapshots, and backend-plan ownership.

## 5. Cleanup and verification

- [x] Remove obsolete resolution/runtime helpers, partial fingerprints, stale comments, and duplicate normal-path fallbacks.
- [x] Add regressions for concurrent compiler instances, destination-document identity, canonical call/runtime facts, final graph freshness, complete backend reanalysis, and snapshot graph-set stability.
- [x] Run the full suite in both debug modes.
- [x] Run the production build and `git diff --check`.
