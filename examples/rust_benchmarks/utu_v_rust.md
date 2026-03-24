# Utu vs Rust DeltaBlue

Generated: 2026-03-24T04:56:33.644Z

## Benchmark Setup

- Warmup runs: 10
- Minimum timed runs: 10
- Iterations per command: 20
- Prepared cache: `/var/folders/z5/4xclvs3x7w3gccl9590jgyrm0000gn/T/utu-deltablue-bench-cache`

## Source vs Bundle Sizes

| Variant | Source (bytes) | Source rel. smallest | Bundle (bytes) | Bundle / Source |
| --- | ---: | ---: | ---: | ---: |
| Utu bundle | 27576 | 1x | 5240 | 0.19x |
| Rust wasm | 34117 | 1.237x | 32283 | 0.946x |
| Rust native | 34117 | 1.237x | 372912 | 10.93x |
| Unsafe Rust wasm | 33127 | 1.201x | 24014 | 0.725x |
| Unsafe Rust native | 33127 | 1.201x | 372272 | 11.238x |

Source size counts only the benchmark language files. Utu bundle size combines the generated `module.mjs` and `utu.wasm` outputs.

## Chain Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 35.914 | 1.169 | 34.585 | 40.285 | 1x | 75 |
| unsafe_rust_wasm | 74.948 | 0.405 | 74.216 | 75.776 | 2.087x | 37 |
| utu_wasm | 120.675 | 0.97 | 118.618 | 123.164 | 3.36x | 23 |
| rc_rust_native | 173.95 | 0.523 | 173.322 | 175.001 | 4.843x | 16 |
| rc_rust_wasm | 216.251 | 0.871 | 214.745 | 218.27 | 6.021x | 13 |

## Projection Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 48.916 | 0.851 | 47.959 | 52.051 | 1x | 55 |
| unsafe_rust_wasm | 117.217 | 1.532 | 116.278 | 123.688 | 2.396x | 23 |
| utu_wasm | 190.839 | 2.358 | 186.576 | 195.887 | 3.901x | 14 |
| rc_rust_native | 290.428 | 5.207 | 279.519 | 296.201 | 5.937x | 10 |
| rc_rust_wasm | 318.973 | 11.392 | 313.918 | 351.232 | 6.521x | 10 |
