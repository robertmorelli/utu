# DeltaBlue in Haskell (GHC's WebAssembly backend)

`DeltaBlue.hs` is `../deltablue.js` / `../rust/src/lib.rs` in Haskell. The
constraint graph lives in `IO`: each `Variable` is a record of `IORef`s
(value, determinedBy, mark, walkStrength, stay) plus its constraint list, and
each `Constraint` is a strength and one ADT of the four kinds (`Unary` with a
`Stay`/`Edit` role, `Binary` with `Equality` or `Scale scale offset`), the same
shape as the Rust port's enum, with its mutable `satisfied` / `direction` in an
`IORef`. Equality is identity (of that `IORef`). Every list the other ports
grow, shrink, or use as a worklist is a small growable vector over a
bounds-checked `IOArray` (push, pop from the end, in-place `retain`), so
constraint lists keep their order and worklists are stacks, as in the
original. Thrown errors are `error`.

This is **linear-memory Wasm (`wasm32-wasi`) with GHC's own RTS and
garbage collector** compiled into the module, not WasmGC: GHC's WebAssembly
backend does not target WasmGC.

## Toolchain

GHC 9.14.1.20260731 (`wasm32-wasi-ghc`, the `gmp` flavour) from
[ghc-wasm-meta](https://gitlab.haskell.org/haskell-wasm/ghc-wasm-meta), with
its wasi-sdk (clang 21.1.8), installed into `~/.ghc-wasm` by the official
non-Nix bootstrap, which does not touch shell profiles:

```sh
curl https://gitlab.haskell.org/haskell-wasm/ghc-wasm-meta/-/raw/master/bootstrap.sh | sh
source ~/.ghc-wasm/env    # puts wasm32-wasi-ghc and friends on PATH
```

No native GHC is needed (the bindist is a prebuilt cross compiler) and no
packages beyond GHC's own `base` and `array`; there is no cabal project.

## Build

```sh
wasm32-wasi-ghc -O2 DeltaBlue.hs -outputdir OBJ -o OUT/deltablue.wasm \
  -no-hs-main -optl-mexec-model=reactor \
  -optl-Wl,--export=hs_init,--export=bench_chain,--export=bench_projection -optl-Wl,--strip-all
```

`-O2` is GHC's full optimization; no flag that removes checks is used, and
every array access goes through the bounds-checked `readArray` /
`writeArray`. `-no-hs-main -optl-mexec-model=reactor` links a WASI reactor
with no `main`; `foreign export ccall` exposes `bench_chain(i32) -> i64` and `bench_projection(i32) -> i64`, and
`--export=` keeps them and `hs_init` in the module's exports.
`--strip-all` drops the name section. The RTS runs with its default
settings. What ships is `deltablue.wasm` plus `d8-prelude.js`.

## Running in d8

```sh
d8 -e "globalThis.PORT_DIR='OUT'" d8-prelude.js -e "print(chain(20), projection(20))"   # 0 0
```

`d8-prelude.js` reads `${PORT_DIR}/deltablue.wasm` and instantiates it
synchronously against a minimal WASI preview-1 shim (empty arguments and
environment, no preopens, clocks from `Date.now` / `performance.now`, fd 1
and 2 to `print`, `poll_oneoff` reporting every subscription fired,
`proc_exit` throwing, `ENOSYS` for anything else). It then calls
`_initialize` and `hs_init(0, 0)` once and defines `chain(iterations)` and `projection(iterations)`, which return the failure
count (the `i64`
result converted from BigInt to a Number). No `PORT_READY` is needed.
