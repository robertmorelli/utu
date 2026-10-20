# fannkuch-redux in AssemblyScript

An idiomatic AssemblyScript port of `../fannkuch.js` (and
`../rust/src/lib.rs`): the same three `Int32Array`s, the same loops, line for
line; only the types are written out and the result is widened to `i64`.

## Toolchain

AssemblyScript 0.28.20 (`npm i assemblyscript@0.28.20`, the latest stable on
npm), run under Node v25.8.1. AssemblyScript compiles to **linear-memory Wasm
with its own garbage collector** (the `incremental` runtime: TLSF allocator
plus an incremental tri-colour mark-and-sweep, compiled into the module), not
WasmGC. To find GC roots it keeps a shadow stack in linear memory, so every
function that holds a reference spills it there; that is part of the
language's cost.

## Build

```sh
asc fannkuch.ts -O3 --runtime incremental -o fannkuch.wasm
```

`-O3` is Binaryen's optimize level 3 with shrink level 0. `incremental` is
AssemblyScript's default runtime and the only one that collects garbage on
its own; all five AssemblyScript ports use it. `stub` (bump allocation, never
freed) runs out of memory on binary-trees, and `minimal` needs the host to
call `__collect()` between calls, so neither is a fair general choice.
`--noAssert` is not used: array and typed-array bounds checks and the `!`
null checks stay in. The exports return only numbers, so no `--bindings`.

## Running

The module imports only `env.abort` (called on a failed check, a thrown
`Error`, or an out-of-bounds access); provide it as a function that throws:

```js
const instance = new WebAssembly.Instance(
  new WebAssembly.Module(readbuffer('fannkuch.wasm')),
  { env: { abort() { throw new Error('abort'); } } });
instance.exports.bench(1); // 8629030n
```

`i64` results arrive as BigInt.
