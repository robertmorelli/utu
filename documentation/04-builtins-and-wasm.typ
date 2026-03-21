= Builtins And Required Wasm Surface

== Builtin Philosophy

Builtin operations in Utu are not ordinary library calls. They are syntax and
compiler-recognized forms that emit the corresponding Wasm instruction
directly. That keeps the source language close to the runtime model and avoids
inventing an abstraction layer that hides the target.

== Struct Operations

The spec exposes the three core struct operations:

- `StructName { fields... }` lowers to `struct.new $T`
- `obj.field` lowers to `struct.get $T $field`
- `obj.field = val` lowers to `struct.set $T $field` for mutable fields

== Array Operations

The array surface is similarly direct:

- `array[T].new(len, init)` -> `array.new $T`
- `array[T].new_fixed(vals...)` -> `array.new_fixed $T N`
- `array[T].new_default(len)` -> `array.new_default $T`
- `arr[i]` -> `array.get $T`
- `arr[i] = val` -> `array.set $T`
- `array.len(arr)` -> `array.len`
- `array.copy(dst, di, src, si, len)` -> `array.copy $T $T`
- `array.fill(arr, off, val, len)` -> `array.fill $T`

== Reference Operations

Reference builtins expose WasmGC's reference toolset:

- `ref.null T` -> `ref.null $T`
- `ref.is_null(val)` -> `ref.is_null`
- `ref.as_non_null(val)` -> `ref.as_non_null`
- `ref.eq(a, b)` -> `ref.eq`
- `i31.new(val)` -> `ref.i31`
- `i31.get_s(val)` -> `i31.get_s`
- `i31.get_u(val)` -> `i31.get_u`
- `extern.convert(val)` -> `extern.convert_any`
- `any.convert(val)` -> `any.convert_extern`

== Numeric Operations

Numeric support is currently exposed through operators rather than numeric
namespace builtins:

- arithmetic: `+`, `-`, `*`, `/`, `%`
- bitwise: `&`, `|`, `^`, `<<`, `>>`, `>>>`
- unary: `-`, `not`, `~`
- comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`

Numeric namespace helpers such as `f64.sqrt(...)`, `i32.wrap(...)`, and
`v128.*` are not implemented yet.

The spec also insists on symbol clarity:

- `#` is only exclusive disjunction at the type level
- `%` is always remainder
- `^` is always bitwise XOR
- `~` is always unary bitwise NOT

== Required Wasm Instructions

The compiler's minimum instruction surface is grouped by category.

=== Control Flow Instructions

- `block` for labeled blocks and block expressions
- `loop` for counted, condition, and infinite loops
- `if` and `else` for conditionals
- `br` for breaking out of a block or loop
- `br_if` for conditional exits
- `br_on_cast` for type-based pattern matching
- `call` for direct calls
- `unreachable` for lowered `fatal` traps and other impossible states

Planned first-class function references would add `call_ref`, but that is not
part of the current implemented instruction set.

=== GC Instructions

- `struct.new` for struct allocation
- `struct.get` for field access
- `struct.set` for mutable field writes
- `array.new` for array allocation with an initializer
- `array.new_fixed` for literal arrays
- `array.new_default` for zero-initialized arrays
- `array.get` for element access
- `array.set` for element writes
- `array.len` for length queries
- `array.copy` for bulk copying
- `array.fill` for bulk filling
- `ref.null` for null literals
- `ref.is_null` for null checks
- `ref.as_non_null` for assertions that trap on null
- `ref.eq` for reference equality
- `ref.i31` for boxing an integer into `i31ref`
- `i31.get_s` and `i31.get_u` for unboxing
- `extern.convert_any` for anyref-to-externref conversion
- `any.convert_extern` for externref-to-anyref conversion

=== Variable Instructions

- `local.get`
- `local.set`
- `global.get`
- `global.set`

These cover named values, temporaries, and mutable globals.

=== Numeric Instructions

The current compiler uses the standard numeric families for `i32`, `i64`,
`f32`, and `f64` that back the source operators.
