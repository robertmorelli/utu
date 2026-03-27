# Utu vs Rust DeltaBlue

Generated: 2026-03-27T19:34:33.156Z

## Benchmark Setup

- Warmup runs: 10
- Minimum timed runs: 10
- Iterations per command: 20
- Prepared cache: `/var/folders/z5/4xclvs3x7w3gccl9590jgyrm0000gn/T/utu-deltablue-bench-cache`

## Source vs Bundle Sizes

| Variant | Source (bytes) | Source rel. smallest | Bundle (bytes) | Bundle / Source |
| --- | ---: | ---: | ---: | ---: |
| Utu bundle | 26321 | 1.006x | 5354 | 0.203x |
| Utu protocols bundle | 26173 | 1x | 5823 | 0.222x |
| Rust wasm | 34117 | 1.304x | 32283 | 0.946x |
| Rust native | 34117 | 1.304x | 372912 | 10.93x |
| Unsafe Rust wasm | 33127 | 1.266x | 24014 | 0.725x |
| Unsafe Rust native | 33127 | 1.266x | 372272 | 11.238x |

Source size counts only the benchmark language files. Utu bundle size combines the generated `module.mjs` and `utu.wasm` outputs.

## Chain Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 41.247 | 1.725 | 37.989 | 46.49 | 1x | 65 |
| unsafe_rust_wasm | 80.269 | 1.457 | 77.608 | 83.768 | 1.946x | 33 |
| utu_wasm | 135.527 | 3.575 | 129.519 | 147.333 | 3.286x | 21 |
| utu_protocols_wasm | 139.207 | 2.645 | 134.184 | 143.17 | 3.375x | 21 |
| rc_rust_native | 194.166 | 15.259 | 180.951 | 221.242 | 4.707x | 15 |
| rc_rust_wasm | 229.511 | 6.136 | 223.13 | 247.289 | 5.564x | 12 |

## Projection Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 53.547 | 4.187 | 51.057 | 81.821 | 1x | 50 |
| unsafe_rust_wasm | 129.133 | 12.592 | 121.821 | 185.171 | 2.412x | 23 |
| utu_protocols_wasm | 200.38 | 3.228 | 195.094 | 208.334 | 3.742x | 14 |
| utu_wasm | 201.388 | 3.471 | 196.643 | 208.575 | 3.761x | 14 |
| rc_rust_native | 305.482 | 15.364 | 292.919 | 345.179 | 5.705x | 10 |
| rc_rust_wasm | 334.777 | 10.816 | 327.435 | 365.032 | 6.252x | 10 |
