# UTU VS Code Extension

This folder now contains the starting point for the UTU VS Code extension.

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
- commands to compile the active file and inspect generated JavaScript, WAT, and the parser tree
- the reusable language core now lives in `../lsp/src/core`, with `vscode/src` acting as a thin adapter layer
- a build step that copies `/compiler` into the hidden `vscode/.generated/compiler` snapshot before bundling `dist/compiler.mjs`
- a web extension bundle for `vscode.dev` at `dist/web/extension.js`

## Commands

- `UTU: Compile Current File`
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

The build emits the web extension plus the current compiler snapshot:

- `dist/web/extension.js`: the browser/webworker extension host entrypoint for `vscode.dev`
- `dist/compiler.mjs`: a bundled snapshot of the current compiler sources from `../compiler`

The source snapshot lives in `vscode/.generated/compiler`, which is hidden and gitignored so extension work stays isolated from ongoing compiler refactors while still letting the editor call the current compiler.

The extension is now packaged as a web-first `vscode.dev` target. Language intelligence comes from the shared `../lsp` core so the same parser/index/query layer can back a future standalone UTU LSP server. Compiler commands are still reported as unsupported in the browser host for now, while hover, definitions, diagnostics, symbols, semantic tokens, and completions stay available.

## Run It In VS Code

Open the repo root in VS Code, then use the `UTU: Run Web Extension in VS Code` launch configuration from Run and Debug. That configuration points at the `vscode/` package and starts the web extension host with `--extensionDevelopmentKind=web`.
