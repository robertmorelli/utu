# Utu vs Rust DeltaBlue

Generated: 2026-03-24T04:42:44.734Z

## Benchmark Setup

- Warmup runs: 10
- Minimum timed runs: 10
- Iterations per command: 20
- Prepared cache: `/var/folders/z5/4xclvs3x7w3gccl9590jgyrm0000gn/T/utu-deltablue-bench-cache`

## Source vs Bundle Sizes

| Variant | Source (bytes) | Source rel. smallest | Bundle (bytes) | Bundle / Source |
| --- | ---: | ---: | ---: | ---: |
| Utu bundle | 28157 | 1x | 5284 | 0.188x |
| Rust wasm | 34117 | 1.212x | 32283 | 0.946x |
| Rust native | 34117 | 1.212x | 372912 | 10.93x |
| Unsafe Rust wasm | 33127 | 1.177x | 24014 | 0.725x |
| Unsafe Rust native | 33127 | 1.177x | 372272 | 11.238x |

Source size counts only the benchmark language files. Utu bundle size combines the generated `module.mjs` and `utu.wasm` outputs.

## Chain Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 35.437 | 0.586 | 34.652 | 38.392 | 1x | 75 |
| unsafe_rust_wasm | 74.441 | 0.405 | 73.622 | 75.895 | 2.101x | 38 |
| utu_wasm | 124.803 | 1.607 | 122.442 | 128.857 | 3.522x | 23 |
| rc_rust_native | 175.453 | 1.842 | 173.491 | 180.253 | 4.951x | 16 |
| rc_rust_wasm | 218.179 | 4.09 | 214.9 | 228.617 | 6.157x | 13 |

## Projection Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 50.737 | 4.055 | 48.016 | 77.396 | 1x | 56 |
| unsafe_rust_wasm | 120.426 | 5.323 | 115.642 | 141.207 | 2.374x | 20 |
| utu_wasm | 188.981 | 1.947 | 185.204 | 191.475 | 3.725x | 15 |
| rc_rust_native | 292.543 | 5.193 | 282.802 | 299.109 | 5.766x | 10 |
| rc_rust_wasm | 323.048 | 3.846 | 317.046 | 331.034 | 6.367x | 10 |
