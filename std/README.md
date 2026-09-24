Standard library `.utu` files are embedded under `std:<basename>` at build time.
Basenames must be unique.

`std:Browser` is not a `.utu` file. It is the browser and standard JavaScript
declaration graph, linked from TypeScript's `lib.dom` and `lib.es*` and embedded
compressed in the compiler. It is decoded on first import. Programs use its
types, properties, and methods directly; only the operations a program uses emit
boundary code.

Regenerate the browser declarations with `bun run bindings:browser`, then build
with `bun run build`. See [the declaration guide](../docs/typescript-abi.md).
