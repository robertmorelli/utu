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
