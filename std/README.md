Standard library `.utu` files are embedded under `std:<basename>` at build time.
Basenames must be unique.

`std:Browser` is not a `.utu` file. It is the browser and standard JavaScript
declaration graph, linked from TypeScript's `lib.dom` and `lib.es*` and embedded
compressed in the compiler. It is decoded on first import. Programs use its
types, properties, and methods directly; only the operations a program uses emit
boundary code.

`std:JS` is the ECMAScript subset of the same graph (`Array`, `Map`, `JSON`,
`Math`, `Promise`, …) and `std:Web` the web APIs every modern runtime shares
(`fetch`, `URL`, streams, `crypto`, timers, …). `std:Worker` is a web worker's
global scope, linked from `lib.webworker`. See the table in
[the declaration guide](../docs/typescript-abi.md).

Numbers convert explicitly with one instruction each: `i.to_f64()`,
`f.to_i32()`, `n.to_i64()`, `x.to_f32()`, and so on. Float-to-integer
conversions saturate, and NaN becomes 0, like Rust's `as`. Integer literals
adopt a float type from context (`let x: F64 = 1`).

Regenerate the browser declarations with `bun run bindings:browser`, then build
with `bun run build`. See [the declaration guide](../docs/typescript-abi.md).

To intern spans of a byte mem without copying them, use the mem's own
`intern(start, stop)` (see the spec); `std:Interner` is for keys from anywhere.

`std:IntMap` maps `I32` keys to `I32` values (`set`, `get(key, missing)`, `has`,
`len`). `std:Interner` gives byte strings dense ids in first-seen order: call
`begin()`, `byte(b)` for each byte (from a mem, an array, or a string), then
`finish()`; the same bytes always get the same id. `size`, `byte_at`, and `ascii`
read a key back.
