# fannkuch-redux benchmark

fannkuch-redux from the Computer Language Benchmarks Game, following its
single-threaded C program (`fannkuchredux.c`): every permutation of `0..n` is
generated in place with a count array (rotating a prefix left), copied, and
flipped by prefix reversal until its first element is 0. The run records the
largest flip count and an alternating-sign checksum of all flip counts. It
exercises tight integer loops over small mutable int arrays and bounds checks.

Four ports do the same work step for step: utu (`Array[I32]`), safe Rust
(`Vec<i32>`, indexed), unsafe Rust (the same `Vec`s with `get_unchecked` and
`ptr::swap`), and JavaScript (`Int32Array`). Each allocates its three arrays
once per run, as the C program does.

## Workload

Each port exports `bench(iterations)`, which runs fannkuch-redux with `n = 9`
`iterations` times and returns the sum of `checksum * 1000 + maxFlips`. For
`n = 9` the reference output is checksum 8629 and 30 flips, so `bench(1)` is
`8629030`. (`n = 7` gives `228016`, which the utu and Rust tests check.)

## Snapshot

d8 15.6 on arm64 macOS, 5 warmups then the median of 20 samples of `bench(1)`;
utu built at `-O fast` and `-O small` (with the checks) and their `Unsafe`
forms. All returned 8629030. From `bun run bench:programs-d8`.

| implementation | time | payload | gzip |
|---|---:|---:|---:|
| utu Wasm, `-O fast` | 13.3 ms | 5,240 B | 1,730 B |
| utu Wasm, `-O fastUnsafe` | 13.2 ms | 5,240 B | 1,730 B |
| utu Wasm, `-O small` | 14.2 ms | 553 B | 352 B |
| utu Wasm, `-O smallUnsafe` | 14.3 ms | 553 B | 352 B |
| safe Rust Wasm | 12.6 ms | 22,760 B | 10,025 B |
| unsafe Rust Wasm | 13.7 ms | 22,133 B | 9,764 B |
| JavaScript | 17.7 ms | | |
