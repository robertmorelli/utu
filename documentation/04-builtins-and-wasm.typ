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
- `array[T].new_data(data, off, len)` -> `array.new_data $T $data`
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
- `ref.cast<T>(val)` -> `ref.cast (ref $T)`
- `ref.test<T>(val)` -> `ref.test (ref $T)`
- `ref.eq(a, b)` -> `ref.eq`
- `i31.new(val)` -> `ref.i31`
- `i31.get_s(val)` -> `i31.get_s`
- `i31.get_u(val)` -> `i31.get_u`
- `extern.convert(val)` -> `extern.convert_any`
- `any.convert(val)` -> `any.convert_extern`

== Numeric Operations

Numeric support is split into categories, but all of them map to standard Wasm
numeric instructions:

- arithmetic: `+`, `-`, `*`, `/`, `%`
- bitwise: `&`, `|`, `^`, `<<`, `>>`, `>>>`
- unary: `-`, `not`, `~`
- comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- conversion helpers such as `i32.wrap(i64)` and `f32.convert(i32)`
- math helpers such as `f32.sqrt`, `f64.ceil`, `f64.floor`, `f64.trunc`, and
  `f64.nearest`
- the `v128.*` SIMD family when the target supports SIMD

The spec also insists on symbol clarity:

- `#` is only exclusive disjunction at the type level
- `%` is always remainder
- `^` is always bitwise XOR
- `~` is always unary bitwise NOT

== Required Wasm Instructions

The compiler's minimum instruction surface is grouped by category.

=== Control Flow Instructions

- `block` for labeled blocks and block expressions
- `loop` for counted and while-style loops
- `if` and `else` for conditionals
- `br` for breaking out of a block or loop
- `br_if` for conditional exits
- `br_table` for scalar matches
- `br_on_null` and `br_on_non_null` for nullable branching and the `\` operator
- `br_on_cast` for type-based pattern matching
- `br_on_cast_fail` for inverted type tests
- `call` for direct calls
- `call_ref` for function reference dispatch
- `call_indirect` for table-based dispatch
- `return` for explicit early return
- `unreachable` for traps and impossible states
- `nop` as the standard no-op
- `try`, `catch`, and `catch_all` for JS import error wrapping
- `throw_ref` for rethrowing failed typed catches

=== GC Instructions

- `struct.new` for struct allocation
- `struct.get`, `struct.get_s`, and `struct.get_u` for field access
- `struct.set` for mutable field writes
- `array.new` for array allocation with an initializer
- `array.new_fixed` for literal arrays
- `array.new_default` for zero-initialized arrays
- `array.new_data` for data-segment-backed arrays
- `array.get`, `array.get_s`, and `array.get_u` for element access
- `array.set` for element writes
- `array.len` for length queries
- `array.copy` for bulk copying
- `array.fill` for bulk filling
- `ref.null` for null literals
- `ref.is_null` for null checks
- `ref.as_non_null` for assertions that trap on null
- `ref.cast` for checked downcasts
- `ref.test` for type tests
- `ref.eq` for reference equality
- `ref.i31` for boxing an integer into `i31ref`
- `i31.get_s` and `i31.get_u` for unboxing
- `extern.convert_any` for anyref-to-externref conversion
- `any.convert_extern` for externref-to-anyref conversion

=== Variable Instructions

- `local.get`
- `local.set`
- `local.tee`
- `global.get`
- `global.set`

These cover named values, temporaries, and mutable globals.

=== Numeric Instructions

The spec requires the full standard numeric families for `i32`, `i64`, `f32`,
and `f64`, plus `v128` SIMD operations when SIMD is a target capability.

=== Table Instructions

- `table.get` for reading function references
- `table.set` for writing function references
- `table.grow` for expanding tables
- `table.size` for querying table length

Together these instructions define the Wasm feature set the compiler must be
able to emit in order to realize the language surface described in the spec.
