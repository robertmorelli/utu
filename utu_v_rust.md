# Utu vs Rust DeltaBlue

Generated: 2026-03-21T10:10:11.508Z

## Benchmark Setup

- Warmup runs: 10
- Minimum timed runs: 10
- Iterations per command: 20
- Prepared cache: `/var/folders/z5/4xclvs3x7w3gccl9590jgyrm0000gn/T/utu-deltablue-bench-cache`

## Binary Sizes

| Variant | Artifact | Size (bytes) | Size (KiB) |
| --- | --- | ---: | ---: |
| Utu wasm | Compiled wasm payload | 5102 | 4.982 |
| Utu wrapper | Generated module.mjs | 8215 | 8.022 |
| Rust wasm | rust_deltablue.wasm | 44400 | 43.359 |
| Rust native | release/rust_deltablue | 372912 | 364.172 |

## Chain Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| utu_wasm | 129.723 | 1.978 | 125.764 | 134.974 | 1x | 22 |
| rust_wasm | 212.657 | 2.952 | 210.109 | 220.85 | 1.639x | 13 |
| rust_native | 181.807 | 1.537 | 180.279 | 185.33 | 1.402x | 16 |

## Projection Benchmark

| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| utu_wasm | 192.544 | 2.853 | 188.891 | 198.737 | 1x | 15 |
| rust_wasm | 323.742 | 0.98 | 322.022 | 324.733 | 1.681x | 10 |
| rust_native | 282.346 | 3.558 | 276.74 | 287.747 | 1.466x | 10 |
