# Compiler architecture

utu uses a mutable DOM IR for inspectable structural rewriting and retained,
purpose-specific graphs for canonical semantic facts. Codegen consumes one
sealed backend plan rather than rediscovering semantic decisions.

## Pipeline

```text
source files
    │ parse + clip
    ▼
source module graph ── inline imports + inject prelude
    │
    ▼
elaboration graph ── instantiate + materialize + hoist modules
    │
    ▼
program index ── scope graph ── type graph ── call/effect graph
    │                              │
    │                     contextual rewrite plan
    │                              │ apply
    │                              ▼
    ├──────── closure/operator lowering (destructive boundary)
    │                              │
    │                  rebuildSemanticGraphs()
    │                              │
    ├──────── backend-control lowering (destructive boundary)
    │                              │
    │                  rebuildSemanticGraphs()
    ▼
layout + declaration graphs ── backend plan ── WasmGC codegen
                                      │
                              compatibility projection
```

Every destructive boundary refreshes the program revision and rebuilds scope,
type, call, and control-flow graphs together. `buildBackendPlan` rejects
phase-local graphs from another revision. `projectGraphs` is the explicit
boundary that writes legacy `data-*` facts; normal codegen reads the backend
plan.

## Dependency direction

Shared syntax, type-string, operator, type-entry, and closure-ABI definitions
are dependency-neutral. Semantic graph builders consume them. Lowerings consume
settled semantic facts. Backend planning consumes rebuilt graphs, and codegen
consumes the plan. Semantic analysis never imports a lowering pass.

## Further reading

- [Retained compiler graphs](compiler-graphs.md)
- [Type graph](type-graph.md)
- [Import and module reachability](import-reachability.md)
- [Historical migration notes](history/)

## Resource ownership

`parseToIR` owns the temporary tree-sitter tree and releases it in `finally`,
including when document creation or conversion fails. The resulting DOM,
diagnostics, and analysis tokens contain copied facts. The public `treeToIR`
function borrows its input tree and leaves its lifetime to the caller, which
supports incremental parsing. Compiler-created parser trees use the owned path
for source files, preludes, and embedded UTU DSLs.

`buildModule` returns a module of the wasm backend (`src/compiler/wasm/`, see
docs/wasm-backend.md): plain JavaScript objects, with nothing to dispose.
`emitBinary` encodes it and has the engine validate the bytes; `emitText` prints
it.

## Source indexes and imports

Source ranges are indexed per file in a static balanced interval tree, built by
sorting and midpoint partitioning. Construction is O(n log n), storage is O(n),
and tree depth is O(log n), including duplicate keys. Empty and invalid intervals
are excluded; queries use half-open intervals and deterministic tie-breaking.
The index has no incremental-update API, so persistent insertion and randomized
balancing machinery are unnecessary.

The source-module graph checks DFS visitation before reading a file. A diamond
import reads and parses its shared dependency once; encountering an active node
reports an import cycle before attempting another read. Imports still retain
all individual edges for diagnostics.

See [closure lowering](closure-lowering.md) for capture semantics and the fixed
JavaScript ABI, and [compiler verification](compiler-testing.md) for test commands
and regression contracts.
