# DeltaBlue: MoonBit (WasmGC)

`deltablue.mbt` is DeltaBlue ported one-to-one from `../deltablue.js` and
`../rust/src/lib.rs` (same fields, methods, loops, in-place removal, stack
worklists, planner and tests) in idiomatic MoonBit. MoonBit has no
subclassing, so, like the Rust and utu ports, a `Constraint` is a struct of
its strength and one `Kind` enum (`Unary` with a Stay/Edit role, or `Binary`
with an Equality/Scale op), each variant carrying a struct of `mut` fields.
Variables are GC structs with an `Array[Constraint]`; absent values are `T?`;
constraint equality is identity (`physical_equal`); worklists are `Array`
stacks (`push` / `pop`); `remove_constraint` is `Array::retain`, which is the
same in-place compaction loop as the JS. `Strength` is a fieldless enum with
derived `Compare`. The original's errors are `abort`.

## Toolchain

MoonBit `moon 0.1.20261016` / `moonc v0.10.16+b1a0e846e` (2026-10-16), the
official toolchain installed into `~/.moon` with

```sh
curl -fsSL https://cli.moonbitlang.com/install/unix.sh | SHELL=/bin/sh bash
```

(`SHELL=/bin/sh` keeps the installer from appending a `PATH` line to
`~/.zshrc`; add `~/.moon/bin` to `PATH` yourself.) No packages are needed.
`moon.mod` and `moon.pkg` are the minimal manifests: this moon release no
longer reads `moon.mod.json` / `moon.pkg.json`, and `moon.pkg`'s
`link: { "wasm-gc": { "exports": [...] } }` exports the bench functions.

## Build

```sh
moon build --target wasm-gc --release --target-dir OUT
# -> OUT/wasm-gc/release/build/deltablue.wasm
```

`--release` is moonc's optimizing mode (the debug default adds `-g -O0`);
there is no flag in it, or used here, that drops checks: array accesses keep
WasmGC's bounds checks, and `Array` indexing keeps its own length check. The output
is a single self-contained `.wasm` with **no imports** and no JS runtime
file; it is all that ships.

## Running in d8

```sh
d8 -e "globalThis.PORT_DIR='OUT/wasm-gc/release/build'" d8-prelude.js your-driver.js
```

The prelude reads the `.wasm` with `read(..., 'binary')`, compiles and
instantiates it synchronously with an empty import object, and defines
`chain(iterations)` and `projection(iterations)` (over the exports
`bench_chain` / `bench_projection`, which return the summed failure count, 0)
at once (no `PORT_READY`). The exports return `i64`, which JS sees as a
BigInt.
