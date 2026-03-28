# Utu vs Rust DeltaBlue

Generated: 2026-03-28T19:49:44.883Z

## Benchmark Setup

- Warmup runs: 10
- Minimum timed runs: 10
- Iterations per command: 20
- Prepared cache: `/var/folders/z5/4xclvs3x7w3gccl9590jgyrm0000gn/T/utu-deltablue-bench-cache`

## Source vs Bundle Sizes

| Variant | Source (bytes) | Source rel. smallest | Bundle (bytes) | Bundle / Source |
| --- | ---: | ---: | ---: | ---: |
| Utu bundle | 26282 | 1.006x | 5287 | 0.201x |
| Utu protocols bundle | 26135 | 1x | 5756 | 0.22x |
| Rust wasm | 34117 | 1.305x | 32283 | 0.946x |
| Rust native | 34117 | 1.305x | 372912 | 10.93x |
| Unsafe Rust wasm | 33127 | 1.268x | 24014 | 0.725x |
| Unsafe Rust native | 33127 | 1.268x | 372272 | 11.238x |

Source size counts only the benchmark language files. Utu bundle size combines the generated `module.mjs` and `utu.wasm` outputs.

## Chain Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 40.856 | 1.71 | 36.686 | 44.856 | 1x | 68 |
| unsafe_rust_wasm | 80.728 | 2.909 | 77.56 | 89.813 | 1.976x | 34 |
| utu_wasm | 132.532 | 10.823 | 123.538 | 174.809 | 3.244x | 21 |
| utu_protocols_wasm | 137.321 | 6.67 | 128.371 | 148.734 | 3.361x | 19 |
| rc_rust_native | 183.14 | 8.361 | 176.345 | 203.067 | 4.483x | 16 |
| rc_rust_wasm | 228.671 | 3.171 | 223.353 | 234.317 | 5.597x | 13 |

## Projection Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unsafe_rust_native | 49.951 | 1.253 | 48.892 | 54.889 | 1x | 55 |
| unsafe_rust_wasm | 121.759 | 0.752 | 120.684 | 123.852 | 2.438x | 23 |
| utu_wasm | 192.926 | 2.165 | 189.034 | 195.918 | 3.862x | 15 |
| utu_protocols_wasm | 193.142 | 2.12 | 189.338 | 196.265 | 3.867x | 15 |
| rc_rust_native | 294.27 | 4.129 | 284.658 | 299.905 | 5.891x | 10 |
| rc_rust_wasm | 320.965 | 3.173 | 318.194 | 329.003 | 6.426x | 10 |
