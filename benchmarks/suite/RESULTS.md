# Cross-language benchmark snapshot

Environment: d8 (V8 15.6.75.16), arm64 macOS, one d8 process per implementation and case. Every row uses 5 warmups and the median of 20 samples. All Wasm and JavaScript execution in this report uses d8 so language and engine effects are not mixed.
Both Rust variants were compiled with stable rustc, `-O3`, fat LTO, one
codegen unit, `simd128`, and `bulk-memory`. The safe variant sources use
`#![forbid(unsafe_code)]`; the runner adds their Wasm exports after rustc so no
unsafe export attributes are needed. utu is the self-hosted compiler's default
`-O small` build (`-O fastUnsafe` for DeltaBlue). JavaScript payload
size is the standalone ES module after esbuild minification. Execution timings
are warmed and exclude parsing, compilation, and instantiation for all three
languages.

## Runtime

| benchmark | utu | Rust | safe Rust | JavaScript |
|---|---:|---:|---:|---:|
| scalar recurrence | **1.554 ms** | 1.788 ms | 1.787 ms | 6.849 ms |
| midpoint insert: 8 B x 8,192 | 31.246 ms | **6.376 ms** | 212.894 ms | 30.477 ms |
| midpoint insert: 32 B x 2,048 | 7.783 ms | **1.897 ms** | 53.496 ms | 7.708 ms |
| midpoint insert: 1,024 B x 64 | **0.223 ms** | 0.619 ms | 2.274 ms | 0.237 ms |
| source analyzer, 256 KiB | 8.334 ms | **3.156 ms** | 3.221 ms | 6.892 ms |
| prime sieve, 100,000 flags | 0.164 ms | **0.091 ms** | 0.100 ms | 0.205 ms |
| DeltaBlue chain, 20 × 1,048 nodes | 5.924 ms | **4.870 ms** | 16.711 ms | 6.140 ms |
| DeltaBlue projection, 20 × 1,048 nodes | 4.712 ms | **4.130 ms** | 17.546 ms | 5.447 ms |

utu and JavaScript vary by more than their tiny midpoint-insertion differences
across runs. Their three insertion results track one another closely.

## Payload size

| benchmark | utu Wasm | Rust Wasm | safe Rust Wasm | minified JavaScript |
|---|---:|---:|---:|---:|
| scalar recurrence | **102 B** | 348 B | 379 B | 103 B |
| midpoint insertion | 210 B | 360 B | 1,508 B | **122 B** |
| source analyzer | **2,333 B** | 4,065 B | 4,298 B | 2,553 B |
| prime sieve | 233 B | 693 B | 775 B | **201 B** |
| DeltaBlue (both workloads) | 10,274 B | 32,817 B | 38,951 B | **5,974 B** |

Gzipped sizes were 109 B / 233 B / 257 B / 117 B for scalar,
174 B / 279 B / 849 B / 120 B for midpoint insertion,
**931 B / 1,747 B / 1,926 B / 909 B for the analyzer**, and
168 B / 516 B / 563 B / 166 B for sieve respectively. The shared DeltaBlue
module sizes are 2,908 B gzip for utu (1,966 B at `-O smallUnsafe`, 4,353 B
raw), 13,424 B for unsafe Rust, 15,529 B for safe Rust, and 1,879 B for
minified JavaScript.

The analyzer is the first case large enough to amortize Wasm framing and import
names clearly. utu is 9% smaller raw and 2% larger compressed than minified
JavaScript, while being 43% smaller raw and 47% smaller compressed than Rust.
See [ANALYZER_INSPECTION.md](ANALYZER_INSPECTION.md) for its operation and
section breakdown.

## Midpoint insertion methodology

Every case begins with a 64 KiB ASCII string. Each iteration inserts its chunk
at the current midpoint, ending with a 128 KiB string. The harness forces access
to the result and validates that utu, both Rust variants, and JavaScript agree.

Both Rust variants receive the strings through linear memory on every timed
sample. Their time includes two `TextEncoder` calls, input copies, overlapping
midpoint moves, constructing the result pointer/length, `TextDecoder`, and
forced result access. Safe Rust represents host-mutated input and output bytes
as `AtomicU8`. It copies input into exclusively owned arrays where possible. The output must
remain live after `run` returns, so the fully safe insertion version performs
its overlapping move through atomic cells rather than exposing a mutable
static as a slice. That restriction is substantial here: it prevents the
single bulk `memory.copy` used by ordinary Rust and makes this safe boundary
variant 3–34× slower than it.

utu receives host strings directly and implements insertion with `length`, two
`substring` calls, and two `concat` calls through JS String Builtins. JavaScript
uses the equivalent expression directly.

utu and JavaScript have essentially equal insertion behavior. Rust wins the
small chunks because its preallocated buffer performs explicit overlapping
memory moves rather than constructing immutable host strings; with 1,024-byte
chunks its UTF-8 encode and decode in plain JS cost more than the move saves.
The 210-byte utu module is detailed in
[STRING_WASM_INSPECTION.md](STRING_WASM_INSPECTION.md).

## Larger analyzer methodology

The 7 KiB utu program computes fourteen lexical and statistical metrics over a
256 KiB source-like document. It uses helper functions, a nominal report struct,
a WasmGC histogram array, parsing, branches, and hashing; every emitted function
is reachable. Rust's timed path includes UTF-8 encoding and copying. The ASCII
fixture gives all implementations identical code-unit values.

The safe analyzer copies its `AtomicU8` input into an owned byte array before
running the same slice-based analysis; this adds under 1% to its recorded Rust
time. The safe sieve similarly uses an invocation-local array instead of a
mutable static. The safe binaries are larger partly because `#[used]` function
references retain callable functions until the runner can add exports without
unsafe attributes.

The analyzer reveals the cost of millions of fine-grained host calls: utu's
Idiomatic `text[i]` lowers to a JS String Builtin call for each code unit, while JavaScript
can optimize `charCodeAt` inside its own loop and Rust reads linear bytes. This
is a representation/boundary result, not loop-control overhead. Caching string
lengths outside each utu loop is included in the recorded result.

## DeltaBlue constraint solver

The DeltaBlue rows in the consolidated tables exercise a 1,048-node mutable
constraint graph. With 20 solver iterations per sample, utu measured 5.924 ms
for chain propagation and 4.712 ms for projection; safe `Rc<RefCell<_>>` Rust
measured 16.711 ms and 17.546 ms, unsafe arena Rust measured 4.870 ms and
4.130 ms, and JavaScript measured 6.140 ms and 5.447 ms respectively. All
four returned zero failures. The ports are the canonical algorithm in each
language's idiom; see [../deltablue/README.md](../deltablue/README.md) for
methodology and the earlier fixed-capacity figures.

These are directional benchmarks, not whole-language rankings. Run the full
set with `bun run bench:suite`; `bench:kernels` and `bench:deltablue` run its
two parts independently. The separate [WasmGC engine report](../engines/RESULTS.md)
runs byte-identical utu Wasm across Bun, Node, Deno, d8, SpiderMonkey,
JavaScriptCore, and Wasmtime.
