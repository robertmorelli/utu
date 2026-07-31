# Structural compiler migration

No item is complete until old consumers and duplicate traversals are removed,
compatibility behavior is tested, and retained analysis facts survive lowering.

## 1. Flat declaration materialization

- [x] Make elaboration own imported module templates and import blame.
- [x] Resolve explicit aliases and implicit generic instantiations in the graph.
- [x] Materialize concrete declarations directly under `ir-source-file`.
- [x] Apply self/member renaming and type substitution while materializing.
- [x] Remove concrete clone-then-hoist intermediates from the compiler path.
- [x] Keep public compatibility entry points with identical behavior.
- [x] Preserve import, instantiation, substitution, and materialization edges.

## 2. Shared program index

- [x] Add a retained phase-level index for node ID, kind, name, origin, and code surface.
- [x] Build it once after each destructive phase boundary.
- [x] Make scope, type, call, validation, graph-view, and codegen consumers use it.
- [x] Remove private duplicate node/function indexes and DOM discovery walks.

## 3. Backend representation plan

- [x] Build and retain one settled backend plan after semantic checking.
- [x] Include type registry, layout, functions, calls, runtime imports, and exports.
- [x] Make heap, closure, function, and module codegen consume the plan.
- [x] Keep fingerprinted standalone-codegen fallbacks for modified documents.
- [x] Remove backend declaration relinking and runtime rediscovery from the normal compiler path.

## 4. Compatibility projection

- [x] Make scope, type, call, field, diagnostic, and provenance graphs canonical.
- [x] Add one explicit graph-to-DOM compatibility projection pass.
- [x] Remove per-pass projection writes where settled graph facts suffice.
- [x] Preserve public `data-*` behavior and graph visualisation.
- [x] Ensure clone/replacement helpers transfer canonical facts and provenance.

## 5. Verification

- [x] Cover imports, aliases, nested instantiations, retained blame, and codegen plans.
- [x] Run both debug modes after each completed section.
- [x] Run production build and `git diff --check`.
- [x] Measure logical LOC without counting formatting or comment removal as progress.
