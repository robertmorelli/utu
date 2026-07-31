# Bun-only cross-language benchmark snapshot

Environment: Bun 1.3.14, arm64 macOS. Kernel results use 5 warmups and 20 rotated samples; DeltaBlue uses 3 warmups and 10 samples. All Wasm and JavaScript execution in this report uses Bun so language and engine effects are not mixed.
Both Rust variants were compiled with stable rustc, `-O3`, fat LTO, one
codegen unit, `simd128`, and `bulk-memory`. The safe variant sources use
`#![forbid(unsafe_code)]`; the runner adds their Wasm exports after rustc so no
unsafe export attributes are needed. utu production emission used Binaryen's
max-opt/max-shrink stage followed by a dedicated `-Oz` stage, conditional
string lowering, and the safe post-lowering module sweep. JavaScript payload
size is the standalone ES module after esbuild minification. Execution timings
are warmed and exclude parsing, compilation, and instantiation for all three
languages.

## Runtime

| benchmark | utu | Rust | safe Rust | JavaScript |
|---|---:|---:|---:|---:|
| scalar recurrence | **1.560 ms** | 1.799 ms | 1.790 ms | 1.801 ms |
| midpoint insert: 8 B x 8,192 | 33.738 ms | **5.790 ms** | 265.149 ms | 33.995 ms |
| midpoint insert: 32 B x 2,048 | 8.704 ms | **1.361 ms** | 66.011 ms | 8.453 ms |
| midpoint insert: 1,024 B x 64 | 0.556 ms | **0.071 ms** | 2.094 ms | 0.554 ms |
| source analyzer, 256 KiB | 20.141 ms | **3.075 ms** | 3.118 ms | 4.889 ms |
| prime sieve, 100,000 flags | 0.267 ms | **0.080 ms** | 0.091 ms | 0.161 ms |
| DeltaBlue chain, 20 × 1,048 nodes | 94.366 ms | **49.856 ms** | 183.514 ms | 77.216 ms |
| DeltaBlue projection, 20 × 1,048 nodes | 173.008 ms | **93.488 ms** | 302.062 ms | 132.481 ms |

utu and JavaScript vary by more than their tiny midpoint-insertion differences
across runs. Their three insertion results track one another closely.

## Payload size

| benchmark | utu Wasm | Rust Wasm | safe Rust Wasm | minified JavaScript |
|---|---:|---:|---:|---:|
| scalar recurrence | **90 B** | 348 B | 621 B | 103 B |
| midpoint insertion | 192 B | 360 B | 1,644 B | **122 B** |
| source analyzer | **1,614 B** | 4,065 B | 4,515 B | 2,553 B |
| prime sieve | **201 B** | 647 B | 955 B | **201 B** |
| DeltaBlue (both workloads) | **5,107 B** | 34,527 B | 47,601 B | 6,868 B |

Gzipped sizes were 107 B / 233 B / 458 B / 117 B for scalar,
160 B / 279 B / 999 B / 120 B for midpoint insertion,
**835 B / 1,736 B / 2,133 B / 901 B for the analyzer**, and
152 B / 471 B / 718 B / 166 B for sieve respectively. The shared DeltaBlue
module sizes are 1,999 B gzip for utu, 14,470 B for unsafe Rust, 18,037 B for
safe Rust, and 2,072 B for minified JavaScript.

The analyzer is the first case large enough to amortize Wasm framing and import
names clearly. utu is 37% smaller raw and 7% smaller compressed than minified
JavaScript, while being 60% smaller raw and 52% smaller compressed than Rust.
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
variant 29–49× slower than it.

utu receives host strings directly and implements insertion with `length`, two
`substring` calls, and two `concat` calls through JS String Builtins. JavaScript
uses the equivalent expression directly.

utu and JavaScript have essentially equal insertion behavior. Rust wins because
its preallocated buffer performs explicit overlapping memory moves rather than
constructing immutable host strings. The 192-byte utu module is detailed in
[STRING_WASM_INSPECTION.md](STRING_WASM_INSPECTION.md).

## Larger analyzer methodology

The 7 KiB utu program computes fourteen lexical and statistical metrics over a
256 KiB source-like document. It uses helper functions, a nominal report struct,
a WasmGC histogram array, parsing, branches, and hashing; every emitted function
is reachable. Rust's timed path includes UTF-8 encoding and copying. The ASCII
fixture gives all implementations identical code-unit values.

The safe analyzer copies its `AtomicU8` input into an owned byte array before
running the same slice-based analysis; this adds about 7% to its recorded Rust
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
constraint graph. With 20 solver iterations per sample, utu measured 94.366 ms
for chain propagation and 173.008 ms for projection; safe `Rc<RefCell<_>>` Rust
measured 183.514 ms and 302.062 ms, unsafe arena Rust measured 49.856 ms and
93.488 ms, and JavaScript measured 77.216 ms and 132.481 ms respectively. All
four returned zero failures. Each uses fixed-capacity lists and explicit O(n)
front/removal shifts; replacing those loops with JavaScript's native
`Array.shift`/`splice` was measured separately and rejected as non-analogous.
See [../deltablue/README.md](../deltablue/README.md) for its methodology,
historical comparison, and payload sizes.

These are directional benchmarks, not whole-language rankings. Run the full
set with `bun run bench:suite`; `bench:kernels` and `bench:deltablue` run its
two parts independently. The separate [WasmGC engine report](../engines/RESULTS.md)
runs byte-identical utu Wasm across Bun, Node, Deno, d8, SpiderMonkey,
JavaScriptCore, and Wasmtime.
