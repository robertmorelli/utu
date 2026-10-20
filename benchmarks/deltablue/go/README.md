# DeltaBlue in Go

An idiomatic Go port of `../deltablue.js` (and `../rust/src/lib.rs`): pointers
to structs, a `Constraint` interface implemented by `*UnaryConstraint` (Stay and
Edit), `*EqualityConstraint`, and `*ScaleConstraint` (the last two embed a
shared `BinaryConstraint`), slices for every list, `nil` for absent, slice
stacks for worklists, and in-place removal from a variable's constraint slice.

This is **linear-memory Wasm with Go's own garbage collector and runtime**
compiled into the module, not WasmGC: the Go toolchain does not target WasmGC.

## Toolchain

Official Go, go1.27.2 (`/opt/homebrew/bin/go`), `GOOS=wasip1 GOARCH=wasm`.
`-buildmode=c-shared` makes a WASI *reactor*: `main` never runs; the host calls
`_initialize` once, then the `//go:wasmexport` functions `bench_chain(i32) -> i64`
and `bench_projection(i32) -> i64`.

## Build

Go has no optimization levels; the compiler always optimizes. `-s -w` strips the
symbol table and DWARF, and `-trimpath` drops local paths:

```sh
GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -trimpath -ldflags="-s -w" -o out/deltablue.wasm .
```

What ships is `deltablue.wasm` plus the WASI shim in `d8-prelude.js`.

## Running in d8

`d8-prelude.js` reads `${PORT_DIR}/deltablue.wasm`, supplies the ten
`wasi_snapshot_preview1` functions Go's runtime imports (clock, random, stdout
and stderr, zero args and environment, `poll_oneoff`, `proc_exit`), calls
`_initialize`, and defines `chain(iterations)` and `projection(iterations)`,
which return the failure count (the `i64` result converted from BigInt):

```js
globalThis.PORT_DIR = 'out';
load('d8-prelude.js');
chain(20);      // 0
projection(20); // 0
```
