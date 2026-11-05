# mandelbrot

`bench(n)`: the BG program for an n x n bitmap; returns FNV-1a (32-bit) of the bytes
BG prints, `"P4\n<n> <n>\n"` and the PBM bitmap. n = 3,200 (BG: 16,000; both multiples
of 64, so C takes its 64-pixel path). Checked: n = 200 gives the hash of BG's
reference output `mandelbrot-output.txt` (5,011 bytes, 4046075071) for every port.
Run: `node scripts/benchmark-bg.mjs mandelbrot`.

## Ports

All single-threaded (every BG program here renders rows on several threads).

| port | source | adapted |
|---|---|---|
| c | BG gcc #6 (Kevin Miller): `__m128d` vector arithmetic, 8 pixels as 4 pairs, escape checked every 8 steps, 64 pixels a `long` | `unsigned long` → `uint64_t` (long is 32-bit on wasm32; it holds 64 pixels); `inline` → `static inline`; OpenMP ignored; `write` → FNV of the buffer; `-msse2`, `-sSTACK_SIZE=4MB` for its VLAs |
| cpp | BG g++ #4 (Markus Flad): `Simd256DUnion` (AVX, `-mavx` as BG's `-march=native`), skips the escape check after a non-empty byte | `numberOfCpuCores` = 1, calculators run in place of `std::thread`; `std::cout` → `HashStream` (FNV); `Simd512DUnion` `#if`'d out (no `__m512d`) |
| rust | BG Rust #4: `F64x8` as `[f64; 8]` (LLVM vectorizes) | rayon `par_chunks_mut` → `chunks_mut`; `format!` + FNV; `+simd128` |
| go | [BG Go #6](https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/mandelbrot-go-6.html): scalar | Goroutines → rows in order; header and bitmap → FNV. Switched from #4: 1052 → 680 ms in two interleaved rounds. Old port in `alt/go-4/` |
| swift | BG Swift #7: `SIMD8<Double>` | no Foundation/Dispatch: `concurrentPerform` → `for`, `FileHandle` → FNV. Its coordinates (`Cr0 + x·pixelwidth8`) differ in rounding from the others', the bitmap agrees |
| haskell | BG GHC #3 (after C #6): `DoubleX2#` primops | GHC's wasm backend has no SIMD ("not supported on this architecture"): `DoubleX2#` and its primops are defined as pairs of `Double#` (scalar, same arithmetic); one worker (was four `fork#`); `B.putStr` → FNV |
| dart | BG Dart #4 (dart exe) | isolates → one segment 0..h here; `dart compile wasm -O2` |
| js | BG Node #3 | workers/Atomics → rows in order; `ArrayBuffer` for the `SharedArrayBuffer` |
| kotlin | not on BG: from BG Java GraalVM #6 | thread pool → rows in order |
| moonbit | not on BG: from BG Node #3 (scalar; MoonBit has no SIMD) | bytes hashed as made |
| assemblyscript | not on BG: from BG gcc #6 | `__m128d` → v128 f64x2; C's pair arrays as v128 globals (an inlined function can't write a caller's locals); `--enable simd` |
| utu | Go #4 / Node #3's scalar algorithm, idiomatic (no `@wat`) | bytes hashed as made |
| utu tuned | gcc #6's algorithm, `@wat` | the whole of C's `mand8` is one `@wat` function (all state in v128 locals), one call a byte |

SIMD: c, cpp, rust, swift, assemblyscript, utu tuned (simd128); haskell scalarized; the rest scalar.

## Results

d8 15.6.75.16 (Apple M-series), median of 10 after 3 warmups; n = 3,200. Size = Wasm + JS needed to run it, minified; gzip -9 per file, summed.

| port | ms | raw bytes | gzip bytes |
|---|---:|---:|---:|
| utu fast | 393.8 | 2,450 | 1,258 |
| utu fastUnsafe | 393.3 | 1,301 | 700 |
| utu small | 393.8 | 2,142 | 1,250 |
| utu smallUnsafe | 394.0 | 993 | 692 |
| C (emcc) | 130.8 | 15,130 | 6,840 |
| C++ (em++) | 123.6 | 18,960 | 7,892 |
| Rust | 124.3 | 22,975 | 10,118 |
| Go | 1053.7 | 2,424,238 | 708,512 |
| Swift | 247.8 | 5,555,284 | 1,699,350 |
| Haskell | 367.9 | 1,509,660 | 437,647 |
| Dart | 388.1 | 42,481 | 16,880 |
| JavaScript | 469.4 | 878 | 519 |
| Kotlin | 427.0 | 9,538 | 4,988 |
| MoonBit | 396.5 | 1,246 | 840 |
| AssemblyScript | 225.1 | 6,236 | 2,909 |
| *utu tuned fast* (`@wat` f64x2) | 130.9 | 3,240 | 1,428 |
| *utu tuned small* (`@wat` f64x2) | 130.5 | 3,157 | 1,439 |

(Exact numbers: `results.json` here; the table is one run.)

Idiomatic utu (394 ms) runs the scalar algorithm about as fast as the other scalar
ports (MoonBit 397, Dart 388, Haskell 368, Kotlin 427, JS 469; Go 1054) at the
smallest size; the SIMD ports are 2–3x faster. Frontier (ms vs gzip): JavaScript
(0.5 KB, 469 ms), utu smallUnsafe (0.7 KB, 394), AssemblyScript (2.9 KB, 225),
C (6.8 KB, 131), C++ (7.9 KB, 124). The tuned utu (1.4 KB, 131 ms, C's speed)
would replace AssemblyScript and C on it.

## Caveats

- The SIMD ports win by 8 pixels a step in f64x2; idiomatic utu has no SIMD
  without `@wat`. The tuned port's single big `@wat` is the whole kernel in WAT,
  i.e. hand-written Wasm.
- C++ runs AVX through Emscripten's emulation (each `__m256d` two v128); C uses
  SSE2 vector syntax, which maps directly.
- Haskell's SIMD is scalarized (the GHC wasm backend rejects vector primops);
  that is GHC's limit, not the program's.
- Go is slow here (1 s): its wasm backend, not the algorithm (the same code is
  ~4x faster in JS/Dart/MoonBit).
- Go, Swift, Haskell ship their runtimes (and `benchmarks/bg/wasi.js`); Dart and
  Kotlin their JS runtimes. JavaScript's size is its source only.


Update (2026-11-05): `mandelbrot.utu` now steps 8 pixels per byte together in scalar F64 with an escape test every 7 steps (gcc #6 without its SIMD): ~387 -> ~165 ms. The 2-pixel version is `alt/mandelbrot-2pixel.utu`. utu numbers are in results.json.
