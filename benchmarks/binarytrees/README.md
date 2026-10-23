# binary-trees benchmark

binary-trees from the Computer Language Benchmarks Game: an allocation and
garbage-collection stress test. Each run builds a stretch tree of depth
`max_depth + 1`, keeps one long-lived tree of depth `max_depth` alive
throughout, and then, for every depth `d` from 4 to `max_depth` in steps of 2,
builds and checks `2^(max_depth - d + 4)` short-lived trees of depth `d`.
A tree is built bottom-up (left subtree first), and `check` counts its nodes.

The four ports follow the canonical program step for step, with
`max_depth = 14` (about 3.2 million nodes allocated per run):

- `binarytrees.utu`: WasmGC structs whose children are nullable references.
- `binarytrees.js`: a `Node` class with `null` children at the leaves.
- `rust/`: safe Rust, children as `Option<Box<Node>>` (one heap allocation per
  node, freed when the tree is dropped).
- `rust-unsafe/`: one bump arena per tree, as the fast Rust entries do with
  `typed_arena`: a `Vec<Node>` sized for the whole tree, raw child pointers,
  freed at once with the arena.

Each exports `bench(iterations)`, which returns the sum of every tree's check
over all iterations: 3,222,190 per iteration (stretch 65,535, the depth loop
3,123,888, long-lived 32,767).

## Snapshot

d8 15.6 on arm64 macOS, 5 warmups, median of 20 samples of `bench(1)`; utu
built at `-O fast` and `-O small` (with the checks) and their `Unsafe` forms.
From `bun run bench:programs-d8`.

| implementation | time / iteration | Wasm size | gzip |
|---|---:|---:|---:|
| utu Wasm, `-O fast` | 10.9 ms | 4,056 B | 1,398 B |
| utu Wasm, `-O fastUnsafe` | 11.1 ms | 3,840 B | 1,383 B |
| utu Wasm, `-O small` | 11.1 ms | 339 B | 250 B |
| utu Wasm, `-O smallUnsafe` | 10.8 ms | 333 B | 248 B |
| safe Rust Wasm | 42.6 ms | 21,292 B | 9,405 B |
| unsafe Rust Wasm | 9.3 ms | 21,466 B | 9,507 B |
| JavaScript | 20.4 ms | | |
