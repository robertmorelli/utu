# UTU
A high level language that compiles to highly efficient wasm.

### About the repo
- compiler/ contains the js for wasm codegen
- examples/ contains utu benchmarks
- src/ contains grammargen stuff from tree sitter
- vscode/ contains the vscode extension
- web_artifact/ conatins the web demo
- cli_artifact/ contains the bun cli for compilation

### About UTU
- The spec is in spec.md
- Vaguely has algebraic types
- Relies solely on js memory (no linear memory)
- Lowers to nearly analagous wasm