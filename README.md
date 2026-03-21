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
- The canonical spec lives under `documentation/`; `documentation/spec.typ` assembles the full spec and `documentation/index.typ` organizes the topic-oriented docs
- Vaguely has algebraic types
- Relies solely on js memory (no linear memory)
- Lowers to nearly analogous wasm

### Testing
- `bun run test` runs the full local suite: the full manifest plus language, editor-core, compile, benchmark, and docs/codegen checks
- `bun run test:examples` runs the smoke-tagged cases from `examples/manifest.json`
- `bun run test:examples:codegen` runs the codegen-tagged cases from `examples/manifest.json`
- `bun run test:language` runs focused `assert` / `test` / `bench` checks through the CLI
- `bun run test:examples:all` runs the full manifest, including the benchmark-tagged cases
- `.github/workflows/example-tests.yml` runs the full suite on pull requests, pushes to `main` / `master`, and manual dispatches
- `scripts/test-examples.mjs` writes a JSON report when passed `--report-file <path>`

### CLI
- `bun ./cli_artifact/src/cli.mjs compile <file> [--outdir <dir>] [--wat]`
- `bun ./cli_artifact/src/cli.mjs run <file> [--imports <file>]`
- `bun ./cli_artifact/src/cli.mjs test <file> [--imports <file>]`
- `bun ./cli_artifact/src/cli.mjs bench <file> [--imports <file>] [--seconds <n>] [--samples <n>] [--warmup <n>]`
- `bun run build:cli` builds a standalone CLI executable at `cli_artifact/dist/utu`

### License
- MIT
