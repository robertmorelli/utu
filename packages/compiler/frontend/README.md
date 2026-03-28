# Compiler Frontend

This directory exposes the phase-oriented entrypoints for UTU's shared frontend.

- `parse/` owns tolerant tree-sitter parsing and syntax diagnostics.
- `diagnostics/` owns syntax-diagnostic helpers and document-level syntax-diagnostic entrypoints.
- `bind/` owns symbol-binding entrypoints and returns binding snapshots.
- `sema/` owns semantic-analysis entrypoints and returns semantic snapshots.
- `expand.js` remains the shared source expansion surface used by both compiler and editor flows.
- `expand/shared.js`, `expand/collect.js`, `expand/emit-declarations.js`, and `expand/emit-expressions.js` now hold the phase-oriented expansion internals.
- `tree.js` remains the low-level tree traversal helper used by frontend and backend code.

Stable entrypoints:

- `parse/index.js`
- `diagnostics/index.js`
- `bind/index.js`
- `sema/index.js`

When adding a new language feature, prefer touching the phase-specific entrypoint first and then the owned implementation below it.
