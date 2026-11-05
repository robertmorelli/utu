# Retained compiler graphs

See [Compiler architecture](compiler-architecture.md) for pipeline ordering and
destructive phase boundaries.

Compiled documents retain semantic graphs under `retainedGraphs(doc)`. An
analysis result exposes the same object as `result.graphs` and
`result.snapshot.graphs`.

| name | purpose |
|---|---|
| `modules` | source-file imports, blame sites, and topological order |
| `elaboration` | modules, instantiation requests/products, substitutions, materialization, and failures |
| `program` | phase-local nodes by ID, kind, name, origin, surface, and provenance |
| `scope` | lexical scopes, declarations, uses, resolutions, and closure captures |
| `types` | actual/expected slots, propagation rules, failures, and coercions |
| `calls` | resolved caller/callee edges and transitive effects such as `await` |
| `controlFlow` | per-surface entry/exit, branch, loop, break, and return edges |
| `layout` | Wasm heap types and representation dependencies |
| `declarations` | nominal declaration dependencies and invalidation |
| `diagnostics` | canonical diagnostic failures and retained blame nodes |
| `ranges` | source and semantic entries plus the shared interval index |
| `backend` | settled representation, function, runtime-import, and export plan |

The graphs remain separate because their edge meanings differ. Passes may
consume another graph's settled facts, but no graph silently changes the
semantics of another.

## Phase validity

The `program` graph carries a monotonically increasing `revision`. Every scope,
type, call, control-flow, and backend graph records the revision it was built
against. Closure/operator lowering and backend-control lowering are destructive
boundaries: the compiler refreshes the program index and rebuilds the complete
semantic set after each one. `buildBackendPlan` rejects mixed graph revisions.

Graphs retain live DOM nodes for source identity and explainability, so callers
must not treat a compiled document as an incrementally editable syntax tree.
Codegen fingerprints the complete projected IR. If an embedder deliberately
edits that IR, codegen performs a full scope/type/call/backend reanalysis rather
than combining the old plan with rediscovered fragments.

## Canonical facts and compatibility projection

Scope resolutions, actual/expected types, resolved functions and fields,
diagnostics, runtime requirements, and backend decisions are canonical graph
facts. `projectGraphs()` writes the legacy `data-binding-*`, `data-type-name`,
`data-fn-*`, `data-field-*`, diagnostic, and runtime attributes in one explicit
compatibility step. Typed destructive lowerings use an explicit interim type
projection, then immediately invalidate and rebuild the affected graphs.

Analysis snapshots contain a frozen copy of the graph-set view. Individual
graphs remain queryable retained objects, but adding a later document-local
graph does not mutate an already-created snapshot's set of graphs.
