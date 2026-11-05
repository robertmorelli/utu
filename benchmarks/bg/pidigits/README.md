# pidigits

`bench(n)`: the first n digits of pi by BG's spigot; returns FNV-1a (32-bit) of the bytes BG
prints (10 digits, `\t:<count>\n` per line, the last line padded with spaces). n = 2,000 (BG: 10,000).
Checked against BG's reference output: n = 27 → 1564184215 (every port); n = 2000 → 3349707335,
the same as a Python reference whose digits match an independent Machin computation.
Run: `node scripts/benchmark-bg.mjs pidigits`.

## Bignums

pidigits is bignum arithmetic; where each port's bignum comes from matters more than its compiler.

| port | bignum |
|---|---|
| c, cpp, swift | mini-gmp 6.3.0 (`c/mini-gmp.c`, GMP's single-file subset; C/C++ use 64-bit limbs via `-DMINI_GMP_LIMB_TYPE=long long`, Swift still uses 32-bit limbs). Full GMP is not built for Wasm. C++'s `gmpxx.h` is a minimal `mpz_class` over mini-gmp (`cpp/gmpxx.h`): no expression templates, moved temporaries |
| rust | num-bigint 0.4 (the BG program's rug wraps GMP through gmp-mpfr-sys, which does not build for wasm32-unknown-unknown) |
| go | math/big (BG's Go #4 calls GMP through cgo; no cgo on wasip1) |
| haskell | `Integer` (wasm GHC's ghc-bignum, native backend, not GMP) |
| dart | Dart's `BigInt` (dart2wasm compiles Dart's own implementation; no JS BigInt arithmetic) |
| js | JS `BigInt` (BG's Node #4 uses mpzjs, a native GMP addon) |
| kotlin | com.ionspin.kotlin:bignum 0.3.10 (pure Kotlin, immutable; Kotlin/Wasm has no BigInteger) |
| moonbit | MoonBit core `BigInt` |
| assemblyscript | its own (no library): the same design as utu's |
| **utu** | **its own, in the file**: the six mpz calls gcc #2 makes (mul_si, add, mul, tdiv_q, cmp, get_si), signed magnitude, 32-bit limbs in `Array[U32]`, 64-bit intermediates; tdiv_q is Knuth's algorithm D. A port with a hand-written bignum, against ports that use a library |
| utu host | JS `BigInt` through `@es` (`pidigits.host.utu`): one host call per mpz call |

## Ports

| port | source | adapted |
|---|---|---|
| c | BG gcc #2 (Mr Ledrug's algorithm: two divisions per step) | GMP → mini-gmp with 64-bit limbs; `putchar`/`printf` → FNV (`snprintf` for the counts). Limb change: 255 → 135 ms in two rounds |
| cpp | BG g++ #4 (LFT class, gmpxx) | gmpxx → `cpp/gmpxx.h` over mini-gmp (`cpp/mini-gmp.cc` includes `../c/mini-gmp.c`), 64-bit limbs; `cout` → FNV. Limb change: 222 → 115 ms in two rounds |
| rust | BG Rust #4 | rug → num-bigint; `assign(expr)` → `= expr`; `writeln!` → `format!` + FNV |
| go | BG Go #4 | cgo GMP → math/big, each mpz call as the big.Int calls that compute it (mul_ui: `Mul` by a big.Int holding the word); Go #4 prints nothing for a partial last line, this pads it like the others |
| swift | BG Swift #2 | `import gmp` → mini-gmp as a C target of the package (`Sources/gmp` includes `../c/mini-gmp.c`), `__gmpz_*` → `mpz_*`; `print` → FNV |
| haskell | BG GHC #6 | `putStr` → the same text into a String, folded strictly. `-fno-full-laziness`: GHC otherwise floats the digit stream (it does not depend on n) to a CAF and later calls reuse it (0.5 ms). GHC #6 pads a partial last line one space short (k, not k+1); fixed so n = 27 matches BG's reference |
| dart | BG Dart #2 (dart exe) | `dart compile wasm -O2`; `print` → FNV |
| js | BG Node #4 | mpzjs → BigInt expressions; `console.log` → FNV |
| kotlin | not on BG: from BG Java GraalVM #5 (gcc #2's algorithm through GMP FFI) | ionspin bignum; each mpz call an expression |
| moonbit | not on BG: from BG gcc #2 | core `BigInt`; each mpz call an expression |
| assemblyscript | not on BG: from BG gcc #2 | own bignum (as utu's), `StaticArray<u32>` with `unchecked` in loops |
| utu | gcc #2's algorithm and calls | own bignum (above); idiomatic utu, no `@wat`/`@ir` |
| utu host | gcc #2's algorithm | `pidigits.host.utu`: BigInt through `@es`, reported apart |

No SIMD anywhere. Algorithms: gcc #2 (c, kotlin, moonbit, assemblyscript, utu, utu host) divides
twice every step; the others (Go #4, Swift #2, Rust #4, g++ #4, Node #4, Dart #2, GHC #6) divide only
once the numerator passes the accumulator, so fewer divisions.

## Results

d8 15.6.75.16 (Apple M-series), median of 10 after 3 warmups; n = 2,000. Size = Wasm + JS needed to run it, minified; gzip -9 per file, summed.

| port | ms | raw bytes | gzip bytes |
|---|---:|---:|---:|
| utu fast | 139.0 | 14,825 | 3,116 |
| utu fastUnsafe | 139.2 | 13,676 | 2,557 |
| utu small | 139.2 | 4,556 | 2,252 |
| utu smallUnsafe | 139.5 | 3,407 | 1,693 |
| utu host fast (JS BigInt) | 302.1 | 2,270 | 1,265 |
| utu host small (JS BigInt) | 305.8 | 2,165 | 1,242 |
| C (emcc, mini-gmp) | 257.6 | 31,996 | 15,157 |
| C++ (em++, mini-gmp) | 225.8 | 32,405 | 15,319 |
| Rust (num-bigint) | 273.5 | 83,261 | 29,507 |
| Go (math/big) | 147.2 | 2,351,205 | 683,020 |
| Swift (mini-gmp) | 225.8 | 5,567,527 | 1,705,608 |
| Haskell (Integer) | 216.0 | 1,509,074 | 437,145 |
| Dart (BigInt) | 187.0 | 56,308 | 22,761 |
| JavaScript (BigInt) | 180.7 | 517 | 377 |
| Kotlin (ionspin bignum) | 1380.3 | 96,935 | 42,172 |
| MoonBit (BigInt) | 272.9 | 8,074 | 4,060 |
| AssemblyScript (own bignum) | 142.6 | 9,576 | 4,149 |

(Exact numbers: `results.json` here; the table is one run.)

Frontier (ms vs gzip): JavaScript (377 B, 181 ms), utu smallUnsafe (1.7 KB, 140 ms). utu is the fastest port;
AssemblyScript, with the same bignum design, is 3% slower; Go's math/big (64-bit words) is next.

## Caveats

- utu and AssemblyScript win with a hand-written bignum of six operations; the library ports carry general
  code (mini-gmp's division also computes the remainder and allocates its temporaries; num-bigint, ionspin
  and MoonBit's BigInt allocate a new number per operation). utu's speed here says its bignum is lean, not
  that utu compiles mini-gmp-like code better than clang.
- mini-gmp is not GMP: BG's C/C++/Swift/Rust/Node times come from GMP's assembly and algorithms, none of
  which reach Wasm. Every native port here uses 32-bit limbs except Go (64-bit `big.Word`).
- The gcc #2 algorithm divides twice per step; the others fewer. JS BigInt running gcc #2's loop takes
  ~300 ms in d8 (measured), the same as utu host; so utu host's 302 ms vs JS's 181 ms is the algorithm, not
  the `@es` calls.
- Kotlin's 1.4 s is the ionspin library (63-bit limbs as `ULong`, immutable), not Kotlin/Wasm codegen.
- Go, Swift, Haskell ship their runtimes (and `benchmarks/bg/wasi.js`); C/C++ import WASI only for
  mini-gmp's abort message. JavaScript's size is its source only; the engine and its BigInt are assumed.
- Haskell needs `-fno-full-laziness` (in the file) or bench is memoized after the first call.
