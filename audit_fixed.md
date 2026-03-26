# Compiler Audit Fix Report

## Result

The concrete correctness issues from `audit.md` were fixed in code and covered by the manifest-driven test suite.

## Findings Closed

### 1. Local shadowing

Fix:

- duplicate local bindings now fail the backend immediately instead of aliasing one flat Wasm local
- the same failure now surfaces through language service, LSP, and extension diagnostics

Files:

- `watgen.js`
- `scripts/test-modules.mjs`
- `scripts/test-diagnostics.mjs`

Tests:

- `local-shadowing-is-a-hard-compile-error`
- `compiler-backed shadowing errors surface through language service, lsp, and extension diagnostics`

### 2. Captureless `for`

Fix:

- captureless loops now declare their implicit index local during local collection

Files:

- `watgen.js`
- `scripts/test-modules.mjs`

Test:

- `captureless-for-loops-declare-and-use-the-implicit-index-local`

### 3. Multi-source / multi-capture `for`

Fix:

- loops now fail explicitly unless they are the supported single-range, single-capture form

Files:

- `expand.js`
- `watgen.js`
- `scripts/test-modules.mjs`

Tests:

- `for-loops-reject-multiple-range-sources`
- `for-loops-reject-multiple-captures`

### 4. Module-local tests / benches / constructs silently disappearing

Fix:

- unsupported module-body forms are rejected during module template collection
- unused bad modules no longer disappear during expansion

Files:

- `expand.js`
- `scripts/test-modules.mjs`

Tests:

- `module-bodies-reject-test-declarations`
- `module-bodies-reject-bench-declarations`
- `module-bodies-reject-construct-declarations`

### 5. Large `i64` / `u64` literal precision loss

Fix:

- integer literals are parsed through `BigInt`
- safe-width integers still fold to JS numbers, large integers stay exact

Files:

- `watgen.js`
- `scripts/test-modules.mjs`

Test:

- `large-i64-literals-stay-exact-through-codegen`

### 6. Narrow method-sugar receiver inference

Fix:

- the expander now infers more receiver shapes
- top-level types are predeclared before field-type collection, so nested field receivers retain owner/type identity

Files:

- `expand.js`
- `scripts/test-modules.mjs`

Test:

- `getter-method-sugar-works-for-field-and-if-receivers`

### 7. Protocol lowering drift

Fix:

- parent dispatch now reads the parent tag and uses bare-table `call_indirect`
- concrete getters no longer bypass the protocol helper
- protocol docs/hover/spec now state the absolute lowering contract

Files:

- `watgen.js`
- `README.md`
- `documentation/spec.typ`
- `jsondata/hoverDocs.data.json`
- `scripts/test-modules.mjs`

Tests:

- `tagged-sum-parent-protocol-helpers-lower-to-bare-table-dispatch`
- `protocol-getter-sugar-always-goes-through-the-protocol-helper`

## Additional Backend Cleanup

- Binaryen-backed validation failures now carry a compiler-owned prefix: `Generated Wasm failed validation: ...`
- Binaryen parse/validate use is serialized behind a queue so stderr capture cannot interleave across concurrent compiles
- `compile(..., { optimize: false })` and CLI `--no-opt` were added, with a regression showing raw output keeps more functions than the optimized build
- structural type equality replaced `JSON.stringify(...)` equality in `watgen.js`

## Verification

Executed:

- `bun ./scripts/test-modules.mjs`
- `bun ./scripts/test-diagnostics.mjs`
- `bun run test`

All passed.
