# Richards in Haskell (GHC's WebAssembly backend)

`Richards.hs` is `../richards.js` / `../rust/src/lib.rs` in Haskell. Tasks and
packets are records in `IO` whose assigned fields are `IORef`s (a packet's
four data words are a bounds-checked `IOUArray Int Int`); the task list and
packet queues are linked through `Maybe` links, the task table is an
`IOArray Int (Maybe Task)`, and the four kinds of task are one ADT of each
kind's private mutable data (`Idle`, `Device`, `Handler`, `Worker`), which
`runFunction` pattern-matches on, as the Rust port matches its enum.

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
wasm32-wasi-ghc -O2 Richards.hs -outputdir OBJ -o OUT/richards.wasm \
  -no-hs-main -optl-mexec-model=reactor \
  -optl-Wl,--export=hs_init,--export=bench -optl-Wl,--strip-all
```

`-O2` is GHC's full optimization; no flag that removes checks is used, and
every array access goes through the bounds-checked `readArray` /
`writeArray`. `-no-hs-main -optl-mexec-model=reactor` links a WASI reactor
with no `main`; `foreign export ccall` exposes `bench(i32) -> i64`, and
`--export=` keeps them and `hs_init` in the module's exports.
`--strip-all` drops the name section. The RTS runs with its default
settings. What ships is `richards.wasm` plus `d8-prelude.js`.

## Running in d8

```sh
d8 -e "globalThis.PORT_DIR='OUT'" d8-prelude.js -e "print(bench(1))"   # 23246092970
```

`d8-prelude.js` reads `${PORT_DIR}/richards.wasm` and instantiates it
synchronously against a minimal WASI preview-1 shim (empty arguments and
environment, no preopens, clocks from `Date.now` / `performance.now`, fd 1
and 2 to `print`, `poll_oneoff` reporting every subscription fired,
`proc_exit` throwing, `ENOSYS` for anything else). It then calls
`_initialize` and `hs_init(0, 0)` once and defines `bench(iterations)` (the `i64`
result converted from BigInt to a Number). No `PORT_READY` is needed.
