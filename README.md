# UTU
A high level language that compiles to highly efficient wasm.

### About the repo
- compiler/ contains the js for wasm codegen
- examples/ contains utu benchmarks
- examples/ci contains small smoke fixtures for CI
- src/ contains grammargen stuff from tree sitter
- vscode/ contains the vscode extension
- web_artifact/ conatins the web demo
- cli_artifact/ contains the bun cli for compilation

### About UTU
- The spec is in spec.md
- Vaguely has algebraic types
- Relies solely on js memory (no linear memory)
- Lowers to nearly analagous wasm

### Testing
- `bun run test` runs the smoke suite from `examples/manifest.json`
- `bun run test:examples:all` runs the smoke suite plus the current benchmark examples as non-blocking legacy coverage
- `.github/workflows/example-tests.yml` runs the smoke suite on pull requests and supports a manual full-suite run
- `scripts/test-examples.mjs` writes a JSON report when passed `--report-file <path>`
