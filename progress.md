# Refactor Progress

## Goal

Reshape UTU around package-oriented boundaries that are easy for humans and AI agents to navigate:

- `packages/compiler`
- `packages/document`
- `packages/language-platform`
- `packages/runtime`
- `packages/workspace`
- `packages/hosts`

with legacy root paths retained only as compatibility shims.

## Current State

The package relocation is effectively complete.

Real implementation ownership now lives in:

- `packages/compiler`
- `packages/document`
- `packages/language-platform`
- `packages/runtime`
- `packages/workspace`
- `packages/hosts/cli`
- `packages/hosts/lsp`
- `packages/hosts/vscode`

Root-level files that used to own behavior now act as wrappers:

- `index.js`
- `expand.js`
- `tree.js`
- `watgen.js`
- `jsgen.js`
- `expand-utils.js`
- `parser.js`
- `loadCompiledRuntime.mjs`
- `loadNodeModuleFromSource.mjs`
- `moduleSourceLoader.mjs`
- `cli.mjs`
- `lsp.mjs`
- `lsp_server/index.js`
- `extension/*`
- `lsp_core/*`

## Completed

### Compiler

- Added the public compiler facade in `packages/compiler/api/`.
- Moved compiler implementation ownership under:
  - `packages/compiler/core`
  - `packages/compiler/frontend`
  - `packages/compiler/backends`
  - `packages/compiler/shared`
- Added `packages/compiler/index.js` as the package entrypoint.
- Rewired scripts and tooling to prefer `packages/compiler/*` over root shims.
- Split reusable WAT backend helpers into:
  - `packages/compiler/backends/wat/parse.js`
  - `packages/compiler/backends/wat/protocol.js`

### Document / Workspace / Language Platform

- Extracted parser and mutable document logic into `packages/document`.
- Extracted shared workspace/session logic into `packages/workspace`.
- Split workspace internals into:
  - `packages/workspace/document-store.js`
  - `packages/workspace/analysis-cache.js`
  - `packages/workspace/dependency-graph.js`
  - `packages/workspace/workspace-symbol-index.js`
  - `packages/workspace/session.js`
- Added explicit syntax/header/body snapshot caching through `UtuAnalysisCache`.
- Added conservative header-level dependency tracking through `UtuDependencyGraph`.
- Moved workspace symbol indexing onto header snapshots inside `packages/workspace`.
- Moved language-service ownership into `packages/language-platform/core`.
- Added provider-oriented language-platform entrypoints under `packages/language-platform/providers/`.
- Split reusable language-platform helpers into:
  - `packages/language-platform/core/symbols.js`
  - `packages/language-platform/core/runnables.js`
  - `packages/language-platform/core/workspaceSymbols.js`
  - `packages/language-platform/core/completion-helpers.js`
  - `packages/language-platform/core/compile-diagnostics.js`
- Rewired compiler API, LSP, extension, and tests to import through package boundaries.

### Runtime

- Moved runtime helpers into `packages/runtime`.
- Split runtime entrypoints by environment:
  - `packages/runtime/index.js`: shared/browser-safe surface
  - `packages/runtime/browser.js`: explicit browser-safe host surface
  - `packages/runtime/node.js`: Node-only additions including `loadNodeModuleFromSource()`
- Split runtime responsibilities into:
  - `packages/runtime/artifact.js`
  - `packages/runtime/loader.js`
  - `packages/runtime/run-main.js`
  - `packages/runtime/run-test.js`
  - `packages/runtime/run-bench.js`
- Rewired CLI and Node-based tests to use `packages/runtime/node.js`.
- Rewired the web extension to use `packages/runtime/browser.js`.

### Hosts

- Moved CLI host implementation to `packages/hosts/cli/main.mjs`.
- Moved LSP host implementation to:
  - `packages/hosts/lsp/main.mjs`
  - `packages/hosts/lsp/server-session.mjs`
  - `packages/hosts/lsp/transport/jsonRpcConnection.mjs`
  - `packages/hosts/lsp/protocol-adapters/index.mjs`
  - `packages/hosts/lsp/server/index.js`
- Moved VS Code extension implementation to `packages/hosts/vscode/`.
- Rewired the VS Code host to a shared workspace/session adapter instead of a separate ad hoc parser/workspace-symbol stack.
- Restored root `cli.mjs`, `lsp.mjs`, `lsp_server/index.js`, and `extension/*` as thin wrappers.

### Build / Packaging

- Updated `scripts/build.mjs` to build directly from:
  - `packages/compiler/index.js`
  - `packages/hosts/cli/main.mjs`
  - `packages/hosts/lsp/main.mjs`
  - `packages/hosts/vscode/extension.web.js`
- Kept root wrappers only for compatibility and direct local invocation.

### Grammar / Spec / Frontend Surface

- Split grammar helpers under:
  - `grammar/tokens.cjs`
  - `grammar/rules/top-level.cjs`
  - `grammar/rules/declarations.cjs`
  - `grammar/rules/types.cjs`
  - `grammar/rules/expressions.cjs`
  - `grammar/rules/literals.cjs`
  - `grammar/rules/identifiers.cjs`
- Kept `grammar.cjs` as the single composed grammar source and added `grammar.js` compatibility for `tree-sitter generate`.
- Added phase-oriented frontend entrypoints under:
  - `packages/compiler/frontend/parse/`
  - `packages/compiler/frontend/diagnostics/`
  - `packages/compiler/frontend/bind/`
  - `packages/compiler/frontend/sema/`

### Documentation

- Added or updated package docs for:
  - `packages/compiler`
  - `packages/compiler/api`
  - `packages/document`
  - `packages/language-platform`
  - `packages/runtime`
  - `packages/workspace`
  - `packages/hosts`
- Updated `refactor.md` with the architecture and rollout rationale.

## Verification History

These checks passed after the current package/host relocation:

- `bun ./scripts/test-diagnostics.mjs`
- `bun ./scripts/test-editor.mjs core`
- `bun ./scripts/test-vscode-activation-selfcheck.mjs`
- `bun ./scripts/test-vscode-activation-language-version-repro.mjs`
- `bun ./scripts/test-vscode-web-extension-activation-log-repro.mjs`
- `bun ./scripts/test-vscode-web-compiler-source-load.mjs`
- `bun ./scripts/test-stress-runtime.mjs`
- `./node_modules/.bin/tree-sitter generate`
- `bun run build`
- `bun ./cli.mjs compile ./examples/hello.utu --outdir /tmp/utu-runtime-split-check --wat`
- `bun ./cli.mjs compile ./examples/hello.utu --outdir /tmp/utu-postbuild-check --wat`
- `bun ./cli.mjs compile ./examples/hello.utu --outdir /tmp/utu-100-check --wat`

## Remaining Intentional Debt

This refactor lands the package boundaries, shared session/cache/dependency layer, host unification, runtime split, grammar helper split, provider/phase entrypoints, and an initial WAT helper split, but it does not fully rewrite the remaining internals of `watgen` or the document-indexing logic in `languageService`.

What is done:

- the repo is organized around stable package boundaries
- hosts now depend on those package boundaries
- LSP and VS Code now share a workspace/session orchestration layer
- syntax/header/body snapshots exist as explicit cache tiers
- header-level dependency invalidation exists as a shared workspace concern
- build/test paths prefer the new structure
- legacy root paths are compatibility shims

What remains for a future semantic rewrite:

- deeper `watgen` decomposition
- deeper document-index decomposition behind the new provider entrypoints
- eventual optional HIR if `watgen` splitting alone stops being enough
