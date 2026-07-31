# Tiny Rust/utu Wasm comparison

All three modules export the same integer mixing loop as `run(i32) -> i32`.
The benchmark compiles utu with the repository compiler and both ordinary and
`#![forbid(unsafe_code)]` Rust with `rustc -O` for
`wasm32-unknown-unknown`, verifies equal output, warms the modules, and reports
repeated in-process timings and binary sizes. The runner adds the safe module's
export after rustc, so its source needs no unsafe export attribute.

Run from the repository root:

```sh
bun run bench:tiny
```

This is a smoke benchmark, not a language shootout. It measures one scalar loop
in Bun's current WebAssembly engine. Rust receives LLVM optimization while utu
currently emits validated Binaryen output without a general optimization pass.
