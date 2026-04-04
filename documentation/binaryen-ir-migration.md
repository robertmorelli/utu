# Binaryen IR Migration

## Current State

Today the compiler is not "tree -> wasm ir -> Binaryen". It is:

1. tree-sitter parse
2. module/source expansion
3. reparse expanded source
4. compile plan selection
5. WAT string generation
6. Binaryen parses that WAT text
7. Binaryen validates/optimizes/emits wasm

The key call path is:

- [`packages/compiler/core/index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/core/index.js#L24) calls `wasmgen(...)` from [`packages/compiler/backends/wat/index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/index.js).
- [`packages/compiler/backends/wat/core.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/core.js#L39) still initializes the WAT backend and then forwards to `compileBinaryen(...)`.
- [`packages/compiler/backends/binaryen/core.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/binaryen/core.js#L29) calls `watgen(...)`, then `binaryen.parseText(wat)`, then `emitBinary()`.

That means the current "Binaryen backend" is only a WAT consumer.

## Important Finding

The installed `binaryen` package is capable of building GC/reference-types modules directly from JS.

The public typings understate the available surface, but the runtime wrapper exposes:

- `new binaryen.TypeBuilder(size)`
- `typeBuilder.setStructType(...)`
- `typeBuilder.setArrayType(...)`
- `typeBuilder.setSignatureType(...)`
- `typeBuilder.setSubType(...)`
- `typeBuilder.createRecGroup(...)`
- `typeBuilder.buildAndDispose()`
- `module.setTypeName(...)`
- `module.setFieldName(...)`
- `module.struct.new/get/set`
- `module.array.new/new_default/new_fixed/get/set/len/copy/fill`
- `module.ref.null/test/cast/as_non_null`
- `module.br_on_null`, `module.br_on_non_null`, `module.br_on_cast`, `module.br_on_cast_fail`
- `module.addTable(name, initial, max, type)`
- `module.addActiveElementSegment(...)`

I validated this locally with a direct Binaryen `TypeBuilder` + `struct.new`/`struct.get` module that emitted working wasm and ran under `WebAssembly.instantiate`.

## Real Blocker

We do not currently have a standalone typed tree / wasm IR stage.

A large amount of typing and lowering logic lives inside the WAT backend itself:

- lazy inference and expression typing in [`packages/compiler/backends/wat/type-helpers.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/type-helpers.js#L177)
- backend-time expression lowering in [`packages/compiler/backends/wat/generate-expressions.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/generate-expressions.js#L75)
- module/type emission in [`packages/compiler/backends/wat/emit-module.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/emit-module.js#L47)

So "remove the WAT backend" is not just swapping emitters. We need to extract backend-owned semantics into an explicit intermediate representation.

## Recommended Pipeline

The durable pipeline should become:

1. tree-sitter tree
2. expanded tree
3. typed semantic tree
4. wasm IR tree
5. Binaryen module builder
6. wasm bytes

Debug WAT should become a derived view:

1. tree-sitter tree
2. expanded tree
3. typed semantic tree
4. wasm IR tree
5. Binaryen module builder
6. `emitText()` when requested

That keeps wasm as the primary artifact and WAT as an optional debug print.

## Concrete Refactor Plan

### Phase 1: Stop treating WAT as the backend boundary

Create a new backend surface, for example:

- `packages/compiler/backends/wasm-ir/`
- `packages/compiler/backends/binaryen/module-builder.js`

Move compiler entrypoints to target the new surface, not `backends/wat`.

This means:

- [`packages/compiler/core/index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/core/index.js#L2) should stop importing `wasmgen` from `backends/wat`.
- `validateWat` should live as a Binaryen debug utility only, not as the backend contract.

### Phase 2: Extract a typed semantic layer

Backend-local typing must move out of the WAT generator and into an explicit compile stage.

Start by extracting data that is already computed or derivable today:

- resolved callable signatures
- resolved field access targets
- resolved protocol dispatch helpers
- resolved array element types
- numeric coercions
- function/export/test/bench metadata

The output should be a typed tree or typed instruction graph with no stringly-typed wasm names.

### Phase 3: Define a wasm IR tree

Do not lower directly from syntax nodes into Binaryen calls.

Introduce an internal wasm IR with explicit nodes for:

- module
- rec type groups
- struct/array/signature types
- globals/imports/exports
- tables/element segments
- functions/locals
- structured control flow
- GC/reference instructions
- numeric ops and coercions

This should preserve the compiler's structured intent and keep Binaryen-specific concerns at the final lowering edge.

### Phase 4: Lower wasm IR to Binaryen

Implement a single Binaryen lowering pass that:

- allocates heap types with `TypeBuilder`
- names types/fields with `setTypeName` and `setFieldName`
- builds tables/segments directly
- maps wasm IR expressions to Binaryen expressions
- validates and optionally optimizes
- emits wasm bytes
- emits text only when debug WAT is requested

This becomes the only codegen backend.

### Phase 5: Delete WAT-specific generation

Once the wasm IR -> Binaryen path is complete:

- delete `watgen(...)`
- delete the WAT string emitters in `backends/wat/`
- delete tests that assert exact WAT snippets as the primary correctness check
- replace them with:
  - runtime wasm tests
  - Binaryen module shape inspections
  - optional snapshot/debug-text tests only where useful

## Suggested Work Breakdown

### Slice A: Backend-independent semantic extraction

Target files:

- [`packages/compiler/backends/wat/type-helpers.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/type-helpers.js)
- [`packages/compiler/backends/wat/collect.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/collect.js)
- [`packages/compiler/backends/wat/protocol.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/protocol.js)

Goal:

- move type/protocol/shape resolution into reusable compiler passes

### Slice B: Type and module IR

Target concepts currently in:

- [`packages/compiler/backends/wat/emit-module.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/emit-module.js#L111)

Goal:

- replace WAT type/module string assembly with IR objects

### Slice C: Expression IR

Target concepts currently in:

- [`packages/compiler/backends/wat/generate-expressions.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/generate-expressions.js#L113)
- [`packages/compiler/backends/wat/shared.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/wat/shared.js)

Goal:

- replace `out.push("...")` instruction emission with structured IR nodes

### Slice D: Binaryen lowering

Target file to replace:

- [`packages/compiler/backends/binaryen/core.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/backends/binaryen/core.js)

Goal:

- stop calling `binaryen.parseText(...)`
- lower wasm IR directly into a Binaryen `Module`

## User-Facing Surfaces To Update

WAT is currently exposed in several places and will need to become "debug output from Binaryen", not "a backend product":

- CLI help and flags in [`jsondata/cli.data.json`](/Users/robertmorelli/Documents/personal-repos/utu/jsondata/cli.data.json)
- VS Code generated WAT command in [`packages/hosts/vscode/commands.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/hosts/vscode/commands.js#L25)
- compiler API result shape in [`packages/compiler/api/compile.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/api/compile.js#L27)

Those can stay if desired, but they should be treated as optional `emitText()` output from the Binaryen-built module.

## Tests To Rewrite

The current suite contains many tests that assert on WAT substrings:

- [`scripts/test-modules.mjs`](/Users/robertmorelli/Documents/personal-repos/utu/scripts/test-modules.mjs#L44)
- [`scripts/test-docs-codegen.mjs`](/Users/robertmorelli/Documents/personal-repos/utu/scripts/test-docs-codegen.mjs#L141)

Recommended replacement strategy:

- keep runtime behavior tests as-is
- inspect Binaryen module structure from emitted wasm using `binaryen.readBinary(...)`
- reserve WAT/text assertions for a small debug-output layer only

## Shortest Safe Path

If the goal is to get off the WAT backend without taking a huge rewrite risk, the shortest safe path is:

1. extract typed semantic resolution out of `backends/wat`
2. introduce an explicit wasm IR tree
3. lower that IR directly to Binaryen
4. keep WAT only as `module.emitText()` for debugging
5. delete the old string emitter after parity

Trying to jump straight from the current WAT emitter to ad hoc Binaryen calls will work for small cases, but it will be hard to preserve protocols, tagged sums, array typing, multi-value returns, and backend-local type inference without first creating the typed/wasm-IR layers.
