# binary-trees: MoonBit (WasmGC)

`binarytrees.mbt` is `../binarytrees.js` / `../rust/src/lib.rs` in idiomatic
MoonBit: a `Node` GC struct whose children are `Node?` (`None` at the
leaves), `check` matching on both children as the Rust port does, and the
same stretch, long-lived, and short-lived trees in the same order. `bench(1)`
returns `3222190`.

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
# -> OUT/wasm-gc/release/build/binarytrees.wasm
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
`bench(iterations)` at once (no `PORT_READY`). The exports return `i64`,
which JS sees as a BigInt.
