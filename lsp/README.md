# UTU LSP

This folder now holds the reusable UTU language layer and a standalone `stdio`
language server.

## Layout

- `src/core`: parser, diagnostics, symbol indexing, hover metadata, completions, definitions, references, semantic tokens, and other editor-agnostic queries
- `src/server`: document management plus the Language Server Protocol transport layer
- `scripts/build.mjs`: bundles the server and copies the Tree-sitter runtime / grammar wasm assets into `dist/`

## Build

```sh
npm run build
```

That emits:

- `dist/utu-lsp.js`: the executable UTU LSP server
- `dist/web-tree-sitter.wasm`: the parser runtime wasm
- `dist/tree-sitter-utu.wasm`: the UTU grammar wasm

Run the server over stdio with:

```sh
node ./dist/utu-lsp.js
```

The VS Code extension still consumes `src/core` directly, so language
intelligence can keep moving here while editor-specific glue stays in
`vscode/`.
