# Compiler Cut Corners Fix Report

## Result

The concrete cut-corner behaviors called out in `cut_corners.md` were either removed or turned into explicit, test-covered compiler behavior.

## Behavioral Fixes

### 1. Value-position `if` without `else`

Fixed in `watgen.js`.

- result-producing `if` now throws `Value-position if expressions must include an else branch`
- test: `value-position-if-without-else-is-rejected`

### 2. Multi-source `for`

Fixed in `expand.js` and `watgen.js`.

- unsupported multi-source lowering is now rejected instead of partially lowered
- test: `for-loops-reject-multiple-range-sources`

### 3. `promote` without `else`

Fixed in `watgen.js`.

- result-producing `promote` now throws instead of inventing a default branch
- test: `value-position-promote-without-else-is-rejected`

### 4. Partial struct initialization

Fixed in `watgen.js`.

- missing fields now fail
- duplicate fields now fail
- unknown fields now fail
- tests:
  - `struct-init-rejects-missing-fields`
  - `struct-init-rejects-duplicate-fields`
  - diagnostics fixture for unknown field init

### 5. Method-call sugar whitelist

Fixed in `expand.js`.

- receiver inference now covers more expression forms
- top-level type predeclaration prevents field receivers from losing owner info
- test: `getter-method-sugar-works-for-field-and-if-receivers`

### 6. Module-local `test` / `bench` / `construct` source loss

Fixed in `expand.js`.

- unsupported module-body forms now fail during template collection, even if the module is never instantiated
- tests:
  - `module-bodies-reject-test-declarations`
  - `module-bodies-reject-bench-declarations`
  - `module-bodies-reject-construct-declarations`

### 7. First-class function refs failing late

Fixed in `expand.js` and `watgen.js`.

- function reference types now fail early and explicitly
- test: `first-class-function-reference-types-fail-early`

## Backend / Tooling Cleanup

### 8. Semantic drift between phases

Addressed in `expand.js` and `watgen.js`.

- top-level type names are known before field/protocol analysis
- receiver/protocol inference coverage was expanded
- unsupported surfaces now fail early instead of drifting into backend miscompiles

### 9. Module lowering dropping source during rewrite

Addressed in `expand.js`.

- the dangerous silent-drop path was removed for unsupported module-local forms

### 10. Optimizer dependency

Addressed in `index.js`, `cli.mjs`, and tests.

- raw backend output can now be emitted with `optimize: false` / `--no-opt`
- test: `no-opt-compiles-preserve-unoptimized-module-duplication`

### 11. Binaryen wording as the user-facing contract

Addressed in `index.js` and tests.

- compile-time generated-Wasm failures now use a compiler-owned prefix while still including backend detail

### 12. Global Binaryen stderr capture

Fixed in `index.js`.

- parse/validate/compile now run under a queue lock so capture state cannot overlap

### 13. No debug / no-opt mode

Fixed in `index.js`, `cli.mjs`, `jsondata/cli.data.json`.

- programmatic `optimize: false`
- CLI `--no-opt`

### 14. Sum-type recursive-group handling

Resolved in `watgen.js`.

- sum types stay in recursive groups intentionally so variant RTT/casts keep nominal identity
- explicit regression coverage now protects the variant-dispatch behavior that broke when this was loosened

### 15. Type equality via `JSON.stringify`

Fixed in `watgen.js`.

- `typesEqual(...)` is now a structural recursive comparison

## Example Corpus Cleanup

Examples were updated to match the stricter compiler:

- `examples/ci/codegen_promote.utu` now uses an explicit `else`
- `examples/float.utu`, `examples/deltablue.utu`, and `examples/deltablue2.utu` were renamed to avoid accidental duplicate local bindings under the stricter lexical rules

This removed the old “allowed failure” benchmark warnings as well.

## Verification

Executed:

- `bun ./scripts/test-modules.mjs`
- `bun ./scripts/test-diagnostics.mjs`
- `bun run test`

All passed, and `bun run test` completed with every manifest entry green.
