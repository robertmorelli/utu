= Overview And Type System

== Overview

Utu is a statically typed, garbage collected language that compiles directly
to WebAssembly GC. The design goal is to stay close to the Wasm instruction
set: language constructs are chosen so they lower 1:1, or close to 1:1, into
structured control flow, GC heap types, and multi-value returns.

The key design principles from the spec are:

- direct lowering to WasmGC primitives
- linear-by-construction data flow through pipes
- structured control flow that mirrors Wasm blocks and loops
- strings backed by host string builtins instead of a custom runtime
- error handling as values with exclusive disjunction via `#`
- null safety derived from non-nullable Wasm reference types
- immutable struct fields by default, with `mut` opt-in

The naming convention is intentionally simple:

- types use `CapitalCamel`, such as `Vec2`, `ApiError`, and `Todo`
- functions and variables use `snake_case`, such as `new_todo` and
  `console_log`

== Linear Logic Foundation

The type system borrows from linear logic, but the important practical idea is
syntactic discipline rather than a separate borrow checker. Unnamed
intermediate values flow forward through `-o` pipelines and cannot be reused
accidentally because they are never bound. A `let` binding explicitly promotes
the value into a reusable, unrestricted name.

The connective mapping in the spec is:

- function return position: `!A ⊸ B`
- pipe operator `-o`: `A ⊸ B`
- tensor product `,`: `A ⊗ B`
- sum type `|`: `A ⊕ B`
- exclusive disjunction `#`: exactly one branch is present
- `let`: promotion to unrestricted use

This gives the language a useful default:

- inline expressions and pipelines are single-use by construction
- named bindings are the explicit opt-out when reuse is needed

== Scalar Types

Utu exposes the Wasm scalar surface directly:

- `i32`: 32-bit signed integer
- `u32`: 32-bit unsigned integer spelled as `i32` plus unsigned operations
- `i64`: 64-bit signed integer
- `u64`: 64-bit unsigned integer spelled as `i64` plus unsigned operations
- `f32`: 32-bit IEEE 754 float
- `f64`: 64-bit IEEE 754 float
- `v128`: 128-bit SIMD vector
- `bool`: boolean value using `0` and `1` semantics on `i32`

The unsigned integer types are syntax-level conveniences. Wasm itself does not
have separate `u32` or `u64` runtime types, so the compiler chooses unsigned
instruction variants for division, remainder, comparison, and conversion.

== Reference Types

Reference types map directly onto WasmGC heap references:

- `struct { ... }` lowers to Wasm `struct`
- `array[T]` lowers to Wasm `array`
- `fn(A) B` lowers to a Wasm function type
- `externref` is an opaque host reference
- `anyref` is the top of the GC hierarchy
- `i31` maps to `i31ref`
- `eqref` is used for structurally comparable references

All reference types are non-nullable by default. Nullable references are
spelled as `T # null`, which lowers to a nullable Wasm reference like
`(ref null $T)`. The spec treats nullability as a special case of exclusive
disjunction rather than a separate language feature.

== Product Types: Structs

Structs are heap allocated reference types. Fields are immutable by default;
`mut` is required when later `struct.set` operations should be legal.

```utu
struct Vec2 {
    x: f32,
    y: f32,
}

struct Node {
    value: i32,
    mut left: Node # null,
    mut right: Node # null,
}
```

The Wasm shape is direct:

```wasm
(type $Vec2 (struct (field $x f32) (field $y f32)))
(type $Node (struct
    (field $value i32)
    (field $left (mut (ref null $Node)))
    (field $right (mut (ref null $Node)))
))
```

The spec calls out an optimization-friendly detail: non-`mut` fields lower to
non-mutable Wasm fields, which allows the engine to treat them as truly
immutable.

== Sum Types: Enums

Sum types use `|`. The compiler models them as a common supertype plus one
subtype per variant, and pattern matching becomes a `br_on_cast` chain.

```utu
type Shape =
    | Circle { radius: f32 }
    | Rect { w: f32, h: f32 }
    | Triangle { a: f32, b: f32, c: f32 }
```

```wasm
(type $Shape (struct))
(type $Circle (sub $Shape (struct (field $radius f32))))
(type $Rect (sub $Shape (struct (field $w f32) (field $h f32))))
(type $Triangle (sub $Shape (struct
    (field $a f32) (field $b f32) (field $c f32)
)))
```

This model keeps variant dispatch inside WasmGC's native type system instead of
building a hand-rolled tag format in linear memory.

== Exclusive Disjunction, Nullability, And `\`

The `#` operator expresses an exclusive result: exactly one branch is present.
In practice, this is Utu's error return mechanism.

```utu
fn divide(a: i32, b: i32) i32 # DivError
```

The Wasm signature becomes a multi-value return with complementary nullability:

```wasm
(func $divide (param i32 i32)
    (result (ref null $i32_box) (ref null $DivError)))
```

The contract is semantic rather than structural: exactly one result must be
non-null at runtime.

This same mechanism covers JS imports that may throw:

```utu
import extern "es" fetch(str) Response # null
import extern "es" fetch(str) Response # ApiError
```

On success the trampoline returns `(value, null)`. On failure it returns
`(null, typed_error)` or rethrows when the caught exception cannot be cast to
the declared error type.

Nullable references are just the same idea with `null` as the alternative:

- `T # null` means a nullable `T`
- there is no separate optional type syntax

The fallback operator `\` handles nullable values and `#` returns:

```utu
let val: Thing = get_thing() \ unreachable
let val: Thing = get_thing() \ default_value
let name: str = lookup(id) \ "anonymous"
let resp: Response = fetch(url) \ cached_response
```

Conceptually:

- evaluate the left side
- if the result is non-null, keep it
- if the result is null, evaluate the right side instead

The spec's Wasm lowering is a null check plus branch:

```wasm
(block $ok (result (ref $T))
    (br_on_non_null $ok (call $expr))
    (local.get $fallback))
```

== Multi-Value Return

The tensor operator `,` means "have both values at once". Functions can return
multiple values directly, which maps naturally onto Wasm multi-value returns.

```utu
fn divmod(a: i32, b: i32) i32, i32 {
    a / b, a % b
}

let q: i32, r: i32 = divmod(10, 3)
```

Unlike `#`, a tensor return does not represent alternatives. Every component is
present, non-null when it is a reference, and available simultaneously.
