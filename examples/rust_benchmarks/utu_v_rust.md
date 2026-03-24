# Utu vs Rust DeltaBlue

Generated: 2026-03-24T19:41:16.967Z

## Benchmark Setup

- Warmup runs: 10
- Minimum timed runs: 10
- Iterations per command: 20
- Prepared cache: `/var/folders/z5/4xclvs3x7w3gccl9590jgyrm0000gn/T/utu-deltablue-bench-cache`

## Source vs Bundle Sizes

| Variant | Source (bytes) | Source rel. smallest | Bundle (bytes) | Bundle / Source |
| --- | ---: | ---: | ---: | ---: |
| Utu bundle | 26366 | 1x | 5255 | 0.199x |
| Rust wasm | 34117 | 1.294x | 32283 | 0.946x |
| Rust native | 34117 | 1.294x | 372912 | 10.93x |
| Unsafe Rust wasm | 33127 | 1.256x | 24014 | 0.725x |
| Unsafe Rust native | 33127 | 1.256x | 372272 | 11.238x |

Source size counts only the benchmark language files. Utu bundle size combines the generated `module.mjs` and `utu.wasm` outputs.

## Chain Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 40.335 | 1.552 | 37.188 | 45.515 | 1x | 68 |
| unsafe_rust_wasm | 74.856 | 0.502 | 74.208 | 76.463 | 1.856x | 37 |
| utu_wasm | 119.368 | 1.191 | 117.452 | 121.329 | 2.959x | 24 |
| rc_rust_native | 174.172 | 0.557 | 173.358 | 175.306 | 4.318x | 16 |
| rc_rust_wasm | 215.686 | 0.795 | 214.265 | 216.958 | 5.347x | 13 |

## Projection Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 49.183 | 0.527 | 48.349 | 50.798 | 1x | 56 |
| unsafe_rust_wasm | 117.436 | 0.483 | 116.515 | 118.444 | 2.388x | 24 |
| utu_wasm | 189.16 | 1.628 | 186.18 | 192.068 | 3.846x | 15 |
| rc_rust_native | 291.682 | 3.722 | 284.901 | 295.33 | 5.931x | 10 |
| rc_rust_wasm | 314.611 | 0.561 | 313.773 | 315.743 | 6.397x | 10 |
