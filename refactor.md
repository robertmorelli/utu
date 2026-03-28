# UTU Refactor Plan

## Intent

This plan keeps the core goal from the first draft:

- one shared language core
- thin VS Code, CLI, and LSP hosts
- fewer giant files
- clearer ownership for both humans and AI agents

But it changes the rollout and a few architectural bets to better match UTU's current reality:

- the language is still evolving
- the editor must work on broken code
- LSP latency matters more than architectural purity
- `watgen.js` is too large, but a full HIR may still be premature
- a real monorepo/workspace split would add tooling cost immediately

## Hard Constraints

### 1. The shared frontend must be fault-tolerant

The compiler and editor cannot share a frontend unless that frontend is designed for incomplete and invalid code.

That means:

- parse must return a usable tree plus diagnostics, not throw, for ordinary edit-time mistakes
- expand must tolerate missing nodes and partially formed constructs
- bind and sema must produce partial results with placeholders instead of bailing out
- editor queries must work against partial analysis whenever possible

The shared model should explicitly support partiality:

- unknown symbols
- unknown or error types
- unresolved module references
- incomplete declarations
- recovery diagnostics

Compilation can still be strict. Editing cannot be.

### 2. LSP work must be incremental enough to stay responsive

Do not design a beautiful whole-file pipeline and then run all of it on every keystroke.

UTU does not need a full `salsa`-style query engine on day one, but it does need a cache model that can evolve in that direction.

The minimum viable incrementality should be:

- syntax tree cached per document version
- top-level header facts cached separately from function-body facts
- workspace graph cached at file level
- workspace symbol index derived from header facts, not full compilation
- backend validation kept off the hot on-type path

### 3. Phase-first organization is safer than a full phase/feature matrix

The repo should be organized primarily by layer and phase.

Feature-specific code can still exist, but it should live inside the owning phase, not in a separate global cross-cutting tree that mirrors every phase.

Good:

```text
packages/compiler/frontend/expand/protocols.js
packages/compiler/frontend/sema/protocols.js
packages/compiler/backends/wat/protocols.js
```

Avoid as the default:

```text
packages/compiler/features/protocols/expand.js
packages/compiler/features/protocols/sema.js
packages/compiler/features/protocols/wat.js
```

The second style looks neat on paper but creates a matrix that is harder to navigate and easier to tangle.

### 4. HIR is optional, not mandatory

UTU is currently very close to WasmGC. That means a full HIR may not be worth the complexity yet.

The safer sequence is:

1. split `watgen.js` by concern
2. pull semantic logic out of the backend
3. only add a thin IR later if the split still leaves too much semantic/backend coupling

If an IR is introduced, it should be very thin and close to structured WAT, not a large "future-proof" abstraction.

### 5. Do not pay the monorepo tooling tax immediately

Use package-like directories first, but keep one root `package.json`, one lockfile, and one build pipeline until the new boundaries have proven their value.

That means:

- `packages/` is an architectural layout first
- not npm workspaces on day one
- not multiple publishable packages on day one
- not a large bundler/CI rewrite before the code moves start paying off

Workspaces can come later if the boundaries stabilize and the tooling payoff becomes real.

## Architectural Decisions

### A. Public compiler API before internal rewrite

Before moving major logic, define stable public entrypoints that wrap today's implementation:

- `analyzeDocument()`
- `compileDocument()`
- `getDocumentMetadata()`

The first implementation can forward into current files. The point is to stabilize the shape the rest of the repo will depend on before changing internals.

That fixes the sequencing issue between the compiler and workspace layers: the workspace layer depends on the public API, not on the final refactor already being complete.

### B. Separate editor mode, validation mode, and compile mode

The shared core should support at least three modes:

1. `editor`
   - tolerant parse, expand, bind, sema
   - partial results allowed
   - fast path only
   - no WAT/backend validation on every keystroke

2. `validation`
   - tolerant frontend
   - richer diagnostics
   - can run on save or idle
   - may include backend validation if cheap enough

3. `compile`
   - strict lowering preconditions
   - backend validation
   - hard failure if the program is not compilable

This lets the editor stay responsive without weakening actual compilation guarantees.

Important implementation rule:

- `mode` is an input to one shared pipeline, not a reason to fork the codebase into three separate pipelines
- tolerant parse/expand/bind/sema should be the default path
- `compile` mode should mostly mean "run the tolerant path, then require that blocking errors are absent before lowering/backend work continues"

### C. Multi-tier analysis model

The shared analysis should not be one giant `SemanticModel` blob. It should have tiers.

Recommended tiers:

- `SyntaxSnapshot`
  - tree-sitter tree
  - parse diagnostics

- `HeaderSnapshot`
  - imports, exports, top-level names
  - top-level function signatures
  - struct, type, proto, and module declarations
  - test and bench metadata
  - runnable `main` detection
  - workspace symbol contributions

- `BodySnapshot`
  - function-local bindings
  - occurrences
  - hover/definition/reference/completion facts
  - semantic diagnostics for bodies

- `CompileSnapshot`
  - compile-ready semantic facts
  - lowering inputs
  - backend diagnostics and artifacts

Boundary rule:

- header facts are everything derivable from declarations without entering function, test, or bench bodies

That means:

- imports, exports, explicit signatures, type declarations, protocol declarations, module declarations, and declared test/bench names belong in `HeaderSnapshot`
- body-local bindings, inferred expression types, occurrences, and control-flow-sensitive facts belong in `BodySnapshot`
- top-level bindings or exported functions whose types can only be known by analyzing bodies are a cache-boundary hazard

Recommended language rule:

- require explicit return types for exported or module-level functions
- require explicit types for any top-level binding that contributes to public API or cross-file analysis

If UTU keeps implicit public return-type inference, edits to those bodies must be treated as header invalidations.

This gives a clear latency strategy:

- workspace symbols and test discovery use `HeaderSnapshot`
- most editor features use `HeaderSnapshot` plus local `BodySnapshot`
- compile and full validation use `CompileSnapshot`

### D. Shared workspace session, but after the API exists

Both the VS Code extension and stdio LSP should use one shared workspace/session layer, but only after the compiler API exists.

Core responsibilities:

- open document tracking
- file loading
- document-version caches
- workspace dependency graph
- invalidation
- workspace symbol index

The shared workspace layer should not invent language semantics. It should schedule and cache the compiler API.

### E. Conservative language-spec consolidation

The JSON/data sprawl is real, but do not jump straight to a code-generation pipeline.

Start with:

- co-locating language-spec data
- exposing it through a single module
- deleting duplicated copies where possible

Only generate derived files if manual co-location still proves painful.

## Proposed Layout

Use package-like directories, still built from one root package initially.

```text
packages/
  document/
    text-document.js
    mutable-document.js
    positions.js
    spans.js
    tree-sitter.js
    index.js

  compiler/
    api/
      analyze.js
      compile.js
      metadata.js
      index.js
    frontend/
      parse/
      expand/
      bind/
      sema/
      diagnostics/
    metadata/
    backends/
      wat/
      js/
    shared/

  workspace/
    document-store.js
    dependency-graph.js
    analysis-cache.js
    workspace-symbol-index.js
    session.js
    index.js

  language-platform/
    providers/
      diagnostics.js
      hover.js
      definition.js
      references.js
      completion.js
      semantic-tokens.js
      document-symbols.js
      workspace-symbols.js
    index.js

  runtime/
    artifact.js
    loader.js
    run-main.js
    run-test.js
    run-bench.js
    index.js

  language-spec/
    builtins.js
    keywords.js
    symbol-metadata.js
    docs.js
    runtime-defaults.js
    index.js

  hosts/
    vscode/
      activate.js
      commands.js
      diagnostics.js
      testing.js
      adapters/
    lsp/
      transport/
      protocol-adapters/
      server-session.js
      main.mjs
    cli/
      commands/
      main.mjs
```

For grammar:

```text
grammar/
  tokens.js
  rules/
    core.js
    modules.js
    protocols.js
    testing.js
  grammar.cjs
```

Tree-sitter generated output can stay where tree-sitter expects it.

Important grammar note:

- this is helper decomposition, not multiple independent grammar entrypoints
- `grammar.cjs` should remain the single `grammar()` export consumed by tree-sitter
- helper files should only factor rules and utilities into importable pieces
- validate the split continuously with `tree-sitter generate` so the layout stays compatible with tree-sitter's expectations

## What This Means For Current Hotspots

### `parser.js`

Split into:

- tree-sitter bootstrap
- immutable text document helpers
- mutable workspace document helpers
- span and range utilities

This should become the bottom-most utility layer for every host.

### `lsp_core/languageService.js`

This file should shrink dramatically.

It should stop owning:

- symbol graph construction
- occurrence indexing
- semantic diagnostics
- type-ish inference logic
- compile-backed validation policy

It should become provider glue over compiler analysis snapshots.

### `expand.js`

This becomes part of the tolerant shared frontend. It must stop assuming it only runs on compile-ready code.

Design rule:

- missing or malformed constructs become recovery diagnostics and partial outputs
- editor mode should keep going whenever possible

### `watgen.js`

This should be split, but not by introducing a large HIR immediately.

First split it into backend concerns while keeping the current input shape alive:

- module/type emission
- imports/exports/globals
- protocol dispatch
- control flow
- expressions
- constants/default values
- backend diagnostics/helpers

At the same time, move semantic decisions out of the emitter into shared analysis services.

## Incrementality Strategy

This needs to be explicit.

### Short term

Implement file-level incrementality with header/body separation:

- if a function body changes, reuse file header facts
- if only whitespace changes, avoid unnecessary downstream work
- workspace symbols should not require full body analysis
- on-type diagnostics should not trigger backend validation

### Medium term

Add dependency-aware invalidation:

- file A changes its exports: invalidate dependent files' header facts
- file A changes only function bodies: usually do not invalidate dependents' headers
- local body queries re-run only for the touched file

### Long term

If UTU grows enough, push further toward finer-grained body/function analysis. But do not block the refactor on a full query system.

The important part now is that the API and cache boundaries do not make finer-grained invalidation impossible later.

## Editor Error-Recovery Rules

These rules should be treated as architecture requirements, not future polish.

1. Tree-sitter parse errors are expected during editing.
2. Parse errors should still produce a tree and range-aware diagnostics.
3. Expand should skip, stub, or partially lower malformed nodes rather than throwing.
4. Bind should create placeholder symbols when that preserves surrounding analysis.
5. Sema should return partial types and mark them as unknown/error instead of cascading hard failure.
6. Hover, completion, definition, and symbols should degrade gracefully on partial data.

The editor pipeline should be able to answer useful questions for files that would never pass `compile`.

## AI-Agent-Oriented Repository Rules

These rules stay important, but they should be practical.

1. Treat 600-800 lines as the default "this file should probably split" threshold for hand-written code.
2. Use CI warnings or soft checks first; only make them hard failures after the split lands.
3. Every major package and phase folder gets a short `README.md`:
   - what lives here
   - what imports are allowed
   - which public APIs are stable
   - where to start for common edits
4. Root-level files become entry shims or build files only.
5. Import direction is one-way:
   - `document` and `language-spec` at the bottom
   - `compiler` above them
   - `workspace` above compiler
   - `language-platform` above workspace/compiler
   - `hosts` at the top
6. Prefer one obvious home per concern over many "shared" utility files.

## Revised Migration Plan

### Phase 0: Guardrails and Baseline

- add architecture notes and folder READMEs
- add golden tests for parse diagnostics, metadata, hover, symbols, and WAT output
- add latency smoke tests for common editor operations
- measure current hot-path behavior before refactoring

Exit criteria:

- current behavior is documented well enough to refactor safely
- latency regressions can be noticed, not guessed

### Phase 1: Public API and Mechanical Reshape

- create `packages/compiler/api/{analyze,compile,metadata}.js`
- make them thin wrappers over current code
- move hand-written code under `packages/` directories
- keep one root package and current build tooling
- leave root entrypoints as compatibility shims
- timebox this phase and land it fully before starting Phase 2
- avoid mixing new language-design work into a half-migrated Phase 1 branch

Exit criteria:

- callers depend on stable compiler APIs
- imports are organized by domain instead of root sprawl
- no workspace/tooling explosion yet
- all shims work, and the repo is not left in a partially migrated state

### Phase 2: Shared Document Layer and Error-Tolerant Contracts

- extract the shared document model from parser/server code
- define tolerant analysis result shapes for editor mode
- stop normal edit-time parse/expand/bind/sema failures from throwing through host code
- make diagnostic modes explicit: editor, validation, compile

Exit criteria:

- the editor can use shared analysis contracts safely on broken code
- host code no longer needs ad hoc recovery logic for ordinary editing states

### Phase 3: Workspace Session and File-Level Incrementality

- build `DocumentStore`, `AnalysisCache`, and `WorkspaceSession`
- cache syntax, header, and body snapshots by file/version
- move workspace symbol indexing onto header facts
- keep backend validation off the hot on-type path

Exit criteria:

- extension and LSP stop maintaining separate workspace synchronization logic
- common editor actions do not require full compile-style analysis

### Phase 4: Shared Semantic Consolidation

- move symbol table construction, occurrence indexing, and semantic diagnostics into shared compiler analysis
- make language-platform providers consume those snapshots
- progressively remove duplicate semantic logic from `lsp_core/languageService.js`
- move semantic decision points out of `watgen.js` where possible

Exit criteria:

- compiler and language-platform rely on the same semantic facts
- language service becomes provider glue instead of a second compiler frontend

### Phase 5: Split `watgen.js` Without Forcing HIR

- extract backend context and helper interfaces
- split emission by concern
- keep existing input shape alive during the split
- move compile-only checks to clearer backend validation seams

Exit criteria:

- `watgen.js` is no longer one giant mixed-responsibility file
- backend work is locally understandable

### Phase 6: Optional Thin IR

Only do this if Phase 5 still leaves too much coupling.

Good triggers for introducing a thin IR:

- semantic facts are still too entangled with emitter control flow
- a second backend starts wanting a different lowering shape
- protocol/control-flow lowering remains hard to test without text emission

If introduced:

- keep it small
- keep it close to structured WAT
- migrate feature-by-feature
- do not rewrite the entire compiler around it in one shot

Exit criteria:

- the IR earns its keep by removing real complexity, not by looking academically clean

### Phase 7: Conservative Spec Consolidation and Host Cleanup

- co-locate builtins, docs, symbol metadata, and runtime defaults under `language-spec/`
- delete duplicated copies before adding generation
- simplify hosts so they only translate APIs and render results

Exit criteria:

- hosts are boring
- language data has one obvious home
- generation only exists where it clearly reduces repeated manual work

## High-Value Deduplication Targets

| Current area | Target home | Why |
| --- | --- | --- |
| `UtuSourceDocument` plus `UtuServerTextDocument` | `packages/document/` | one document model for all hosts |
| workspace symbol sync in extension and LSP server | `packages/workspace/` | one invalidation and indexing path |
| symbol/occurrence/type facts currently rebuilt in language service and backend | `packages/compiler/api/analyze.js` and shared frontend | one semantic source of truth |
| compile-backed diagnostics policy split between language service and extension diagnostics | `packages/language-platform/providers/diagnostics.js` | one diagnostic policy with explicit modes |
| runtime/test/bench wrappers in CLI and extension | `packages/runtime/` | one execution model |

## What Not To Overbuild Yet

- no mandatory HIR until the backend split proves it is needed
- no full query engine before file-level caches and header/body separation land
- no npm workspace conversion until the directory boundaries are stable
- no heavy codegen pipeline for `language-spec` until co-location alone stops being enough
- no rigid architecture freeze around still-evolving language features

## Practical Success Criteria

The refactor is working if:

- the editor stays useful on incomplete code
- on-type latency stays low because fast paths avoid full compile work
- adding a language feature has one obvious phase-oriented edit path
- most host changes are wiring-only
- `watgen.js` and `lsp_core/languageService.js` stop being "load the whole world" files
- the repo becomes easier to navigate without becoming a second project full of tooling overhead

## End State

The end state is still a shared language core with thin hosts, but reached more conservatively:

- first stabilize APIs
- then make shared analysis fault-tolerant
- then add workspace caching and invalidation
- then consolidate semantics
- then split the backend
- then add a thin IR only if it proves necessary

That path gives UTU a better chance of simplifying the architecture without stalling language design or regressing the editor.
