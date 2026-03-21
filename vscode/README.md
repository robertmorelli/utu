# UTU VS Code Extension

This folder now contains the starting point for the UTU VS Code extension.

## What is set up

- `.utu` language registration
- line comments, bracket config, and editor indentation rules
- basic TextMate syntax highlighting
- syntax diagnostics powered by the local `tree-sitter-utu.wasm`
- document outline symbols for top-level declarations
- commands to compile the active file and inspect generated JavaScript, WAT, and the parser tree
- a build step that snapshots the current repo compiler into `dist/compiler.mjs`

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

The build emits two artifacts:

- `dist/extension.js`: the VS Code extension host entrypoint
- `dist/compiler.mjs`: a bundled snapshot of the current compiler sources from `../compiler`

That snapshot approach keeps the extension work isolated from ongoing compiler refactors while still letting the editor call the current compiler.
