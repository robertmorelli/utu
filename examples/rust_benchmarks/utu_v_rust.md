# Utu vs Rust DeltaBlue

Generated: 2026-03-26T09:20:02.427Z

## Benchmark Setup

- Warmup runs: 10
- Minimum timed runs: 10
- Iterations per command: 20
- Prepared cache: `/var/folders/z5/4xclvs3x7w3gccl9590jgyrm0000gn/T/utu-deltablue-bench-cache`

## Source vs Bundle Sizes

| Variant | Source (bytes) | Source rel. smallest | Bundle (bytes) | Bundle / Source |
| --- | ---: | ---: | ---: | ---: |
| Utu bundle | 26204 | 1.002x | 5240 | 0.2x |
| Utu protocols bundle | 26155 | 1x | 7132 | 0.273x |
| Rust wasm | 34117 | 1.304x | 32283 | 0.946x |
| Rust native | 34117 | 1.304x | 372912 | 10.93x |
| Unsafe Rust wasm | 33127 | 1.267x | 24014 | 0.725x |
| Unsafe Rust native | 33127 | 1.267x | 372272 | 11.238x |

Source size counts only the benchmark language files. Utu bundle size combines the generated `module.mjs` and `utu.wasm` outputs.

## Chain Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 42.783 | 3.04 | 38.372 | 56.553 | 1x | 63 |
| unsafe_rust_wasm | 87.282 | 6.773 | 77.462 | 99.906 | 2.04x | 34 |
| utu_wasm | 133.212 | 4.209 | 126.078 | 142.747 | 3.114x | 22 |
| utu_protocols_wasm | 133.831 | 1.634 | 131.881 | 137.692 | 3.128x | 21 |
| rc_rust_native | 180.985 | 1.286 | 179.539 | 184.494 | 4.23x | 16 |
| rc_rust_wasm | 232.112 | 9.145 | 224.078 | 245.31 | 5.425x | 12 |

## Projection Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 53.98 | 4.931 | 51.75 | 87.87 | 1x | 51 |
| unsafe_rust_wasm | 123.999 | 1.966 | 122.109 | 131.634 | 2.297x | 23 |
| utu_wasm | 197.737 | 2.232 | 193.842 | 202.744 | 3.663x | 14 |
| utu_protocols_wasm | 201.631 | 1.344 | 199.14 | 204.736 | 3.735x | 14 |
| rc_rust_native | 315.58 | 44.27 | 292.845 | 440.039 | 5.846x | 10 |
| rc_rust_wasm | 340.54 | 13.393 | 329.916 | 363.561 | 6.309x | 10 |
