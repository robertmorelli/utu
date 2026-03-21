# Utu CLI Artifact

This folder contains a very small Bun CLI for compiling and running `.utu` files.

## Files

- `src/cli.ts` contains almost all of the CLI
- `src/lib/compiler.ts` is the tiny bridge to the shared compiler
- `tree-sitter-utu.wasm` is the parser artifact

## Commands

Run all commands from this folder with Bun:

```bash
bun run ./src/cli.ts help
bun run ./src/cli.ts compile ../examples/float.utu --outdir ./dist/float
bun run ./src/cli.ts run ../examples/float.utu
```

`compile` writes:

- `<name>.mjs` with the generated JS wrapper
- `<name>.wasm` with the wasm bytes
- `<name>.wat` when `--wat` is passed

`run` ships with a built-in host for the current examples:

- `console_log`
- `i64_to_string`
- `f64_to_string`
- `math_sin`
- `math_cos`
- `math_sqrt`

The CLI always uses the non-optimized compiler path for now.
