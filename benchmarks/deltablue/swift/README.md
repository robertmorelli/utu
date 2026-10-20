# DeltaBlue in Swift (linear-memory Wasm)

A port of `../deltablue.js` / `../rust/src/lib.rs` in idiomatic Swift: a class
hierarchy (`Constraint` > `UnaryConstraint` > final `StayConstraint` /
`EditConstraint`, `BinaryConstraint` > final `ScaleConstraint` /
`EqualityConstraint`), `final class Variable` and `Planner`, `[Constraint]`
arrays used as stack worklists (`popLast`), optionals for absent values, and
`fatalError` for the original's thrown errors. The graph is a strong reference
cycle that ARC never frees, the same as the `Rc<RefCell<_>>` Rust port.

There is no Swift WasmGC backend. Swift targets only linear-memory Wasm
(`wasm32-unknown-wasi`), with ARC and its own allocator (wasi-libc `dlmalloc`)
compiled into the module.

## Toolchain

You need the swift.org open-source toolchain 6.4.1, because Xcode's Swift
cannot use the Wasm SDK, and the matching Swift SDK for WebAssembly:

```sh
curl -O https://download.swift.org/swiftly/darwin/swiftly.pkg
installer -pkg swiftly.pkg -target CurrentUserHomeDirectory      # ~/.swiftly
~/.swiftly/bin/swiftly init --no-modify-profile --skip-install -y
~/.swiftly/bin/swiftly install 6.4.1                             # ~/Library/Developer/Toolchains
export PATH=~/.swiftly/bin:$PATH
swift sdk install https://download.swift.org/swift-6.4.1-release/wasm-sdk/swift-6.4.1-RELEASE/swift-6.4.1-RELEASE_wasm.artifactbundle.tar.gz \
  --checksum 783e6128d174d9f975b4eda68be02a5960681b723ef372e6876a7c2543a365d8
```

## Build

```sh
swift build -c release --swift-sdk swift-6.4.1-RELEASE_wasm -Xlinker --strip-all
# -> .build/out/Products/Release-webassembly-wasm32/DeltaBlue.wasm
```

`-c release` builds with `-O`, using whole-module optimization. `-Osize` saves
only about 14 KB and makes chain about twice as slow, so this build uses `-O`.
`--strip-all` removes the DWARF and name sections. `Package.swift` links the
module as a WASI reactor (`-mexec-model=reactor`, no `main`). It exports
`_initialize`, `memory`, `bench_chain` and `bench_projection`; the two bench
functions use `@_expose(wasm)` and `@_cdecl`, take an `i32`, and return an
`i32`.

The same source also builds unchanged with Embedded Swift. This produces a
30 KB module whose only import is `random_get`:

```sh
swift build -c release --swift-sdk swift-6.4.1-RELEASE_wasm-embedded -Xlinker --strip-all
```

## Running in d8

```sh
d8 -e "globalThis.PORT_DIR='.build/out/Products/Release-webassembly-wasm32'" d8-prelude.js -e "print(chain(20), projection(20))"
```

`d8-prelude.js` reads `DeltaBlue.wasm` from `PORT_DIR` and instantiates it
synchronously against a minimal WASI preview-1 shim:

- Arguments and the environment are empty.
- There are no preopens, so the other `fd_*` calls return `EBADF`.
- `fd_write` sends fd 1 and fd 2 to `print`.
- `random_get` uses `Math.random`.
- `proc_exit` throws.

The prelude then calls `_initialize` and defines `chain(n)` and
`projection(n)`.
