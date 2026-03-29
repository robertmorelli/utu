# Cross-File Symbol Linking

This note describes the long-term direction for cross-file symbol linking in UTU and the first implementation step that now exists in the workspace-aware editor path.

## Goals

The long-term goal is to make UTU workspace navigation understand file imports as real symbol edges, not as editor-specific hacks.

That means:

- `go to definition` should follow `import module |alias| from "./file.utu"` across files
- imported module names, imported types, and imported members should all resolve to the defining file
- the same core resolution model should later support cross-file hover, references, rename guards, and completions
- VS Code should consume the shared language/workspace layer instead of inventing its own file-resolution behavior

## Current State

Today the compiler and runtime understand cross-file imports through expansion:

- file imports are loaded by the host
- expansion inlines imported modules
- import capture/rename happens before the imported module is used
- compile, test, bench, CLI, and editor diagnostics all understand that lowered model

The document index is still fundamentally document-local, though. It can reason about symbols inside a single file, but it does not yet build a full workspace-wide symbol graph for imported UTU namespaces.

That means:

- compile/validation works across files
- diagnostics work across files
- workspace-aware hover now works across imported module/type/member definitions
- workspace-aware references now follow imported module/type/member symbols across files
- document highlights can now light up imported module/type/member uses inside the current file
- plain workspace symbol search works across files
- rename/completion still do not use a workspace-wide foreign-symbol model yet

## First Step

The first step is deliberately narrow:

- add workspace-aware cross-file `go to definition`
- keep the single-document index local
- keep VS Code thin and push the real behavior into the shared workspace/session layer

This first step resolves:

- imported module names to their target `mod ...` declaration
- imported namespace uses like `crate.Box` back to the imported module or type
- associated calls like `crate.Box.score(...)` back to the imported associated function
- open-construct promoted type uses like `Box.new(...)` back to the imported type and member definitions

It does not yet try to solve:

- rename or symbol-wide workspace edits
- foreign-symbol-aware completions
- a fully generalized workspace symbol identity model for every editor feature

## Why This Is Not Lock-In

This design avoids lock-in by keeping the seam at the workspace/language layer.

The key rule is:

> VS Code should ask for definitions, not decide how imported UTU symbols resolve.

That keeps the architecture reusable for:

- VS Code
- the LSP host
- future CLI analysis tools
- future hover/reference support

The shared workspace layer can evolve from:

- local symbol resolution
- plus imported namespace resolution

into:

- local symbol resolution
- imported namespace bindings
- foreign symbol references
- workspace-wide symbol identity

without needing to rewrite the editor adapters.

## Future Path

The next steps after definition-only support should be:

1. Preserve imported namespace bindings as first-class data in document indexes.
2. Build a foreign-symbol reference model instead of overloading local symbol keys.
3. Reuse that model for rename and completions.
4. Replace workspace scans with reverse import traversal for cross-file references.
5. Upgrade the dependency graph from name-based invalidation to file-import-aware invalidation everywhere it matters.

## Implementation Notes

The current first step intentionally favors a small, real feature over a fake “complete” system:

- header snapshots now record UTU file-import declarations
- the workspace dependency graph can use those imports as direct URI edges
- the workspace session performs the first cross-file definition resolution
- the base single-document language service stays document-local for now

That keeps today’s implementation honest while leaving a clean path to a fuller workspace symbol model later.
