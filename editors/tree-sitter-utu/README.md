# utu editor grammar

This tree-sitter grammar is used by editors, including the Helix integration.
The self-hosted compiler parses utu itself; no tree-sitter runtime ships in
`dist/`.

From the repository root, run `bun run build --grammar` after editing the
grammar. `bun run build --wasm` also rebuilds the parser Wasm when the
Emscripten toolchain is available. Generated C, JSON, and Wasm artifacts are
committed so editor installs do not need the grammar toolchain.
