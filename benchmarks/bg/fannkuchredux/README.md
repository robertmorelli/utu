# fannkuchredux

`bench(n)`: fannkuch-redux over all n! permutations; returns FNV-1a (32-bit) of the bytes BG prints,
`"<checksum>\nPfannkuchen(<n>) = <max flips>\n"`. n = 10 (BG: 12). Checked against BG's reference output:
n = 7 → `228`, `16` (1328886884); n = 10 → `73196`, `38` (1161472954).
Run: `node scripts/benchmark-bg.mjs fannkuchredux`.

## Ports

All single-threaded: the BG programs split the permutations into blocks/chunks for threads; here the same blocks run in order.

| port | source | adapted |
|---|---|---|
| c | BG gcc #6 (Kurdyukov): permutation and counts in one `__m128i` each; flips by `pshufb`, next permutation by `movemask`/`ctz` + a shuffle table | pthreads removed (one `fannkuch_func` walks the 24 blocks); SSSE3/SSE4.1 via Emscripten's `<smmintrin.h>` (`-msse4.1`): `pshufb` is `i8x16.swizzle` of index & 0x8F, `blendv` is `bitselect`; `printf` → `snprintf` + FNV |
| cpp | BG g++ #6 (Simion, Yu): `__m128i` permutation, `pshufb` flips, scalar count array | OpenMP pragma removed; `-msse4.1`; `std::cout` → `snprintf` (iostream ~100 KB) |
| rust | BG Rust #6 (Jayakusuma, after g++ #6): `u128` permutation, `pshufb` by mask tables | rayon's nested `into_par_iter`/`reduce` → `map`/`fold`; `_mm_shuffle_epi8` → `u8x16_swizzle` (indices < 16, same result), `_mm_extract_epi8` → `u8x16_extract_lane`; `+simd128` |
| go | BG Go #3 (Mazurov; Pfeifer): scalar, `[16]int` stack arrays, 720 chunks | goroutine chain → loop; atomics → plain; `//go:wasmexport bench`; `fmt.Sprintf` |
| swift | BG Swift #3 (Ganszky): scalar, `UnsafeMutablePointer<Int>`, 150 tasks | `concurrentPerform` → loop; Glibc → WASILibc; globals `nonisolated(unsafe)` (Swift 6 mode); `pp.assign` → `pp.update` (renamed API) |
| haskell | BG GHC #3 (Wasserman): `Ptr Word8` permutations, 4 blocks | `forkIO`/`MVar` → `forM` in order; `foreign export ccall bench` |
| dart | BG Dart #5 (dart exe; Gouy after Node #5): scalar `Int32List`, 720 chunks | isolates → loop; `dart compile wasm -O2` (WasmGC) |
| js | BG Node #5 (Filatkin after Go #3): scalar arrays, 720 chunks | `worker_threads` → loop |
| kotlin | not on BG: from BG Java GraalVM #1 (Mazurov): `IntArray`, 150 tasks | one worker runs every task; `@JsExport bench` |
| moonbit | not on BG: from BG Node #5 (scalar; the C/C++/Rust sources are SSE shuffles) | `FixedArray[Int]` |
| assemblyscript | not on BG: from BG gcc #6 | `v128` throughout, the SSE intrinsics as Emscripten emulates them; `masks_shift`/factorials in static memory; `--enable simd` |
| utu | Mazurov's algorithm as Go #3 / Node #5 (720 chunks, sign alternation) | idiomatic: `Array[I32]`, no `@wat`; output hashed digit by digit |
| utu tuned | gcc #6's algorithm | permutation and counts are `V128`; the flip loop of one permutation is one `@wat` (with a `loop`), next permutation 3 more `@wat` calls; `masks_shift` an `Array[V128]` built by composing rotations; block start unranked in scalar code |

SIMD: c, cpp, rust, assemblyscript, utu tuned (simd128, explicit); the rest scalar.

## Results

d8 15.6.75.16 (Apple M-series), median of 10 after 3 warmups; n = 10. Size = Wasm + JS needed to run it, minified; gzip -9 per file, summed.

| port | ms | raw bytes | gzip bytes |
|---|---:|---:|---:|
| utu fast | 186.9 | 3,060 | 1,344 |
| utu fastUnsafe | 188.7 | 2,662 | 1,117 |
| utu small | 190.5 | 2,047 | 1,246 |
| utu smallUnsafe | 192.2 | 1,649 | 1,019 |
| utu tuned fast | 117.1 | 3,714 | 1,427 |
| utu tuned small | 116.5 | 2,081 | 1,328 |
| C (emcc) | 110.8 | 11,591 | 6,112 |
| C++ (em++) | 139.0 | 12,108 | 6,436 |
| Rust | 135.5 | 22,985 | 10,115 |
| Go | 391.3 | 2,425,786 | 707,426 |
| Swift | 204.7 | 5,556,104 | 1,699,630 |
| Haskell | 640.6 | 1,515,237 | 437,936 |
| Dart | 201.0 | 43,296 | 17,296 |
| JavaScript | 237.7 | 1,294 | 714 |
| Kotlin | 203.0 | 7,373 | 3,867 |
| MoonBit | 187.4 | 5,079 | 2,714 |
| AssemblyScript | 107.1 | 8,228 | 4,113 |

(Exact numbers: `results.json` here; the table is one run. The machine was shared with other benchmark runs; an earlier, quieter run had every port ~20% faster in the same order: C 90, AssemblyScript 84, utu tuned 93, utu 151, MoonBit 152 ms.)

Frontier (ms vs gzip): JavaScript (0.7 KB, 238 ms), utu smallUnsafe (1.0 KB, 192 ms), utu fastUnsafe (1.1 KB, 189 ms), MoonBit (2.7 KB, 187 ms, a tie); with the tuned variant, utu tuned small (1.3 KB, 117 ms), then AssemblyScript (4.0 KB, 107 ms). Idiomatic utu is the smallest Wasm port and ties MoonBit for the fastest scalar one.

## Caveats

- The BG-fastest programs (gcc #6, g++ #6, Rust #6) win on x86 with `pshufb`; in Wasm they are 1.4–1.7x faster than the fastest scalar ports, not more. `pshufb` maps to `i8x16.swizzle` (plus an `and` for Emscripten's exact emulation), but `blendv` is two ops, and g++ #6/Rust #6 read a lane by a variable index through memory.
- The idiomatic utu port is scalar: utu SIMD is `@wat`, which the fairness rule keeps out of `fannkuchredux.utu`. It runs with MoonBit and slightly ahead of Kotlin/Dart/Swift and JS. `utu tuned` (gcc #6 in `@wat`, 4 calls a permutation) is within 10% of C and AssemblyScript.
- utu fast vs fastUnsafe: the same time; the bounds checks cost nothing measurable here. utu's safe builds ship a 0.7 KB argument-checking loader; unsafe ones a 0.3 KB one.
- Output formatting is in the size: libc `snprintf` (C/C++), Rust `format!`, Go `fmt`, Swift string interpolation (Swift's 5.3 MB is mostly its runtime/stdlib Unicode tables), Haskell `show`; AssemblyScript `toString`; MoonBit/Kotlin/Dart/JS string templates. utu hashes digits and literal bytes (JS string builtins) without building a string.
- Go, Swift, Haskell ship their runtimes (and `benchmarks/bg/wasi.js`); Dart and Kotlin their JS runtimes. JavaScript's size is its source only.
