# WAT Backend

This directory owns the WAT backend.

Current entrypoints:

- [`index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/index.js)
- [`core.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/core.js)
- [`shared.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/shared.js)
- [`collect.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/collect.js)
- [`emit-module.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/emit-module.js)
- [`generate-expressions.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/generate-expressions.js)
- [`type-helpers.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/type-helpers.js)
- [`parse.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/parse.js)
- [`protocol.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/protocol.js)

Structure note:

- `core.js` is now the stable backend surface
- `core.js` is the only file that assembles the backend mixins onto `WatGen`
- `shared.js` owns backend state, constants, and the `watgen()` facade
- `collect.js` owns top-level collection and protocol analysis
- `emit-module.js` owns module/type/import/function emission scaffolding
- `generate-expressions.js` owns body/expression lowering
- `type-helpers.js` owns inference, Wasm typing, and assignment helpers
- `parse.js` owns AST-to-backend parse helpers
- `protocol.js` owns protocol naming and protocol-type helpers
- helper modules should stay side-effect free and only export install helpers plus their owned logic
- future changes should extend these phase-oriented helpers without changing the `watgen()` surface
