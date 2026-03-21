# UTU
A high level language that compiles to highly efficient wasm.

### About the repo
- compiler/ contains the js for wasm codegen
- examples/ contains utu benchmarks
- examples/ci contains small smoke fixtures for CI
- src/ contains grammargen stuff from tree sitter
- vscode/ contains the vscode extension
- web_artifact/ contains the web demo
- cli_artifact/ contains the bun cli for compilation

### About UTU
- The spec lives in `spec.md`, with topic-oriented Typst docs under `documentation/`
- Vaguely has algebraic types
- Relies solely on js memory (no linear memory)
- Lowers to nearly analogous wasm

### Testing
- `bun run test` runs the smoke suite from `examples/manifest.json`
- `bun run test:language` runs focused `assert` / `test` / `bench` checks through the CLI
- `bun run test:examples:all` runs the smoke suite plus the current benchmark examples as non-blocking legacy coverage
- `.github/workflows/example-tests.yml` runs the smoke suite on pull requests and supports a manual full-suite run
- `scripts/test-examples.mjs` writes a JSON report when passed `--report-file <path>`

### CLI
- `bun ./cli_artifact/src/cli.mjs compile <file> [--outdir <dir>] [--wat]`
- `bun ./cli_artifact/src/cli.mjs run <file> [--imports <file>]`
- `bun ./cli_artifact/src/cli.mjs test <file> [--imports <file>]`
- `bun ./cli_artifact/src/cli.mjs bench <file> [--imports <file>] [--iterations <n>] [--samples <n>] [--warmup <n>]`
- `bun run build:cli` builds a standalone CLI executable at `cli_artifact/dist/utu`
