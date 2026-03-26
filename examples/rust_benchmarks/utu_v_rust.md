# Utu vs Rust DeltaBlue

Generated: 2026-03-26T09:13:25.651Z

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
| unsafe_rust_native | 44.239 | 7.119 | 38.079 | 73.343 | 1x | 70 |
| unsafe_rust_wasm | 78.627 | 1.26 | 76.823 | 81.932 | 1.777x | 34 |
| utu_wasm | 127.187 | 1.882 | 125.296 | 133.357 | 2.875x | 23 |
| utu_protocols_wasm | 148.688 | 32.388 | 128.352 | 243.43 | 3.361x | 15 |
| rc_rust_native | 189.76 | 14.283 | 178.762 | 219.608 | 4.289x | 16 |
| rc_rust_wasm | 225.401 | 1.721 | 223.492 | 229.164 | 5.095x | 12 |

## Projection Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 52.752 | 9.899 | 46.693 | 97.354 | 1x | 52 |
| unsafe_rust_wasm | 118.271 | 2.358 | 114.061 | 123.404 | 2.242x | 23 |
| utu_wasm | 191.611 | 2.703 | 188.598 | 197.349 | 3.632x | 14 |
| utu_protocols_wasm | 207.429 | 25.851 | 191.272 | 258.39 | 3.932x | 14 |
| rc_rust_native | 291.583 | 3.405 | 285.394 | 295.647 | 5.527x | 10 |
| rc_rust_wasm | 329.013 | 6.453 | 320.063 | 339.692 | 6.237x | 10 |
