# Utu CLI Artifact

This folder contains a very small Bun CLI for compiling and running `.utu` files.

## Files

- `src/cli.mjs` contains almost all of the CLI
- `src/lib/compiler.mjs` is the tiny bridge to the shared compiler
- `tree-sitter-utu.wasm` is the parser artifact

## Commands

Run all commands from this folder with Bun:

```bash
bun ./src/cli.mjs help
bun ./src/cli.mjs compile ../examples/float.utu --outdir ./dist/float
bun ./src/cli.mjs run ../examples/float.utu
bun ./src/cli.mjs run ../examples/hello_name.utu
bun ./src/cli.mjs test ../examples/ci/tests_basic.utu
bun ./src/cli.mjs bench ../examples/bench/bench_basic.utu --iterations 1000 --samples 5
```

Build the standalone CLI executable:

```bash
bun run build
./dist/utu help
```

`compile` writes:

- `<name>.mjs` with the generated JS wrapper
- `<name>.wasm` with the wasm bytes
- `<name>.wat` when `--wat` is passed

`run` ships with a built-in host for the current examples:

- `console_log`
- `prompt`
- `i64_to_string`
- `f64_to_string`
- `math_sin`
- `math_cos`
- `math_sqrt`

`test` compiles in test mode, runs synthesized zero-arg exports, and reports
source test names as `PASS` or `FAIL`.

`bench` compiles in bench mode, runs synthesized benchmark exports with host
timing, and reports mean/min/max plus time per iteration.

All execution flows through the shared `run` / `test` / `bench` pipeline, and
Binaryen optimization is always enabled.
