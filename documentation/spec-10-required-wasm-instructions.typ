= 10. Required Wasm Instructions

Complete list of Wasm instructions the compiler must emit, organized by
category.

== 10.1 Control Flow

- `block`: labeled blocks, block-with-return
- `loop`: counted, condition, and infinite `for` loops
- `if / else`: conditionals
- `br`: break from block or loop
- `br_if`: conditional break
- `br_on_cast`: type-based pattern matching
- `call`: direct function call
- `call_ref`: function reference call
- `unreachable`: emitted for source-level `fatal`, exhaustive `alt`
  fallthrough, assert failure, and force unwrap

== 10.2 GC Instructions

- `struct.new`: struct allocation
- `struct.get`: field access
- `struct.set`: field mutation, mutable fields only
- `array.new`: array allocation with default
- `array.new_fixed`: array allocation from values
- `array.new_default`: array allocation with zero init
- `array.get`: array element access
- `array.set`: array element mutation
- `array.len`: array length
- `array.copy`: array bulk copy
- `array.fill`: array bulk fill
- `ref.null`: null reference literal
- `ref.is_null`: null check
- `ref.as_non_null`: assert non-null, trap on null
- `ref.eq`: reference equality
- `ref.i31`: box `i32` to `i31ref`
- `i31.get_s / i31.get_u`: unbox `i31ref`
- `extern.convert_any`: `anyref` to `externref`
- `any.convert_extern`: `externref` to `anyref`

== 10.3 Variable Instructions

- `local.get`: read local variable
- `local.set`: write local variable
- `global.get`: read global
- `global.set`: write mutable global

== 10.4 Numeric Instructions

The current compiler uses the standard numeric instructions behind the source
operators for `i32`, `i64`, `f32`, and `f64`.
