# Utu vs Rust DeltaBlue

Generated: 2026-03-26T10:52:36.765Z

## Benchmark Setup

- Warmup runs: 10
- Minimum timed runs: 10
- Iterations per command: 20
- Prepared cache: `/var/folders/z5/4xclvs3x7w3gccl9590jgyrm0000gn/T/utu-deltablue-bench-cache`

## Source vs Bundle Sizes

| Variant | Source (bytes) | Source rel. smallest | Bundle (bytes) | Bundle / Source |
| --- | ---: | ---: | ---: | ---: |
| Utu bundle | 26449 | 1.006x | 5356 | 0.203x |
| Utu protocols bundle | 26301 | 1x | 5773 | 0.219x |
| Rust wasm | 34117 | 1.297x | 32283 | 0.946x |
| Rust native | 34117 | 1.297x | 372912 | 10.93x |
| Unsafe Rust wasm | 33127 | 1.26x | 24014 | 0.725x |
| Unsafe Rust native | 33127 | 1.26x | 372272 | 11.238x |

Source size counts only the benchmark language files. Utu bundle size combines the generated `module.mjs` and `utu.wasm` outputs.

## Chain Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 40.679 | 1.633 | 37.928 | 45.138 | 1x | 65 |
| unsafe_rust_wasm | 77.637 | 2.022 | 74.615 | 83.318 | 1.909x | 37 |
| utu_protocols_wasm | 129.937 | 2.988 | 126.041 | 134.955 | 3.194x | 22 |
| utu_wasm | 130.929 | 7.262 | 121.737 | 149.304 | 3.219x | 22 |
| rc_rust_native | 178.302 | 6.109 | 174.951 | 200.647 | 4.383x | 16 |
| rc_rust_wasm | 218.012 | 2.419 | 215.166 | 222.937 | 5.359x | 13 |

## Projection Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 56.633 | 30.521 | 49.527 | 273.366 | 1x | 54 |
| unsafe_rust_wasm | 120.717 | 1.981 | 117.578 | 126.845 | 2.132x | 24 |
| utu_wasm | 191.186 | 2.161 | 187.773 | 196.176 | 3.376x | 15 |
| utu_protocols_wasm | 191.556 | 5.665 | 188.096 | 211.186 | 3.382x | 15 |
| rc_rust_native | 309.962 | 50.594 | 279.715 | 452.338 | 5.473x | 10 |
| rc_rust_wasm | 327.387 | 8.939 | 320.005 | 350.51 | 5.781x | 10 |
