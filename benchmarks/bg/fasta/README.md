# fasta

`bench(n)`: BG fasta for n (a repeated ALU sequence of 2n bases, then 3n and 5n bases drawn by the
LCG `seed = (seed·3877 + 29573) % 139968` from two weighted alphabets, 60 to a line); returns
FNV-1a (32-bit) of the exact bytes BG prints (10.2 n bytes, hashed as written). n = 2,500,000
(BG: 25,000,000). Checked: n = 1000 gives 1656148202 = FNV of BG's `fasta-output.txt`; n = 2.5M
matches BG gcc #3 built natively. Run: `node scripts/benchmark-bg.mjs fasta`.

Each port's generator sits between `---- fasta generator` markers with its output sink outside
them, so knucleotide/regexredux/revcomp copy the block and make the sink append (see
`../revcomp/` for every language). All BG lookup variants (C's f32 table, Rust/C++ f32 cumprob,
Go/JS/Dart f64, Swift i32, Haskell f32, Java f32) agree on all 139,968 seeds (checked exhaustively).

## Ports

| port | source | adapted |
|---|---|---|
| c | BG gcc #3 (Diedrich): IM-entry lookup table, fixed-newline buffer | `write` → `out` (FNV); `main` → `fasta`/`bench` |
| cpp | BG g++ #9 (Jambrek, after Rust #7): SSE2 cumprob count | sequential (no spinlocks/threads); boost strided range → plain loop; buffers static (500 KB > Emscripten's 64 KB stack); SSE2 via Emscripten (`-msse2`) |
| rust | BG Rust #7 (Machida et al.) | sequential (no spin/threads); SSE2 `gen_from_u32` written on `core::arch::wasm32` (`i32x4_lt`/`sub`); `+simd128` |
| go | BG Go #2 | goroutines/channels → direct calls on the same SLOT buffers; `bufio.Writer` over an FNV sink |
| swift | BG Swift #3 | Dispatch removed (blocks in order); `print(String(cString:))` → bytes; alu block built as `[UInt8]`; no Foundation; `nonisolated(unsafe)` globals (Swift 6) |
| haskell | BG GHC #6 | massiv (not in GHC's wasm package set) → the `Ptr` buffers it wraps; 4 MVar workers → one loop over one buffer pair (same prng/select/lookup) |
| dart | BG Dart #5 | isolates removed: sequences built in order (`forwardLcgSeed` not needed); `dart compile wasm -O2` |
| js | BG Node #5 | worker_threads removed: main thread runs `generateDna` per chunk; Buffer → Uint8Array |
| kotlin | not on BG: from Java GraalVM #6 | worker queues → one FIFO (put = fill randoms + select, take = dequeue): same buffers, same order; needs n ≥ 184,320 |
| moonbit | not on BG: from gcc #3 (simplest fast source) | table built in `Float` as C |
| assemblyscript | not on BG: from gcc #3 | `heap.alloc`, `load/store<u8>` |
| utu | gcc #3's algorithm | idiomatic: `mem` U8 table and buffers, byte loops |

SIMD: cpp, rust (4-lane compare per symbol); the rest scalar. No `fasta.tuned.utu`: the table
algorithm has nothing for SIMD in utu to do (it would need 16 table loads per vector).

## Results


| port | ms | raw bytes | gzip bytes |
|---|---:|---:|---:|
| utu fast | 113.4 | 6,396 | 2,227 |
| utu fastUnsafe | 113.5 | 4,616 | 1,581 |
| utu small | 153.3 | 3,574 | 1,932 |
| utu smallUnsafe | 113.3 | 2,302 | 1,322 |
| C | 106.2 | 10,829 | 4,964 |
| C++ | 126.0 | 13,478 | 6,156 |
| Rust | 127.5 | 15,849 | 7,315 |
| Go | 447.7 | 1,910,032 | 568,296 |
| Swift | 281.3 | 5,558,243 | 1,700,492 |
| Haskell | 593.4 | 1,622,428 | 461,230 |
| Dart | 476.1 | 44,839 | 18,426 |
| JavaScript | 442.0 | 2,557 | 1,160 |
| Kotlin | 460.6 | 14,998 | 7,494 |
| MoonBit | 112.9 | 6,438 | 3,212 |
| AssemblyScript | 106.8 | 6,932 | 3,392 |

Size = Wasm + JS needed, minified; gzip -9 per file, summed. (`results.json` has exact numbers.)

Frontier (ms vs gzip): JavaScript (1.2 KB, 442 ms), utu smallUnsafe (1.3 KB, 113 ms),
AssemblyScript (3.4 KB, 107 ms), C (5.0 KB, 106 ms). utu is within 7% of the fastest at about a
quarter of C's gzip size; MoonBit (113 ms, 3.2 KB) ties it on time.

## Caveats

- The FNV loop over every output byte (~25 MB) is a large, equal share of every port's time.
- BG's fastest programs are parallel; all ports here are single-threaded, so the ranking is of
  per-core work. Go/JS/Dart/Kotlin were designed around threads (float buffers handed to workers,
  linear search per symbol) and lose more than C's table program, which was sequential already.
- utu small (safe) is 35% slower than the other three utu builds: its out-of-line bounds checks.
- Go, Swift, Haskell ship runtimes (and `../wasi.js`); Dart and Kotlin their JS runtimes;
  JavaScript's size is its source only.
