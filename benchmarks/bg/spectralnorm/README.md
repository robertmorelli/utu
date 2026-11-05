# spectralnorm

`bench(n)`: the BG program for n; returns FNV-1a (32-bit) of the bytes BG prints,
`"%.9f\n"` of the spectral norm. n = 2,000 (BG: 5,500). Checked: n = 100 gives BG's
reference `1.274219991` (hash 890904276) in every port.
Run: `node scripts/benchmark-bg.mjs spectralnorm`.

## Ports

All single-threaded (every BG program here splits rows across threads).

| port | source | adapted |
|---|---|---|
| c | [BG gcc #7](https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-gcc-7.html): SSE intrinsics | Single-threaded; `snprintf` + FNV; Emscripten SIMD. Switched from #6: 120 → 78 ms in two interleaved rounds. Old port in `alt/c-6/` |
| cpp | BG g++ #6 (Jakubowski et al.): SSE2, two rows at a time, A by increments | OpenMP and `sched_getaffinity` removed (begin = 0, end = N); `-msse3` |
| rust | BG Rust #6 (Cobzarenco, Bogus): `F64x2` pairs, `x / a` | `F64x2` on `core::arch::wasm32` (was `__m128d`); rayon `par_iter_mut` → `iter_mut`; `format!` + FNV; `+simd128` |
| go | BG Go #4: scalar | goroutines/channel → direct calls over all rows; `fmt.Sprintf` |
| swift | BG Swift #3: scalar | `Glibc`/`Dispatch` → `WASILibc`; `concurrentPerform` → `for`; prints BG's `roundDouble` string (same bytes as `%.9f` here) |
| haskell | BG GHC #4: scalar on `Ptr Double` | `foreign export ccall bench`; `printf` to a String. Wasm RTS is single-threaded: `numCapabilities` = 1, so the code runs unchanged as one chunk |
| dart | BG Dart #6 (dart exe) | isolates → one span 0..n computed in place (`auFromTo` + copy into `w`, as the main isolate did); `dart compile wasm -O2` |
| js | [BG Node #1](https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-node-1.html) | Sequential as published; formatted output → FNV. Switched from #6: 746 → 182 ms in two interleaved rounds. Old port in `alt/js-6/` |
| kotlin | not on BG: from BG Java GraalVM #3 (after Go #4) | `Times` threads → `run()` called directly; `DecimalFormat` → `format9` |
| moonbit | not on BG: from BG Node #6 (scalar; MoonBit has no SIMD) | `FixedArray[Double]`; `%.9f` by hand |
| assemblyscript | not on BG: from BG Rust #6 | `StaticArray<v128>` pairs, f64x2 div; `--enable simd` |
| utu | Go #4 / Node #6's scalar algorithm, idiomatic (no `@wat`) | `a(i, j)` integer, `u[j] / a` |
| utu tuned | Rust #6's f64x2 algorithm, `@wat` | one `@wat` per term (A pair, convert, div, add); one `mult` with a transpose flag, called from one site (see Caveats) |

SIMD: c, cpp, rust, assemblyscript, utu tuned (simd128, explicit); the rest scalar.
The C program's speed comes from AVX on 4x4 blocks; utu has SIMD only through `@wat`,
so idiomatic utu runs the scalar algorithm of Go/JS/Java/Haskell/Swift/Dart.

## Results

d8 15.6.75.16 (Apple M-series), median of 10 after 3 warmups; n = 2,000. Size = Wasm + JS needed to run it, minified; gzip -9 per file, summed.

| port | ms | raw bytes | gzip bytes |
|---|---:|---:|---:|
| utu fast | 157.8 | 3,381 | 1,279 |
| utu fastUnsafe | 157.7 | 2,232 | 720 |
| utu small | 373.0 | 2,191 | 1,224 |
| utu smallUnsafe | 374.0 | 1,042 | 665 |
| C (emcc) | 120.6 | 13,491 | 6,443 |
| C++ (em++) | 157.0 | 11,438 | 6,017 |
| Rust | 55.1 | 48,211 | 20,184 |
| Go | 201.2 | 2,423,132 | 706,454 |
| Swift | 159.1 | 5,554,052 | 1,698,534 |
| Haskell | 159.0 | 1,953,068 | 519,983 |
| Dart | 374.5 | 42,745 | 16,903 |
| JavaScript | 759.0 | 776 | 413 |
| Kotlin | 161.5 | 7,992 | 4,037 |
| MoonBit | 163.9 | 1,280 | 809 |
| AssemblyScript | 88.1 | 5,302 | 2,734 |
| *utu tuned fast* (`@wat` f64x2) | 84.1 | 2,410 | 1,402 |
| *utu tuned small* (`@wat` f64x2) | 84.2 | 2,362 | 1,406 |

(Exact numbers: `results.json` here; the table is one run.)

Idiomatic utu fast runs with the scalar ports (Swift, Haskell, Kotlin, MoonBit,
C++ at 157–164 ms) at the smallest size but MoonBit's; the SIMD ports (Rust 55,
AssemblyScript 88, C 121) are faster. Frontier (ms vs gzip): JavaScript (0.4 KB,
759 ms), utu smallUnsafe (0.7 KB, 374), utu fastUnsafe (0.7 KB, 158),
AssemblyScript (2.7 KB, 88), Rust (20 KB, 55). The tuned utu (1.4 KB, 84 ms)
would replace AssemblyScript on it.

## Caveats

- C/C++ run x86 intrinsics through Emscripten's emulation: C's 256-bit ops are two
  128-bit ops and `_mm_rcp_ps` is an f32 divide (exact, where x86's is approximate:
  the refinement step then changes nothing).
- V8 inlines wasm calls by feedback gathered before a function is optimized, and a
  wasm function is only replaced between calls (no OSR). A long-running function
  whose second half has not run yet gets its calls there left out of line. utu
  `-O fast` inlines each call of a loop-holding function, so the tuned port first
  ran 130 ms (four inlined copies of `mult`, three cold: `term` stayed a call);
  routing all forty passes through one call site fixed it (85 ms). Idiomatic utu
  small (373 ms vs fast's 158) is the same trap: -O small merges `times` and
  `times_transp` into one function, whose transposed loop's call to `a` is left out
  of line ("not called often enough" in `--trace-wasm-inlining`). Note:
  `scratchpad/bg/utu-bugs/inlined-copies-cold.utu`.
- JavaScript: the first three calls take 285 ms; then V8 settles on Maglev code
  that deopts on every OSR'd inner-loop exit and runs 760 ms (290 ms with
  `--no-maglev`). The table has the steady state the harness measures. au/atu are
  top-level functions (made once, as in BG's workerThread).
- Swift prints with BG's `roundDouble` (`Double(Int(x·1e9 + 0.5))/1e9` then
  `description`), not `%.9f`; it agrees here.
- Go, Swift, Haskell ship their runtimes (and `benchmarks/bg/wasi.js`); Dart and
  Kotlin their JS runtimes. JavaScript's size is its source only.


Update (2026-11-05): `spectralnorm.utu` steps the A(i,j) denominator incrementally (d += step; step += 1) instead of recomputing (i+j)(i+j+1)/2+i+1 per element, and sums into two accumulators: fast 152 -> ~87 ms, small 357 -> ~91 ms, plain utu. Note: the other ports compute A(i,j) directly, so part of the gain is an algorithmic strength reduction they do not have (their SIMD lanes give them a similar factor). The direct version is `alt/spectralnorm-direct.utu`. utu numbers are in results.json.
