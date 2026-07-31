# Type graph refactor

- [x] Represent every IR value with explicit `actual` and `expected` slots.
- [x] Build declared-context edges once: binding, assignment, argument, field, return.
- [x] Support callable-value argument expectations and arity.
- [x] Add semantic expectations: Bool conditions, confluence, and `orelse`.
- [x] Fix return edges so `return e` constrains `e`, never the void statement.
- [x] Contextualize literals, closures, and implicit struct literals from graph expectations.
- [x] Replace recursive expression inference with one dependency worklist.
- [x] Resolve field, call, operator, and deferred-parent types through that worklist.
- [x] Replace independent type checks with one graph comparison pass.
- [x] Insert closure decay only through the canonical compatibility rule.
- [x] Derive mismatch blame from actual and expected graph paths.
- [x] Remove fixed iteration limits and duplicated context/type lookup code.
- [x] Keep non-type validation separate: names, mutability, shape, and exhaustiveness.
- [x] Add regressions for callable values, assert, explicit returns, closure contexts, implicit structs, and decay signatures.
- [x] Remove obsolete inference, literal, expectation, and assumption passes.
- [x] Run all tests in both debug modes after the final edit.
- [x] Activate method, static, callable, field, and operator facts from the graph.
- [x] Reduce method resolution to a compatibility facade.
- [x] Move arity, unknown-member, and nullable-access checks onto graph facts.
- [x] Drive closure coercions from graph expectation edges.
- [x] Settle contextual actualization under one graph scheduler.
- [x] Re-run both debug modes and the production build after graph activation.

## Final simplification

- [x] Emit declaration expectations directly while building the graph.
- [x] Delete the separate type-context enumeration pass.
- [x] Collapse unary, binary, index, slice, and index-assignment lowering into one table-driven rewrite.
- [x] Carry resolved type/function facts onto lowered call nodes.
- [x] Replace rewrite settling with one lowering pass and one final graph build.
- [x] Keep compatibility facades only where removing them would break the public API.
- [x] Run both debug modes, the production build, and measure final line reduction.

## Semantic fact completion

- [x] Represent unresolved transforms as graph failures and report them centrally.
- [x] Expose canonical graph queries for actual, expected, binding, call, field, and origin facts.
- [x] Make backend null emission consume recorded expectations.
- [x] Add one graph-aware replacement helper and use it in typed lowerings.
- [x] Record coercions as graph plans and lower from that list.
- [x] Type closure captures exclusively from graph actual facts.
- [x] Retain resolved field declarations and backend field indices on graph slots.
- [x] Add a small declaration dependency graph for recursion and variance checks.
- [x] Expose dependency invalidation for incremental analysis.
- [x] Keep control flow, mutability, exhaustiveness, and representation concerns separate.
- [x] Run both debug modes, build, and measure the final result.

## Final graph polish

- [x] Remove redundant graph wrappers and repeated fact lookups.
- [x] Collapse operation diagnostics into graph failures.
- [x] Simplify binding and declaration lookup helpers.
- [x] Remove stale compatibility state from backend contexts.
- [x] Keep actualization and rule construction explicit rather than over-generic.
- [x] Run both debug modes, build, and measure the final delta.

## Retained compiler graphs

- [x] Replace transient binding frames with an explicit retained scope graph.
- [x] Build and retain a resolved call/effect graph with transitive effects.
- [x] Build and retain a structured control-flow graph.
- [x] Build and retain a heap representation/layout graph.
- [x] Retain type, declaration, module, scope, call, control-flow, and layout graphs on the document.
- [x] Expose all retained graphs through analysis results and snapshots.
- [x] Use the call graph for transitive async runtime discovery.
- [x] Use the layout graph in heap-type construction.
- [x] Keep graph construction compact and preserve all existing behavior.
- [x] Run both debug modes and the production build.
