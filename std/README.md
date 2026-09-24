Standard library `.utu` files are embedded under `std:<basename>` at build time.
Basenames must be unique.

`std:Browser` is not a `.utu` file. It is the browser and standard JavaScript
declaration graph, linked from TypeScript's `lib.dom` and `lib.es*` and embedded
compressed in the compiler. It is decoded on first import. Programs use its
types, properties, and methods directly; only the operations a program uses emit
boundary code.

`std:JS` is the ECMAScript subset of the same graph (`Array`, `Map`, `JSON`,
`Math`, `Promise`, …) for any JavaScript host, without the DOM.

Numbers convert explicitly with one instruction each: `i.to_f64()`,
`f.to_i32()`, `n.to_i64()`, `x.to_f32()`, and so on. Float-to-integer
conversions saturate, and NaN becomes 0, like Rust's `as`. Integer literals
adopt a float type from context (`let x: F64 = 1`).

Regenerate the browser declarations with `bun run bindings:browser`, then build
with `bun run build`. See [the declaration guide](../docs/typescript-abi.md).
