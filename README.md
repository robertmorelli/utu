# UTU VS Code Extension

This repo is now the UTU VS Code extension package.

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

Run the extension build from this folder:

```sh
npm run build
```

For rebuild-on-change:

```sh
npm run watch
```

For VS Code desktop debugging of the web extension host:

```sh
npm run watch:web
```

The build emits the web extension plus the current compiler bundles:

- `dist/web/extension.js`: the browser/webworker extension host entrypoint for `vscode.dev`
- `dist/compiler.web.mjs`: the browser-targeted compiler bundle built directly from the shared compiler sources
- `dist/compiler.mjs`: the Node-targeted compiler bundle built directly from the shared compiler sources

The extension is packaged as a web-first `vscode.dev` target. Language intelligence comes from the shared `.` core, and the standalone stdio UTU LSP server now builds from `./lsp.mjs`. The browser host can compile files, run `export fun main()`, and execute discovered tests and benches through the Testing view while keeping hover, definitions, diagnostics, symbols, semantic tokens, and completions available.

## Run It In VS Code

Open the repo root in VS Code, then use the `UTU: Run Web Extension in VS Code` launch configuration from Run and Debug. That configuration points at the repo root package and starts the web extension host with `--extensionDevelopmentKind=web`.
