# Utu CLI Artifact

This folder contains the Bun-based CLI scaffold for compiling and running `.utu` files without coupling the command surface to the ongoing compiler refactor.

## Layout

- `src/cli.ts` is the CLI entrypoint and dispatcher
- `src/commands/` contains the user-facing subcommands
- `src/lib/compiler.ts` is the only place that talks to the shared compiler module
- `tree-sitter-utu.wasm` is the parser artifact passed into the shared compiler

## Commands

Run all commands from this folder with Bun:

```bash
bun run ./src/cli.ts help
bun run ./src/cli.ts check ../examples/call_simple.utu
bun run ./src/cli.ts compile ../examples/float.utu --outdir ./dist/float
bun run ./src/cli.ts run ../examples/float.utu
```

`compile` writes:

- `<name>.mjs` with the generated JS wrapper
- `<name>.wasm` with the wasm bytes
- `<name>.wat` when `--wat` is passed

## Custom Runtime Imports

`run` ships with a small default host for the current examples:

- `console_log`
- `i64_to_string`
- `f64_to_string`
- `math_sin`
- `math_cos`
- `math_sqrt`

You can merge additional host imports with `--imports`:

```ts
// runtime/imports.ts
export const console_log = (value: unknown) => console.log("utu:", value);

export default {
  custom_global: 42,
};
```

```bash
bun run ./src/cli.ts run ../examples/call_simple.utu --imports ./runtime/imports.ts
```

## Notes

The compiler hookup intentionally lives behind a narrow adapter so we can change compiler internals later without reshaping the CLI package.

Optimization is currently opt-in with `--optimize` so the CLI stays usable while the compiler pipeline is in flux.
