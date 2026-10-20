# DeltaBlue: Dart (dart2wasm, WasmGC)

`deltablue.dart` is DeltaBlue ported one-to-one from `../deltablue.js` (same
classes, fields, methods, loops, in-place removal, stack worklists, planner and
tests) in idiomatic Dart: a `Strength` enum, a `Direction` enum, abstract
classes, growable `List`s, nullable types. `main()` publishes
`bench_chain(iterations)` and `bench_projection(iterations)` on `globalThis`
through `dart:js_interop`.

## Toolchain

Dart SDK 3.11.4 (`/opt/homebrew/bin/dart`). No pubspec or packages are needed;
`dart:js_interop` ships with the SDK.

## Build

```sh
dart compile wasm -O2 --no-source-maps -o OUT/deltablue.wasm deltablue.dart
```

dart2wasm's default is `-O1`; `-O2` is the highest level that keeps Dart's
semantics (it adds the closed-world `wasm-opt -Os` pipeline; `-O3`/`-O4` drop
implicit/explicit type and bounds checks, which is unsound). The output is
`deltablue.wasm` and `deltablue.mjs` (the JS runtime that compiles and
instantiates it, with the `js-string` builtins); both must be shipped.
`deltablue.support.js` is an optional feature-detection snippet and is not
needed.

## Running in d8

```sh
d8 -e "globalThis.PORT_DIR='OUT'" d8-prelude.js your-driver.js
```

The prelude reads the wasm with `read(..., 'binary')`, `import()`s the
generated `.mjs`, compiles, instantiates, runs `main()`, and then defines
`chain(iterations)` and `projection(iterations)`. Instantiation is
asynchronous, so a driver runs inside `PORT_READY.then(() => ...)`.
