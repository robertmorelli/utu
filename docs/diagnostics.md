# Diagnostics

Utu should be able to track these common compiler-caught bug classes with rich metadata:

1. Parse errors
2. Import cycles
3. Unknown imports / platform imports
4. Entry-surface conflicts
5. Module variance violations
6. Unknown types
7. Unknown variables
8. Unknown fields
9. Unknown methods
10. Implicit struct-init inference failures

For each diagnostic, Utu should preserve:

- `kind`: stable machine-readable category
- `message`: human-readable explanation
- `file`, `start`, `end`: primary source location
- `originId`: stable source identity even after rewrites
- `rewritePass`, `rewriteKind`: if the failing node was synthesized
- related nodes when relevant:
  - import site + imported module
  - use site + declaration site
  - rewritten node + source node
  - conflicting entry surfaces
  - variance declaration + bad use site

Current implementation support:

- IR-stamped diagnostics use:
  - `data-error`
  - `data-error-kind`
  - `data-error-message`
  - `data-error-data`
- Thrown compiler errors may attach:
  - `error.diagnostic.kind`
  - `error.diagnostic.message`
  - `error.diagnostic.primary`
  - `error.diagnostic.related`

This gives the editor, CLI, and debugger enough information to explain not just
what failed, but what original source node it came from and how rewrites moved
it through the pipeline.
