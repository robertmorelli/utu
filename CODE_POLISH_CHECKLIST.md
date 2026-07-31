# Compiler polish checklist

The goal was to reinforce the current architecture without introducing a
generic pass framework or breaking compatibility entry points.

- [x] Break semantic/lowering dependency cycles and isolate shared ABI/operator data.
- [x] Add a single semantic-graph rebuild operation used by compilation and standalone codegen.
- [x] Centralize graph revision validation and make retained graph replacement explicit.
- [x] Separate contextual rewrite planning/application from type-constraint solving.
- [x] Give canonical graph queries and compatibility projections unambiguous names.
- [x] Split type-graph diagnostic reporting from graph construction and solving.
- [x] Document the public graph-set, type-graph, and backend-plan shapes with JSDoc.
- [x] Clarify source-module graph and type-projection naming while preserving aliases.
- [x] Mark and test legacy compatibility facades as such.
- [x] Consolidate architecture documentation and add a current pipeline diagram.
- [x] Remove the remaining recursive codegen import cycle by injecting expression emission.
- [x] Add a reproducible Rust-vs-utu Wasm smoke benchmark with binary and bundle sizing.
- [x] Pass recursive cycle checks, both debug test modes, production build, bundle smoke test, and diff checks.
