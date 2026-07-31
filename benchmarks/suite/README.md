# Rust/utu/JavaScript benchmark suite

Four deliberately different kernels are implemented independently in utu,
Rust, and JavaScript. Each Rust kernel also has a `*-safe.rs` version compiled
with `#![forbid(unsafe_code)]`:

- `scalar`: a loop-carried integer recurrence, testing direct scalar emission.
- `strings`: repeated insertion into the midpoint of a growing ASCII string.
  utu operates on JS strings/ropes via JS String Builtins; Rust receives UTF-8
  bytes through linear memory and the harness pays `TextEncoder` and
  `TextDecoder` costs on every sample.
- `analyzer`: a 7 KiB application-shaped source analyzer computing fourteen
  lexical/statistical metrics over a 256 KiB source-like document. It exercises
  helper functions, a report struct, WasmGC arrays, branching, hashing, parsing,
  and fine-grained host-string access; all emitted code is reachable.
- `sieve`: an allocation and random-write-heavy prime sieve expected to favor
  Rust's optimized linear-memory loops over scalar WasmGC-array operations.

JavaScript execution is warmed like all three Wasm implementations. Its payload is
measured after standalone ES-module minification; parsing, compilation, and Wasm
instantiation are intentionally outside the kernel timing.

Run the consolidated set, including DeltaBlue, with `bun run bench:suite`.
Use `bun run bench:kernels` for only the kernels in this directory. See
[RESULTS.md](RESULTS.md) for one recorded
snapshot, [STRING_WASM_INSPECTION.md](STRING_WASM_INSPECTION.md) for the
midpoint module breakdown, and [ANALYZER_INSPECTION.md](ANALYZER_INSPECTION.md)
for the larger-program analysis. The restored application-sized constraint
solver is included in the consolidated run and documented in
[../deltablue/README.md](../deltablue/README.md).
Results are smoke measurements from one Wasm engine, not broad language rankings. Inputs, outputs, warmup counts, toolchain,
and generated sizes are printed by the runner. Safe Rust exports are added to
the finished Wasm by the runner, avoiding `no_mangle`/`export_name` attributes
(which Rust classifies as unsafe) as well as unsafe operations in the source.
