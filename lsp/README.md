# UTU LSP

This folder now holds the reusable UTU language layer.

## Layout

- `src/core`: parser, diagnostics, symbol indexing, hover metadata, completions, definitions, references, semantic tokens, and other editor-agnostic queries
- `src/server`: the home for a true Language Server Protocol transport layer

The VS Code extension consumes `src/core` directly, so language intelligence can keep moving here while editor-specific glue stays in `vscode/`.
