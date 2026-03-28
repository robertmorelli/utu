# Compiler Package

The compiler now lives under `packages/compiler/`.

Primary entrypoints:

- [`index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/index.js)
- [`api/index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/api/index.js)

Layout:

- `core/`: compile orchestration and binaryen integration
- `frontend/`: phase-oriented frontend entrypoints
  See [`frontend/README.md`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/frontend/README.md)
- `backends/`: WAT and JS emitters
  WAT now lives under [`backends/wat/`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat)
  with helper splits in [`backends/wat/parse.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/parse.js)
  and [`backends/wat/protocol.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/protocol.js)
- `shared/`: cross-phase compiler helpers
- `api/`: stable facade for CLI, LSP, and future workspace/session code

Import rule:

- hosts and scripts should prefer `packages/compiler/index.js` or `packages/compiler/api/index.js`
- no root-level compiler ownership files remain; use this package directly
