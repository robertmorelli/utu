= 2. Type System

== 2.1 Linear Logic Foundation

The type system draws from linear logic, where values are _resources_ that are
produced and consumed. The key insight is that linearity is enforced
_structurally through syntax_ rather than through a checker: unnamed
intermediate values can only flow forward through pipes and cannot be
referenced twice because they have no name. Named bindings are explicitly
promoted to unrestricted use via `let`.

=== 2.1.1 Connective Mapping

- Symbol `(return type)`; linear logic `!A ⊸ B`; meaning: function, with args
  unrestricted and named in params
- Symbol `-o`; linear logic `A ⊸ B`; meaning: pipe operator, consume left and
  produce right
- Symbol `,`; linear logic `A ⊗ B`; meaning: tensor product, have both
  simultaneously
- Symbol `|`; linear logic `A ⊕ B`; meaning: sum or union, one variant, tagged
- Symbol `#`; linear logic `A ⊕ B` exclusive; meaning: exclusive disjunction,
  exactly one non-null
- Symbol `let`; linear logic `!A`; meaning: exponential, promote to
  unrestricted and reusable binding

=== 2.1.2 Resource Interpretation

An unnamed value produced by an expression is a linear resource: it must be
consumed exactly once by the next pipe stage or function argument. The `let`
binding keyword promotes a value to unrestricted, allowing multiple uses. This
makes linearity the invisible default: the common path is pipes and inline
expressions, and `let` is the explicit escape hatch. The grammar itself
prevents reuse of unnamed values, so no use-count analysis is required.

== 2.2 Scalar Types

- `i32`: 32-bit signed integer
- `u32`: 32-bit unsigned integer, `i32` with unsigned operations
- `i64`: 64-bit signed integer
- `u64`: 64-bit unsigned integer, `i64` with unsigned operations
- `f32`: 32-bit IEEE 754 float
- `f64`: 64-bit IEEE 754 float
- `v128`: 128-bit SIMD vector
- `bool`: boolean, `i32` with `0` and `1` semantics

Note: Wasm does not distinguish signed and unsigned at the type level. `u32`
and `u64` are syntactic sugar that select unsigned variants of division,
remainder, comparison, and conversion instructions.

== 2.3 Reference Types

- `struct { ... }` maps to `(struct (field ...))`
- `array[T]` maps to `(array (mut T))`
- `externref` maps to `externref`, an opaque JS value
- `anyref` maps to `anyref`, the top of the GC hierarchy
- `i31` maps to `i31ref`, a 31-bit tagged integer
- `eqref` maps to `eqref`, a structurally comparable reference

The `fun(A) B` syntax is reserved for planned first-class function references.
The grammar accepts it, but the current compiler does not yet support that
surface as part of the stable implemented subset.

All reference types are *non-nullable by default*. Nullable types are
expressed using the exclusive disjunction operator: `T # null`. This maps to
`(ref null $T)` in Wasm. Null safety is enforced at the Wasm validator level,
so there is no runtime overhead.

== 2.4 Product Types (Structs)

Structs are GC heap-allocated reference types. Fields are *const by default*.
Use the `mut` keyword to allow mutation. The tensor product `,` appears in
both struct field lists and multi-value returns.

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

*Wasm lowering:*

```wasm
(type $Vec2 (struct (field $x f32) (field $y f32)))
(type $Node (struct
    (field $value i32)
    (field $left (mut (ref null $Node)))
    (field $right (mut (ref null $Node)))
))
```

Note: const fields lower without the `(mut ...)` wrapper in Wasm, allowing the
engine to optimize them as truly immutable.

== 2.5 Sum Types (Enums)

Sum types use `|` and map to WasmGC's type hierarchy. The compiler generates a
common supertype and subtypes for each variant. Pattern matching lowers to
`br_on_cast` chains.

```utu
type Shape =
    | Circle { radius: f32 }
    | Rect { w: f32, h: f32 }
    | Triangle { a: f32, b: f32, c: f32 };
```

*Wasm lowering:*

```wasm
(type $Shape (struct))  ;; abstract supertype
(type $Circle (sub $Shape (struct (field $radius f32))))
(type $Rect (sub $Shape (struct (field $w f32) (field $h f32))))
(type $Triangle (sub $Shape (struct
    (field $a f32) (field $b f32) (field $c f32))))
```

== 2.6 Exclusive Disjunction (Error Returns)

The `#` operator denotes an exclusive return: exactly one value is non-null.
This is the error handling mechanism. It maps to Wasm multi-value return with
complementary nullability.

```utu
fun divide(a: i32, b: i32) i32 # DivError {
    fatal;
}

// Wasm signature:
// (func $divide (param i32 i32)
//     (result (ref null $i32_box) (ref null $DivError)))
// Contract: exactly one result is non-null
```

The same `A # B` spelling is used for ordinary function returns. At runtime the
compiler lowers it to a direct multi-value Wasm signature with complementary
nullability. That keeps nullable fallback and explicit branching in the source
surface without introducing a separate exception system.

```utu
shimport "es" fetch(str) Response # null;
shimport "es" fetch(str) Response # ApiError;

// Call site — nullable fallback and null checks work today:
let resp: Response # null, err: ApiError # null = fetch(url);
if not ref.is_null(err) {
    // typed error path
} else {
    if ref.is_null(resp) {
        // empty result path
    } else {
        // resp is non-null here
    };
};
```

=== 2.6.1 Nullable Types

Nullable types are expressed as exclusive disjunction with null:

```utu
T # null    // nullable T — maps to (ref null $T)
```

This means nullable is not a special language feature: it falls out naturally
from `#`.

=== 2.6.2 Force Unwrap and Default Values

The current compiler supports both force unwrap and fallback on nullable
references.

```utu
// Force unwrap — trap if null (\ fatal)
let val: Thing = get_thing() \ fatal;

// Nullable fallback
let cached: Response = fetch(url) \ default_response;

// Nullable import + force unwrap
let resp: Response = fetch(url) \ fatal;
```

Both forms are implemented today:

- `expr \ fatal` evaluates `expr` and applies `ref.as_non_null`
- `expr \ fallback` evaluates `fallback` only when the left side is null

The force-unwrap form lowers directly:

```wasm
;; val = expr \ fatal
(call $expr)
ref.as_non_null
```

== 2.7 Multi-Value Return (Tensor Product)

Functions can return multiple values using `,`, which maps directly to Wasm's
multi-value return. Unlike `#`, all values are non-null; tensor means you have
both.

```utu
fun divmod(a: i32, b: i32) i32, i32 {
    (a / b, a % b);
}

let q: i32, r: i32 = divmod(10, 3);
```

== 2.8 Assertions, Tests, And Benchmarks

Utu also supports a compact in-source testing surface:

```utu
assert cond;

test "adds two numbers" {
    assert add(2, 2) == 4;
}

bench "sum loop" |i| {
    setup {
        let total: i32 = 0;
        measure {
            total = total + i;
        }
    }
}
```

- `assert` behaves like a source-level `fatal` on failure and lowers to Wasm
  `unreachable`
- `test` declarations are ignored by ordinary program compilation and become
  synthesized zero-argument exports in test mode
- `bench` declarations are ignored by ordinary program compilation and become
  synthesized benchmark exports in bench mode
- benchmark setup runs once per sample and `measure` runs inside a generated
  Wasm loop for the requested iteration count
- benchmark timing is measured by the host, not inside Wasm
