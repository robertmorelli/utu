# binarytrees

`bench(n)`: binary-trees with max depth n (a stretch tree of depth n+1, a long-lived tree of depth n kept
until the end, and 2^(n−d+4) trees of each even depth d from 4 to n); returns FNV-1a (32-bit) of the bytes
BG prints. n = 18 (BG: 21). Checked against BG's reference output: n = 10 → 717034075; n = 18 → 3963415002.
Run: `node scripts/benchmark-bg.mjs binarytrees`.

## Ports

All single-threaded: the BG programs build the trees of each depth on separate threads; here the depths run in order.

| port | source | allocation | adapted |
|---|---|---|---|
| c | BG gcc #2 (Zerfas) | APR memory pools: bump-allocate nodes, clear the pool per tree | APR is not built for Wasm: `c/apr_pools.h` implements the five pool calls used with APR's unmanaged-pool semantics (8 KiB blocks, zeroed bump allocation, `clear` keeps the blocks); OpenMP pragmas removed; `printf` → `snprintf` + FNV |
| cpp | [BG g++ #1](https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/binarytrees-gpp-1.html) | Boost `object_pool` | Sequential loops; `snprintf` + FNV; `-I/opt/homebrew/include -DBOOST_POOL_NO_MT`. Switched from #7: 898 → 344 ms in two interleaved rounds. Old port in `alt/cpp-7/` |
| rust | BG Rust #5 (Machida et al.) | `bumpalo::Bump` arena per tree (bumpalo 3.20.3, builds for wasm32-unknown-unknown) | rayon `into_par_iter` → `into_iter`; `println!` → `format!` + FNV |
| go | BG Go #2 (Lima) | Go GC | goroutines/WaitGroup → calls in order; `//go:wasmexport bench` |
| swift | BG Swift #4 (Gouy) | `class TreeNode`, ARC | Dispatch queues → calls in order (long-lived tree built first, checked last); Foundation dropped (unused; 50 MB in Wasm); globals → locals |
| haskell | BG GHC #4 (Stewart et al.) | GHC GC; long-lived tree in a compact region (`GHC.Compact`) | `Control.Parallel.Strategies` (the `parallel` package is not in the Wasm GHC's package db) dropped: `checkPar4`/`makePar4`/`makePar2` build the same subtrees without `using`; `foreign export ccall bench` |
| dart | BG Dart #7 (dart exe; Gouy) | WasmGC objects | isolates → loop; `dart compile wasm -O2` |
| js | BG Node #6 (Sarrazin; Filatkin) | JS objects (V8 GC) | `worker_threads` → loop |
| kotlin | not on BG: from BG Java GraalVM #7 (Dupont) | WasmGC objects | executor → loop; `@JsExport bench` |
| moonbit | not on BG: from BG Node #6 (GC'd tree; MoonBit has no arena) | WasmGC structs, `TreeNode?` children | — |
| assemblyscript | not on BG: from BG gcc #2 | 8-byte nodes in linear memory, the C port's pool semantics over `heap.alloc` | `--runtime incremental` (its GC unused by the trees) |
| utu | the GC'd tree of Java #7 / Node #6 | WasmGC `rec struct Node` with `?Node` children | idiomatic: no arena (utu has none over GC structs); output hashed digit by digit |

No SIMD (none of the sources uses it).

## Results

d8 15.6.75.16 (Apple M-series), median of 10 after 3 warmups; n = 18. Size = Wasm + JS needed to run it, minified; gzip -9 per file, summed.

| port | ms | raw bytes | gzip bytes |
|---|---:|---:|---:|
| utu fast | 305.1 | 3,319 | 1,201 |
| utu fastUnsafe | 303.0 | 2,897 | 969 |
| utu small | 325.0 | 1,448 | 955 |
| utu smallUnsafe | 326.2 | 1,044 | 726 |
| C (emcc) | 325.9 | 17,719 | 8,807 |
| C++ (em++) | 910.8 | 25,178 | 12,172 |
| Rust | 242.1 | 23,367 | 10,559 |
| Go | 6813.9 | 2,430,342 | 708,576 |
| Swift | 1776.5 | 5,561,025 | 1,702,486 |
| Haskell | 1826.8 | 1,769,086 | 479,109 |
| Dart | 240.8 | 43,253 | 16,571 |
| JavaScript | 577.2 | 899 | 467 |
| Kotlin | 231.0 | 7,174 | 3,837 |
| MoonBit | 267.9 | 4,706 | 2,483 |
| AssemblyScript | 273.3 | 7,823 | 3,816 |

(Exact numbers: `results.json` here; the table is one run, on a machine shared with other benchmark runs; GC'd ports vary ±5% run to run.)

Frontier (ms vs gzip): JavaScript (0.5 KB, 577 ms), utu smallUnsafe (0.7 KB, 326 ms), utu fastUnsafe (1.0 KB, 303 ms), Kotlin (3.7 KB, 231 ms). The fastest ports are Kotlin, Dart, Rust (231–242 ms); idiomatic utu is 25–30% behind them, ahead of C's APR-shim pool (326 ms) at a tenth of its size.

## Caveats

- The comparison is arenas (C, C++, Rust, AssemblyScript: one bump pointer, the tree freed at once) against garbage collectors (V8's for JS and the WasmGC ports utu, Dart, Kotlin, MoonBit; Go's, GHC's and Swift's ARC compiled into the module). In Wasm the arenas lose most of their native advantage: V8's young-generation GC is as cheap per short-lived node.
- C uses a shim, not APR. APR's pool does a bit more per call (its allocator, cleanup lists); the shim's cost per node is a bounds check, a bump, and an 8-byte `memset`, close to APR's `apr_pcalloc` fast path.
- C++ g++ #7 is slow in Wasm because each tree's `monotonic_buffer_resource` grows by allocating from the `unsynchronized_pool_resource`, which hands big blocks to `operator new` (dlmalloc) and frees them per tree; with libstdc++ on Linux the same pattern is cheaper. The code is as BG has it.
- Go's 2.3 MB module runs its GC in Wasm without threads; most of its time is GC. Go's port calls `runtime.GC()` before `bench` returns: without it, in a wasip1 reactor, GC stopped triggering after three calls at n = 18 and the heap grew to the 4 GB limit ("out of memory").
- utu vs Kotlin/Dart (all WasmGC, same tree): utu's `Node` has nullable children checked with `promote`/`orelse fatal`; Kotlin/Dart are 20–25% faster here. Not investigated further.
- Output formatting is in the size, as in the other programs (`snprintf`, `format!`, `fmt`, Swift interpolation, `printf`, `toString`, templates); utu hashes digits and literal bytes (JS string builtins) without building strings.
