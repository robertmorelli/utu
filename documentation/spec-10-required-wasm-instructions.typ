= 10. Required Wasm Instructions

Complete list of Wasm instructions the compiler must emit, organized by
category.

== 10.1 Control Flow

- `block`: labeled blocks, block-with-return
- `loop`: `for` loops, `while` loops
- `if / else`: conditionals
- `br`: break from block or loop
- `br_if`: conditional break
- `br_table`: scalar switch and match
- `br_on_null`: null check branching and the `\` operator
- `br_on_non_null`: non-null check branching and the `\` operator
- `br_on_cast`: type-based pattern matching
- `br_on_cast_fail`: inverse type check
- `call`: direct function call
- `call_ref`: function reference call
- `call_indirect`: table-based dispatch
- `return`: early return
- `unreachable`: trap, exhaustive match fallthrough, force unwrap
- `nop`: no operation
- `try / catch / catch_all`: JS import error wrapping for the `#` operator
- `throw_ref`: rethrow on failed error cast

== 10.2 GC Instructions

- `struct.new`: struct allocation
- `struct.get / struct.get_s / struct.get_u`: field access
- `struct.set`: field mutation, mutable fields only
- `array.new`: array allocation with default
- `array.new_fixed`: array allocation from values
- `array.new_default`: array allocation with zero init
- `array.new_data`: array from a data segment
- `array.get / array.get_s / array.get_u`: array element access
- `array.set`: array element mutation
- `array.len`: array length
- `array.copy`: array bulk copy
- `array.fill`: array bulk fill
- `ref.null`: null reference literal
- `ref.is_null`: null check
- `ref.as_non_null`: assert non-null, trap on null
- `ref.cast`: downcast, trap on failure
- `ref.test`: type test, returns `i32`
- `ref.eq`: reference equality
- `ref.i31`: box `i32` to `i31ref`
- `i31.get_s / i31.get_u`: unbox `i31ref`
- `extern.convert_any`: `anyref` to `externref`
- `any.convert_extern`: `externref` to `anyref`

== 10.3 Variable Instructions

- `local.get`: read local variable
- `local.set`: write local variable
- `local.tee`: write and keep on stack
- `global.get`: read global
- `global.set`: write mutable global

== 10.4 Numeric Instructions

All standard Wasm numeric instructions for `i32`, `i64`, `f32`, and `f64`
arithmetic, comparison, and conversion, plus `v128` SIMD instructions when
targeting platforms with SIMD support.

== 10.5 Table Instructions

- `table.get`: read function reference from table
- `table.set`: write function reference to table
- `table.grow`: grow function table
- `table.size`: query table size
