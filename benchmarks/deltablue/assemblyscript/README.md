# DeltaBlue in AssemblyScript

An idiomatic AssemblyScript port of `../deltablue.js` (and
`../rust/src/lib.rs`): the same class hierarchy (`Constraint`, `UnaryConstraint`
with `StayConstraint` and `EditConstraint`, `BinaryConstraint` with
`ScaleConstraint` and `EqualityConstraint`) dispatched through virtual methods,
`Array<T>` for every list, `null` for absent, `Array` stacks for worklists,
and in-place removal from a variable's constraint array.

Where it differs from the JavaScript only as AssemblyScript requires:
`Constraint` and `BinaryConstraint` are `abstract` and declare the methods
subclasses supply; `markInputs` and `inputsKnown` take `mark` in every class
(override signatures must match); `for...of` loops are indexed loops over the
same arrays; `last!`, `first!`, `src!`, `dst!` assert the nullable locals the
JavaScript dereferences directly; integer `/` is already the `Math.trunc`
division. The tests count failures in `i32` and the exports sum them as
`i64`.

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
asc deltablue.ts -O3 --runtime incremental -o deltablue.wasm
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
  new WebAssembly.Module(readbuffer('deltablue.wasm')),
  { env: { abort() { throw new Error('abort'); } } });
instance.exports.bench_chain(20);      // 0n
instance.exports.bench_projection(20); // 0n
```

`i64` results arrive as BigInt.
