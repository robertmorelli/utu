# Utu vs Rust DeltaBlue

Generated: 2026-03-22T01:47:45.583Z

## Benchmark Setup

- Warmup runs: 10
- Minimum timed runs: 10
- Iterations per command: 20
- Prepared cache: `/var/folders/z5/4xclvs3x7w3gccl9590jgyrm0000gn/T/utu-deltablue-bench-cache`

## Source vs Bundle Sizes

| Variant | Source (bytes) | Source rel. smallest | Bundle (bytes) | Bundle / Source |
| --- | ---: | ---: | ---: | ---: |
| Utu bundle | 27473 | 1x | 12996 | 0.473x |
| Rust wasm | 34117 | 1.242x | 32283 | 0.946x |
| Rust native | 34117 | 1.242x | 372912 | 10.93x |
| Unsafe Rust wasm | 33127 | 1.206x | 24014 | 0.725x |
| Unsafe Rust native | 33127 | 1.206x | 372272 | 11.238x |

Source size counts only the benchmark language files. Utu bundle size combines the generated `module.mjs` and `utu.wasm` outputs.

## Chain Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 41.548 | 1.859 | 39.381 | 53.309 | 1x | 61 |
| unsafe_rust_wasm | 72.49 | 0.805 | 70.558 | 74.562 | 1.745x | 38 |
| utu_wasm | 128.95 | 1.557 | 126.536 | 131.807 | 3.104x | 22 |
| rc_rust_native | 180.616 | 1.444 | 178.178 | 182.729 | 4.347x | 16 |
| rc_rust_wasm | 218.795 | 3.366 | 215.274 | 225.755 | 5.266x | 13 |

## Projection Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 52.836 | 0.933 | 51.486 | 56.015 | 1x | 51 |
| unsafe_rust_wasm | 117.381 | 2.3 | 115.002 | 125.782 | 2.222x | 24 |
| utu_wasm | 197.948 | 11.36 | 188.512 | 226.912 | 3.746x | 13 |
| rc_rust_native | 299.899 | 2.812 | 294.727 | 302.359 | 5.676x | 10 |
| rc_rust_wasm | 324.623 | 2.361 | 321.199 | 329.267 | 6.144x | 10 |
