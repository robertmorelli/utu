= 1. Overview

Utu is a statically-typed, garbage-collected language that compiles directly
to WebAssembly GC (WasmGC) instructions. It uses the browser's built-in
garbage collector exclusively: no linear memory allocator, no bundled runtime.
The result is near-native performance at a fraction of the bundle size of
languages like Rust, Go, or Swift compiled to Wasm.

*Design principles:*

- Map directly to WasmGC primitives: every language construct has a 1:1, or
  near 1:1, Wasm lowering.
- Linear-by-construction data flow via pipes; unrestricted bindings via
  explicit promotion.
- Control flow mirrors Wasm structured control flow exactly.
- Strings via JS String Builtins (`externref`), auto-imported, with no custom
  string runtime.
- Errors as values using exclusive disjunction (`#`), with no exceptions in
  user code.
- Null safety from WasmGC's non-nullable reference types.
- Struct fields const by default, explicitly `mut`.

*Naming conventions:*

- Types: `CapitalCamel` such as `Vec2`, `Shape`, `ApiError`, `Todo`
- Functions and variables: `snake_case` such as `new_todo`, `console_log`,
  `my_value`
