# DeltaBlue benchmark

DeltaBlue, the incremental constraint solver of V8's `deltablue.js` and Dart's
`DeltaBlue`, in four ports that each compute the canonical algorithm in their
own language's idiom: WasmGC utu (`Buffer`s, nullable references, one enum of
constraint kinds), safe Rust (an `Rc<RefCell<_>>` graph, `Vec`, `Option`),
unsafe Rust (typed arenas and raw pointers), and JavaScript (classes and
arrays). Worklists are stacks, as the original's are. All four run the same
1,048-node chain and projection workloads and return a failure count, which
the runner requires to match.

It is included in the consolidated repository benchmark run:

```sh
bun run bench:suite
```

Use `bun run bench:deltablue` to run only this benchmark.

`BENCH_ITERATIONS`, `BENCH_SAMPLES`, and `BENCH_WARMUPS` control the run.
Kernel timings exclude compilation and instantiation.

`dart/`, `kotlin/`, `moonbit/`, `assemblyscript/`, `go/`, `swift/`, and
`haskell/` hold the same program in Dart, Kotlin, and MoonBit (WasmGC), and
AssemblyScript, Go, Swift, and Haskell (linear memory, each carrying its own
collector or runtime).
Each has a README with its build, and those that need one a d8 prelude that
instantiates it and defines `chain(n)` and `projection(n)`.

`bun run bench:programs-d8` (or `bun run bench:deltablue-table` for DeltaBlue
alone) times every port in d8, with build times and sizes; the benchmarks
page of the docs site shows the results.

## Current snapshot

`bun run bench:deltablue` builds the four ports and times each in a d8
process of its own (V8's shell; `D8_BIN` chooses which), with 5 warmups and
the median of 20 samples, each containing 20 solver iterations. utu is built
as `utu build -O fastUnsafe` builds it. d8 15.6 on arm64 macOS; all returned zero
failures.

| workload | utu Wasm | safe Rust Wasm | unsafe Rust Wasm | JavaScript |
|---|---:|---:|---:|---:|
| chain | 6.029 ms | 16.860 ms | **4.871 ms** | 6.344 ms |
| projection | 5.009 ms | 17.490 ms | **4.124 ms** | 5.538 ms |

| implementation | payload | gzip |
|---|---:|---:|
| utu Wasm | 39.48 KiB | 13.40 KiB |
| utu Wasm, `-O fast` | 43.98 KiB | 13.92 KiB |
| utu Wasm, `-O small` | 4.72 KiB | 2.09 KiB |
| utu Wasm, `-O smallUnsafe` | 4.64 KiB | 2.08 KiB |
| safe Rust Wasm | 38.04 KiB | 15.17 KiB |
| unsafe Rust Wasm | 32.05 KiB | 13.11 KiB |
| minified JavaScript | 5.83 KiB | 1.83 KiB |

The ports do the same work step for step: in-place removal, a stack for
every worklist, one `output()` per step, `determined_by` read once per scan,
the same test setup. What differs is only what each language is: GC
references, `Rc<RefCell<_>>`, arena pointers, or JS objects, and their
collections.

## Before the idiomatic rewrite

Until 2026-10-20 every port emulated the same fixed-capacity list model: each
propagation step allocated a list sized to the whole planner and removed from
its front by shifting every element, which made the solver quadratic (about
18 GB of allocation per utu run). The figures below measured that model and
are kept only as history; they are 3–8× slower than the same engines on the
current ports.

### Last pre-rewrite snapshot

The old harness measured whole commands with 20 solver iterations per command.
Its last report (2026-03-28) recorded:

| workload | utu Wasm | safe Rust Wasm | unsafe Rust Wasm |
|---|---:|---:|---:|
| chain | 132.532 ms | 228.671 ms | 80.728 ms |
| projection | 192.926 ms | 320.965 ms | 121.759 ms |

Those values include process startup and therefore are only useful as a broad
regression reference, not a direct comparison with this in-process runner.

### Fixed-capacity snapshot

Bun 1.3.14 on arm64 macOS; 3 warmups and 10 samples, each containing 20
solver iterations. All implementations returned zero failures.

| workload | utu Wasm | safe Rust Wasm | unsafe Rust Wasm | JavaScript |
|---|---:|---:|---:|---:|
| chain | 94.366 ms | 183.514 ms | **49.856 ms** | 77.216 ms |
| projection | 173.008 ms | 302.062 ms | **93.488 ms** | 132.481 ms |

| implementation | payload | gzip |
|---|---:|---:|
| utu Wasm | 5,107 B | 2,021 B |
| safe Rust Wasm | 47,601 B | 18,159 B |
| unsafe Rust Wasm | 34,527 B | 14,561 B |
| minified JavaScript | 6,868 B | 2,084 B |

Unlike the historical hyperfine report, these timings exclude process startup,
compilation, and instantiation. JavaScript payload size is the standalone ES
module after esbuild minification.

#### Bun 1.3.14 follow-up

A controlled comparison ran Bun 1.3.11 and 1.3.14 against byte-identical utu
Wasm (`cffd55b0…`) and the same Rust/JavaScript sources. With 5 warmups and 20
samples it measured:

| workload and engine | utu Wasm | safe Rust Wasm | unsafe Rust Wasm | JavaScript |
|---|---:|---:|---:|---:|
| chain, Bun 1.3.11 | 86.161 ms | 184.718 ms | **50.353 ms** | 63.885 ms |
| chain, Bun 1.3.14 | 98.329 ms | 184.737 ms | **50.312 ms** | 65.697 ms |
| projection, Bun 1.3.11 | 142.901 ms | 292.318 ms | **89.998 ms** | 103.318 ms |
| projection, Bun 1.3.14 | 162.942 ms | 289.571 ms | **89.819 ms** | 114.434 ms |

A reverse-order repeat confirmed the direction of the change. Ordinary Wasm
Rust was effectively unchanged, while Bun 1.3.14 regressed both WasmGC utu and
JavaScript on this workload. The current consolidated table now records a
fresh, internally consistent Bun 1.3.14 run.
