# nbody

`bench(n)`: the BG program with n steps; returns FNV-1a (32-bit) of the bytes BG prints,
`"%.9f\n"` of the energy before and after. n = 2,000,000 (BG: 50,000,000).
Run: `node scripts/benchmark-bg.mjs nbody`.

## Ports

| port | source | adapted |
|---|---|---|
| c | BG gcc #9 (Miles): AVX, 1/sqrt in f32 + Goldschmidt refinement | `<x86intrin.h>` → `<immintrin.h>`; Emscripten emulates AVX on simd128 (`-mavx -msimd128`): each `__m256d` is 2 v128, `_mm_rsqrt_ps` is f32 sqrt + div. `main` → `bench`, `printf` → `snprintf` + FNV |
| cpp | BG g++ #0 (Collin, after gcc #9): same, template-unrolled | as c |
| rust | BG Rust #9 (after gcc #9) | `std::arch::x86_64` → module `avx` in the file: the intrinsics it uses, written on `core::arch::wasm32` as Emscripten emulates them; `println!` → `format!` + FNV; `+simd128` |
| go | BG Go #3: scalar | `//go:wasmexport bench`, reactor; `sys` reset from a copy each call; `fmt.Sprintf` |
| swift | BG Swift #3 (`SIMD4<Double>`) | `import simd` only if available (WASI has none: the file's own `dot`). `String(format:)` → libc `vsnprintf`: Foundation is 50 MB in Wasm (ICU); with it the module was 53.8 MB, without 5.6 MB. `-Ounchecked -wmo` as BG |
| haskell | BG GHC #2: `Storable` planets | `foreign export ccall bench`; `printf` to a String; frees the planets |
| dart | BG Dart #6 (dart exe) | `dart compile wasm -O2` (WasmGC); `main` sets `globalThis.bench`; `toStringAsFixed(9)` |
| js | BG Node #6 | top-level code → `bench`; `toFixed(9)` |
| kotlin | not on BG: from BG Java GraalVM #4 | classes and loops as Java; no `String.format` in Kotlin/Wasm, so `format9` (round to nanos, digits) |
| moonbit | not on BG: from BG Node #6 (scalar; the AVX sources don't fit MoonBit) | digits hashed as formatted |
| assemblyscript | not on BG: from BG gcc #9 | each `__m256d` two v128 in static memory, the intrinsics as Emscripten's; `--enable simd` |
| utu (`nbody.utu`) | BG Node #6, idiomatic (the fastest source that fits scalar code; MoonBit and JS run the same one) | mirrors `moonbit/nbody.mbt`: same Body struct in an Array, same loops, same operation order, digits hashed as formatted. gcc #9 in plain scalar utu is `alt/nbody-gcc9.utu` (132 ms: without SIMD its pair arrays and f32 rsqrt lose to a plain sqrt) |
| utu tuned (`nbody.tuned.utu`) | gcc #9's algorithm, hand-tuned | pairs unrolled (as g++ #0), state in V128 locals, f64x2/f32x4 through fused `@wat` functions; reported apart, not utu's headline |

SIMD: c, cpp, rust, assemblyscript, utu tuned (simd128, explicit); swift (`SIMD4`, by LLVM); the rest scalar.

## Results

d8 15.6.75.16 (Apple M-series), median of 10 after 3 warmups; n = 2,000,000. Size = Wasm + JS needed to run it, minified; gzip -9 per file, summed.

| port | ms | raw bytes | gzip bytes |
|---|---:|---:|---:|
| utu fast | 93.7 | 4,822 | 1,931 |
| utu fastUnsafe | 93.5 | 3,673 | 1,373 |
| utu small | 93.1 | 3,148 | 1,869 |
| utu smallUnsafe | 93.2 | 1,999 | 1,311 |
| utu tuned fast | 77.2 | 6,330 | 2,726 |
| utu tuned small | 77.2 | 6,102 | 2,730 |
| C (emcc) | 114.3 | 16,357 | 7,540 |
| C++ (em++) | 84.6 | 17,200 | 7,886 |
| Rust | 88.9 | 51,075 | 21,283 |
| Go | 133.7 | 2,423,926 | 708,645 |
| Swift | 134.1 | 5,557,583 | 1,700,360 |
| Haskell | 252.5 | 1,957,808 | 522,115 |
| Dart | 128.3 | 39,962 | 16,185 |
| JavaScript | 132.5 | 2,378 | 1,114 |
| Kotlin | 118.8 | 10,416 | 5,430 |
| MoonBit | 102.6 | 2,463 | 1,510 |
| AssemblyScript | 163.1 | 4,439 | 1,783 |

(Exact numbers: `results.json` here; the table is one run.)

Frontier (ms vs gzip): JavaScript (1,114 B, 133 ms), utu smallUnsafe (1,311 B, 93 ms), utu tuned (2.7 KB, 77 ms, fastest of all). Idiomatic utu is smaller and faster than MoonBit (1,510 B, 103 ms) on the same source, and within 10% of C++/Rust's AVX-emulating SIMD.

## utu vs MoonBit, same source (Node #6)

`nbody.utu` mirrors `moonbit/nbody.mbt` line for line (data layout, loops, operation order; the f64 arithmetic in the inner loop is the same instruction sequence in both). utu 93 ms, MoonBit 103 ms. Differences in the Wasm of `advance` (utu `-O fast`, `wasm-dis`; MoonBit `--release`):

- Array representation: MoonBit's `Array[Body]` is a struct `{ backing: (array (ref null Body)), len: i32 }`. Every `bodies[i]` is `struct.get backing` + an explicit check `i < 0 || i >= struct.get len` → `unreachable` + `array.get` (which checks again) + `ref.as_non_null`. utu's `Array[Body]` is the GC array itself: a bare `array.get` (the engine's own bounds check is the only one), and `array.len` read once per `advance`. In MoonBit's `advance`: 3 explicit checks, 4 `struct.get len`, 3 `struct.get backing`, 3 `ref.as_non_null`; utu's: none, 1 `array.len`.
- Inlining: MoonBit calls `advance` from `bench`'s step loop (a call per step); utu inlines `advance` (and unrolls the position loop by 2) into `bench`.
- Field mutability: MoonBit's `mass` is an immutable field (`(field f64)`); utu has no immutable fields, so all seven are `(mut f64)`. No measurable cost here (utu is faster), but V8 can skip reloading immutable fields across stores.
- Safe vs unsafe utu: same Wasm for this program (no checks utu adds); only the loader differs (1,472 vs 323 B, argument checks).
- Size: utu small inlines less (1,676 B Wasm vs fast's 3,350) at the same speed.

## Caveats

- C/C++/Rust/AssemblyScript run AVX code through an emulation: 256-bit ops are two 128-bit ops, and `vrsqrtps` (one instruction on x86) is an f32 sqrt and divide. The algorithm was chosen for AVX; in Wasm a plain f64 sqrt may well be faster. C is slower than C++ only in how Emscripten/LLVM compiled its loops (C++ unrolls with templates).
- utu tuned is hand-unrolled and fuses its SIMD into 33 `@wat` calls a step, because utu does not inline `@wat` functions and V8 inlines only ~60 calls per function (scratchpad bug note `wat-not-inlined.utu`). One `@wat` per instruction ran 250 ms. It is more hand-tuned than the C, closer to g++ #0. Idiomatic utu (`nbody.utu`) is scalar Node #6: utu has no f64x2 arithmetic outside `@wat`.
- Output formatting is in the size: libc `snprintf` (C/C++/Swift), Rust `format!`, Go `fmt`, GHC `printf`; Kotlin/MoonBit/AssemblyScript/utu format `%.9f` by hand (round to nanos), which is exact for these values but not a general `%.9f`.
- Go, Swift, Haskell ship their runtimes (and `benchmarks/bg/wasi.js`, 1.6 KB); Dart and Kotlin their JS runtimes. JavaScript's size is its source only; the engine is assumed.
