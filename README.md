# UTU

UTU is a web-first, zero-dep compiler distribution for making tiny, high-performance Wasm bundles for modern ES runtimes like Node, Bun, and browsers aligned with the 2026 web platform.

This repo builds the full UTU toolchain from the repo root: the VS Code extension, the bundled CLI, and the standalone LSP binary.

## What is set up

- `.utu` language registration
- line comments, bracket config, and editor indentation rules
- basic TextMate syntax highlighting
- semantic symbol coloring for UTU declarations and references
- syntax diagnostics powered by the local `tree-sitter-utu.wasm`
- document outline symbols for top-level declarations
- hover details for UTU symbols, core types, and common builtins
- local go-to-definition, find references, and document highlights
- completions for UTU keywords, core types, builtin namespaces, and top-level symbols
- workspace symbol search across `.utu` files
- commands to compile or run the active file and inspect generated JavaScript, WAT, and the parser tree
- test and benchmark discovery through the VS Code Testing view and per-declaration code lenses
- the reusable language core now lives in `.`, with `./extension` acting as the thin adapter layer
- the standalone `utu-lsp` server now builds from `./lsp.mjs`
- compiler bundles that build directly from `.`, so the extension uses the same compile path as the CLI and other tooling
- a web extension bundle for `vscode.dev` at `dist/web/extension.js`

## Commands

- `UTU: Compile Current File`
- `UTU: Run Main`
- `UTU: Show Generated JavaScript`
- `UTU: Show Generated WAT`
- `UTU: Show Syntax Tree`

## Development

Build everything from the repo root:

```sh
bun run build
```

Run the full verification suite from the repo root:

```sh
bun run test
```

`bun run test` verifies that the test manifest covers every checked-in `scripts/test-*.mjs` regression and then runs the full suite.

For rebuild-on-change:

```sh
bun run watch
```

The build emits the web extension plus the current compiler bundles and Bun executables:

- `dist/web/extension.js`: the browser/webworker extension host entrypoint for `vscode.dev`
- `dist/compiler.web.mjs`: the browser-targeted compiler bundle built directly from the shared compiler sources
- `dist/compiler.mjs`: the Node-targeted compiler bundle built directly from the shared compiler sources
- `./utu`: bundled Bun CLI executable
- `./utu-lsp`: bundled Bun LSP executable

The extension is packaged as a web-first `vscode.dev` target. Language intelligence comes from the shared `.` core, and the standalone stdio UTU LSP server builds from `./lsp.mjs`. UTU targets modern ES runtimes, so the browser host can compile files, run `export fun main()`, and execute discovered tests and benches through the Testing view while keeping hover, definitions, diagnostics, symbols, semantic tokens, and completions available.

Design note: do not add VS Code-specific behavior to the compiler or generated shim just to make the extension UI work. The compiler should stay shared and host-agnostic. If the editor needs better run output, prefer surfacing `main()` return values and wiring explicit host/runtime imports rather than teaching codegen about VS Code.

## Run It In VS Code

Open the repo root in VS Code, then use the `UTU: Run Web Extension in VS Code` launch configuration from Run and Debug. That configuration points at the repo root package and starts the web extension host with `--extensionDevelopmentKind=web`.
