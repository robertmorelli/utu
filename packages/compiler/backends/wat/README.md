# WAT Backend

This directory owns the WAT backend.

Current entrypoints:

- [`index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/index.js)
- [`core.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/core.js)
- [`parse.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/parse.js)
- [`protocol.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/protocol.js)

Migration note:

- `core.js` still contains the main emitter implementation
- `parse.js` owns AST-to-backend parse helpers
- `protocol.js` owns protocol naming and protocol-type helpers
- callers should prefer this directory over the old `backends/watgen.js` path
- future splits should carve out parse/lowering/helpers from `core.js` without changing the `watgen()` surface
