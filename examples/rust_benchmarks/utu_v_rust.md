# Utu vs Rust DeltaBlue

Generated: 2026-03-24T02:46:02.217Z

## Benchmark Setup

- Warmup runs: 10
- Minimum timed runs: 10
- Iterations per command: 20
- Prepared cache: `/var/folders/z5/4xclvs3x7w3gccl9590jgyrm0000gn/T/utu-deltablue-bench-cache`

## Source vs Bundle Sizes

| Variant | Source (bytes) | Source rel. smallest | Bundle (bytes) | Bundle / Source |
| --- | ---: | ---: | ---: | ---: |
| Utu bundle | 28157 | 1x | 19375 | 0.688x |
| Rust wasm | 34117 | 1.212x | 32283 | 0.946x |
| Rust native | 34117 | 1.212x | 372912 | 10.93x |
| Unsafe Rust wasm | 33127 | 1.177x | 24014 | 0.725x |
| Unsafe Rust native | 33127 | 1.177x | 372272 | 11.238x |

Source size counts only the benchmark language files. Utu bundle size combines the generated `module.mjs` and `utu.wasm` outputs.

## Chain Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 35.417 | 0.438 | 34.635 | 36.316 | 1x | 75 |
| unsafe_rust_wasm | 74.459 | 0.306 | 73.884 | 75.375 | 2.102x | 38 |
| utu_wasm | 117.628 | 0.99 | 115.336 | 119.405 | 3.321x | 24 |
| rc_rust_native | 173.204 | 0.294 | 172.908 | 173.912 | 4.89x | 16 |
| rc_rust_wasm | 215.238 | 0.619 | 214.393 | 216.413 | 6.077x | 13 |

## Projection Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 48.776 | 0.226 | 48.461 | 49.754 | 1x | 56 |
| unsafe_rust_wasm | 116.72 | 0.312 | 116.011 | 117.297 | 2.393x | 24 |
| utu_wasm | 184.535 | 1.901 | 181.187 | 188.359 | 3.783x | 16 |
| rc_rust_native | 290.676 | 5.187 | 282.275 | 294.628 | 5.959x | 10 |
| rc_rust_wasm | 314.509 | 0.567 | 313.625 | 315.393 | 6.448x | 10 |
