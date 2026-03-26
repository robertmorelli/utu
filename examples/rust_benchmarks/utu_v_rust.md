# Utu vs Rust DeltaBlue

Generated: 2026-03-26T06:16:31.287Z

## Benchmark Setup

- Warmup runs: 2
- Minimum timed runs: 3
- Iterations per command: 20
- Prepared cache: `/var/folders/z5/4xclvs3x7w3gccl9590jgyrm0000gn/T/utu-deltablue-bench-cache`

## Source vs Bundle Sizes

| Variant | Source (bytes) | Source rel. smallest | Bundle (bytes) | Bundle / Source |
| --- | ---: | ---: | ---: | ---: |
| Utu bundle | 26366 | 1x | 5255 | 0.199x |
| Utu protocols bundle | 33013 | 1.252x | 6996 | 0.212x |
| Rust wasm | 34117 | 1.294x | 32283 | 0.946x |
| Rust native | 34117 | 1.294x | 372912 | 10.93x |
| Unsafe Rust wasm | 33127 | 1.256x | 24014 | 0.725x |
| Unsafe Rust native | 33127 | 1.256x | 372272 | 11.238x |

Source size counts only the benchmark language files. Utu bundle size combines the generated `module.mjs` and `utu.wasm` outputs.

## Chain Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 41.082 | 8.962 | 34.439 | 77.267 | 1x | 64 |
| unsafe_rust_wasm | 75.219 | 0.688 | 73.786 | 76.493 | 1.831x | 35 |
| utu_wasm | 125.662 | 1.511 | 123.972 | 129.198 | 3.059x | 21 |
| utu_protocols_wasm | 147.038 | 8.951 | 141.303 | 174.924 | 3.579x | 17 |
| rc_rust_native | 174.707 | 4.516 | 171.438 | 191.048 | 4.253x | 16 |
| rc_rust_wasm | 236.823 | 31.302 | 217.447 | 319.874 | 5.765x | 13 |

## Projection Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 59.802 | 12.637 | 50.979 | 102.276 | 1x | 52 |
| unsafe_rust_wasm | 124.137 | 1.244 | 122.7 | 128.798 | 2.076x | 23 |
| utu_wasm | 198.25 | 6.352 | 193.635 | 219.433 | 3.315x | 14 |
| utu_protocols_wasm | 211.205 | 6.183 | 205.274 | 230.216 | 3.532x | 14 |
| rc_rust_native | 299.024 | 8.2 | 284.686 | 317.869 | 5x | 10 |
| rc_rust_wasm | 360.124 | 53.841 | 326.154 | 449.594 | 6.022x | 8 |
