= 9. Builtin Operations

All Wasm GC and numeric instructions are exposed as builtins. These are not
library functions: the compiler emits the corresponding Wasm instruction
directly.

== 9.1 Struct Operations

- `StructName { fields... }` -> `struct.new $T`
- `obj.field` -> `struct.get $T $field`
- `obj.field = val` -> `struct.set $T $field`, for mutable fields only

== 9.2 Array Operations

- `array[T].new(len, init)` -> `array.new $T`
- `array[T].new_fixed(vals...)` -> `array.new_fixed $T N`
- `array[T].new_default(len)` -> `array.new_default $T`
- `array[T].new_data(data, off, len)` -> `array.new_data $T $data`
- `arr[i]` -> `array.get $T`
- `arr[i] = val` -> `array.set $T`
- `array.len(arr)` -> `array.len`
- `array.copy(dst, di, src, si, len)` -> `array.copy $T $T`
- `array.fill(arr, off, val, len)` -> `array.fill $T`

== 9.3 Reference Operations

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

== 9.4 Numeric Operations

Standard Wasm numeric instructions are available as infix operators and
builtins:

- Arithmetic: `+  -  *  /  %`, mapping to instructions such as `i32.add`,
  `i32.rem_s`, and `f64.mul`
- Bitwise: `&` as and, `|` as or, `^` as xor, `<<` as shl, `>>` as `shr_s`,
  `>>>` as `shr_u`
- Unary: `-` negate, `not` logical not, `~` bitwise invert
- Comparison: `==  !=  <  >  <=  >=`
- Conversion: `i32.wrap(i64)`, `i64.extend(i32)`, `f32.convert(i32)`, and so
  on
- Math: `f32.sqrt`, `f64.ceil`, `f64.floor`, `f64.trunc`, `f64.nearest`
- SIMD: `v128.*`, all SIMD instructions as builtins

*Operator clarity:* Each symbol has exactly one meaning. `#` is exclusive
disjunction at the type level only. `%` is always remainder. `^` is always
bitwise XOR. `~` is always bitwise NOT, unary only.
