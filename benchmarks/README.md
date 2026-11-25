# Benchmarks

Benchmark suites comparing utu's WasmGC output against JS, Rust, and other WasmGC compilers.

## Running

```sh
bun run bench:tiny        # small compute kernels vs. Rust
bun run bench:kernels     # benchmark suite
bun run bench:deltablue   # DeltaBlue constraint solver
bun run bench:loops       # fused iterator pipelines
bun run bench:engines     # WasmGC engine comparison
bun run bench:suite       # full benchmark suite
```

## Suites

- `bg/` — Benchmarks Game ports and recorded results (`bg/results.json`)
- `binarytrees/`, `deltablue/`, `fannkuch/`, `nbody/`, `richards/` — cross-language WasmGC benchmarks
- `abi/`, `control-flow/`, `engines/`, `loops/`, `pantry/`, `programs/`, `suite/`, `tiny/` — focused microbenchmarks and engine comparisons
