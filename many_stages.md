# Many Stages

This is the stage model I would use for the compiler if we want:

- a small number of big architectural stages
- a larger number of precise implementation stages
- Binaryen to be the only backend
- Binaryen IR/module objects to be the only backend-owned IR
- wasm to be the primary output
- WAT to exist only as optional debug output emitted after Binaryen

## The Main Idea

Use 5 top-level stages:

1. `Input`
2. `Expansion`
3. `Semantics`
4. `Codegen`
5. `Output`

Inside those, use analysis passes (`aX.X`) and edit passes (`eX.X`) with explicit input/output contracts.

That gives us both:

- a high-level structure that is easy to reason about
- a fine-grained pipeline that is easy to implement and refactor

## The Analysis / Edit Rule

Every sub-stage should be one of two kinds:

- `aX.X` = analysis pass
- `eX.X` = edit pass

The rule is:

- analysis passes inspect trees/graphs and produce facts, indexes, bindings, or plans
- edit passes rewrite one representation into another representation

That means we stop pretending all stages are the same kind of work.

Examples:

- import discovery is analysis
- namespace construction is analysis
- module expansion is an edit
- syntax normalization is an edit
- type checking is analysis
- lowering to wasm IR is an edit

This also makes it easier to keep "figuring things out" separate from "rewriting the program".

## The Backend Rule

WAT should not be an intermediate representation.

The backend contract should be:

- compiler-owned trees and analysis artifacts up through semantics
- compiler-owned wasm IR after lowering
- Binaryen module objects after backend build
- `.wasm` and optional debug WAT only at final emission time

So the intended chain is:

- source trees
- expanded canonical trees
- typed trees
- wasm IR trees
- Binaryen module
- emitted `.wasm`
- optional emitted debug WAT from Binaryen

Not:

- source tree
- generated WAT text
- Binaryen parses WAT text
- emitted `.wasm`

That means:

- WAT is a view, not an IR
- Binaryen is the only backend
- `emitText()` happens after Binaryen build and validation/optimization, not before
- no stage should depend on reparsing generated WAT

## The 5-Stage Model With `a` / `e` Passes

### `1. Input`

#### `a1.1 Load`

Input:

- entrypoint path
- import context
- compiler options that affect source discovery

Output:

- source file set
- source IDs
- source text blobs

Responsibility:

- locate source files
- read source text
- prepare source identity and origin tracking

This stage should know about files and paths, but nothing about syntax or semantics.

#### `e1.2 Parse`

Input:

- source text

Output:

- raw tree-sitter trees

Responsibility:

- run tree-sitter
- produce raw syntax trees
- preserve source spans exactly

This stage should not attempt to clean up parser artifacts beyond parse success/failure handling.

#### `e1.3 Syntax Normalize`

Input:

- raw parse trees

Output:

- normalized syntax trees

Responsibility:

- hide parser-only noise
- canonicalize trivial syntax shape differences
- prepare a stable syntax representation for later stages

This is still syntax-only. No name resolution, no types, no codegen concerns.

---

### `2. Expansion`

#### `a2.1 Discover Declarations`

Input:

- normalized syntax trees

Output:

- file/module declaration inventory

Responsibility:

- identify module declarations
- identify file import declarations
- identify construct/open/alias declarations
- record declared module names and local expansion-relevant features

This stage answers the narrowest structural question: what expansion-related declarations exist in the source?

#### `a2.2 Build Module Graph`

Input:

- file/module declaration inventory

Output:

- symbolic module/import graph

Responsibility:

- connect modules to referenced modules
- connect files to imported files
- compute dependency order constraints

This stage answers: how are the declared pieces connected, before any lookup succeeds or fails?

#### `a2.3 Resolve Imports`

Input:

- symbolic module/import graph
- load context

Output:

- resolved dependency graph

Responsibility:

- turn symbolic imports into concrete targets
- validate import reachability
- attach imported source identities

This stage is still pre-expansion. It does not yet instantiate modules or rewrite trees.

#### `a2.4 Construct Namespaces`

Input:

- resolved dependency graph
- normalized syntax trees

Output:

- module templates and namespace instances

Responsibility:

- build module templates
- instantiate parameterized modules
- assign namespace-local name mangling/materialization identities
- establish what each namespace exports

This is the first true materialization stage, but it should still operate on declaration structure rather than emitted syntax.

#### `e2.5 Expand Declarations`

Input:

- module templates and namespace instances
- normalized syntax trees

Output:

- canonical declaration trees

Responsibility:

- inline or materialize module-level declarations
- rewrite module-owned declarations into their canonical top-level form
- eliminate module/construct syntax from declaration positions

This stage should only rewrite declaration structure. It should not decide expression-level dispatch.

#### `e2.6 Expand Expression Sugar`

Input:

- canonical declaration trees

Output:

- post-module canonical trees

Responsibility:

- remove expansion-owned expression sugar that is purely syntactic
- rewrite namespace-qualified calls/paths into canonical expression forms
- normalize pipe/module-call surface forms that do not require semantic guessing

This stage must stay syntax-directed. If a rewrite requires real binding or type knowledge, it belongs in stage 3, not here.

#### `e2.7 Post-Expand Normalize`

Input:

- post-module canonical trees

Output:

- expanded canonical syntax trees

Responsibility:

- enforce one stable post-expansion tree shape
- remove expansion-only helper forms
- guarantee that later stages no longer need to care how source originally spelled module features

I would keep this final cleanup stage explicit, so stage 3 gets one canonical expanded tree contract.

---

### `3. Semantics`

#### `a3.1 Index`

Input:

- expanded canonical syntax trees

Output:

- declaration index

Responsibility:

- collect top-level declarations
- collect functions, globals, structs, types, protocols, tests, benches, exports
- build a lookup table for later semantic work

This stage should not yet resolve all use-sites. It builds the world map first.

#### `a3.2 Bind`

Input:

- expanded trees
- declaration index

Output:

- bound trees

Responsibility:

- resolve identifiers
- resolve member references
- resolve declarations to definitions
- attach symbol references to syntax nodes

This stage answers: what does each name refer to?

#### `a3.3 Check`

Input:

- bound trees

Output:

- typed trees

Responsibility:

- infer and check types
- resolve coercions
- resolve field targets
- resolve callable signatures
- resolve protocol dispatch targets
- validate semantic correctness

This is the true semantic stage.

The most important architectural point here is that backend-owned type inference should not survive past this stage. Once `a3.3` completes, later stages should not need to guess types.

---

### `4. Codegen`

#### `e4.1 Lower`

Input:

- typed trees

Output:

- wasm IR trees

Responsibility:

- lower language constructs into compiler-owned wasm-level IR
- make control flow explicit
- make locals/globals/tables/types explicit
- represent GC/reference operations explicitly

This stage is where the language stops and wasm begins.

It is important that this is *our own* IR, not WAT text and not Binaryen objects.

That keeps the compiler stable even if we later change Binaryen usage details.

#### `e4.2 Build Binaryen`

Input:

- wasm IR trees

Output:

- Binaryen modules

Responsibility:

- allocate heap types with `TypeBuilder`
- create rec groups
- assign type names and field names
- build functions, globals, tables, element segments
- build Binaryen expressions

This is the only backend.

The contract should be:

- everything before `4.2` is compiler-owned representation
- everything after `4.2` is Binaryen/module-level representation

---

### `5. Output`

#### `a5.1 Validate Optimize`

Input:

- Binaryen modules

Output:

- finalized Binaryen modules

Responsibility:

- validate generated modules
- run optimization passes when enabled
- collect backend diagnostics

This stage should be module-to-module transformation, not a place where new language lowering happens.

Validation should happen on Binaryen modules directly.

Optimization should happen on Binaryen modules directly.

If debug WAT is requested, it should be emitted from the finalized Binaryen module after this stage.

#### `e5.2 Emit`

Input:

- finalized Binaryen modules

Output:

- `.wasm`
- optional debug WAT via Binaryen `emitText()`
- JS shim
- metadata
- diagnostics payloads

Responsibility:

- emit final artifacts
- package outputs for CLI/editor/runtime callers

This stage is the artifact boundary.

WAT exists here only as a debug artifact derived from Binaryen, not as an input to any later stage.

## Why I Like This Structure

### It keeps the big picture simple

When talking about the compiler at a high level, we can say:

1. input
2. expansion
3. semantics
4. codegen
5. output

That is easy to understand and easy to teach.

### It keeps implementation boundaries sharp

When writing code, we still get the precision of:

- `a3.2` bind
- `a3.3` check
- `e4.1` lower
- `e4.2` build

That prevents giant mixed-purpose files.

### It gives us the right backend boundary

The key boundary should be:

- `typed tree -> wasm IR -> Binaryen module -> wasm`

Not:

- `typed-ish backend logic -> WAT strings -> Binaryen parses text -> wasm`

### It makes WAT secondary

With this model:

- wasm is the product
- Binaryen is the backend
- WAT is only a debug view emitted from Binaryen at the end

That matches the direction we want.

## What This Means For The Current Compiler

Right now the compiler is not organized this way.

A lot of semantic and lowering work is still happening inside the WAT backend. In particular:

- backend-local inference
- backend-local field/call resolution
- backend-local protocol lowering
- backend-local wasm type decisions

That means the current architecture is closer to:

1. parse
2. expand
3. partially analyze
4. generate WAT strings while still inferring things
5. ask Binaryen to parse that WAT
6. optimize Binaryen
7. emit wasm
8. optionally emit WAT again from Binaryen

So the refactor goal is not just "replace WAT with Binaryen".

The real goal is:

1. move semantic ownership into stage 3
2. move rewrite ownership into explicit `e` passes
3. move wasm-shape ownership into `e4.1`
4. make Binaryen purely the `e4.2` builder
5. make validation/optimization purely `a5.1`
6. make WAT purely a `e5.2` debug output

## What This Means For The Current Repo

To fully adopt this model, the repo likely needs these structural changes:

- compile orchestration should become a pass runner over explicit artifacts, not a parse/expand/reparse special case
- expansion should stop emitting source text as its primary artifact and instead return rewritten trees
- cross-file imports should become explicit analysis plus explicit tree-materialization edit passes
- semantic ownership should move out of expansion and out of the WAT backend
- lowering should produce compiler-owned wasm IR before any Binaryen objects exist
- Binaryen build should consume wasm IR directly instead of parsing WAT text
- WAT generation should move to final emission and be derived from Binaryen only
- editor/LSP tooling should consume shared analysis artifacts where possible instead of reimplementing a parallel mini-compiler over raw parse trees

The biggest architectural warning is duplication:

- if compile uses explicit `a`/`e` pass artifacts
- but editor/LSP still reason directly over the raw tree with separate logic

then the compiler and tooling will drift.

So this stage model is strongest if the language service and compiler can share at least:

- expansion analysis artifacts
- canonical expanded trees
- semantic indexes/bindings/type facts

## Directory Shape I Would Use

If we want the filesystem to mirror the model closely, I would use something like:

- `stages/1-input/a1.1-load`
- `stages/1-input/e1.2-parse`
- `stages/1-input/e1.3-syntax-normalize`
- `stages/2-expansion/a2.1-discover-declarations`
- `stages/2-expansion/a2.2-build-module-graph`
- `stages/2-expansion/a2.3-resolve-imports`
- `stages/2-expansion/a2.4-construct-namespaces`
- `stages/2-expansion/e2.5-expand-declarations`
- `stages/2-expansion/e2.6-expand-expression-sugar`
- `stages/2-expansion/e2.7-post-expand-normalize`
- `stages/3-semantics/a3.1-index`
- `stages/3-semantics/a3.2-bind`
- `stages/3-semantics/a3.3-check`
- `stages/4-codegen/e4.1-lower`
- `stages/4-codegen/e4.2-build-binaryen`
- `stages/5-output/a5.1-validate-optimize`
- `stages/5-output/e5.2-emit`

If that feels too verbose for the current repo, I would still keep the conceptual model exactly the same and shorten the physical layout a bit.

## The Most Important Rule

Each stage should have:

- one primary input artifact type
- one primary output artifact type
- one clear responsibility

If a stage starts both resolving names and emitting Binaryen expressions, it is doing too much.

If a stage starts both expanding modules and inferring types, it is doing too much.

If a stage starts both lowering language constructs and formatting text WAT, it is doing too much.

The whole point of the 5/13 split is to prevent that kind of blending.

## Short Version

If I had to summarize the whole design in one line, it would be:

`Input -> Expansion -> Semantics -> Codegen -> Output`

with:

`Load/Parse/Normalize -> Discover/Resolve/Materialize -> Index/Bind/Check -> Lower/Build -> Validate+Optimize/Emit`

And the core backend contract would be:

`typed tree -> wasm IR -> Binaryen module -> wasm`
