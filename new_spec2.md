# Utu Language Spec (v2)

---

## Top-level forms

```
// library of reusable declarations — may only contain functions
export lib {
    fn exported_thing(...) ... {
        ...
    }
}

// main entry point
export main(...) ... {
    ...
}
```

Rules:
- `export lib` is a codegen annotation surface. It contains **only functions** — no structs, enums, globals, or tests.
- `export lib` does not create any importable Utu interface. It only marks enclosed functions for Wasm export to JS.
- `export main` and `export lib` are mutually exclusive in one entry file.

---

## Nominal type qualifiers

Nominal qualifiers prefix struct and enum declarations. They can be combined.

```
tag
rec
tag rec
```

`tag` enables tag-based dispatch (`alt` over enum variants becomes `br_table`).
`rec` makes the type `(sub …)`-able so other types can extend it (`alt` over a
struct hierarchy becomes a `br_on_cast` chain). Most users start with no
qualifier; reach for `tag` or `rec` when the compiler diagnostic recommends one.

---

## Protocols

Protocol members are pipe-delimited. Getters, setters, and methods are all members.

```
proto P1:
    | get a : i32
    | set b : f64
    | get set c : T1
    | foo(i32, f64) T2
    | bar() void
```

> Protocol composition is planned for a future version.

---

## Structs

```
tag struct T1[P1, P2]:
    | field1 : i32
    | field2 : T2

// no nominal qualifiers
struct T2:
    | x : f32
    | y : f32
```

---

## Enums

Enums replace the old `type` declaration. Variants may carry named fields.

```
tag enum Color:
    | Red
    | Green
    | Blue

tag enum Result[P1]:
    | Ok { value : i32 }
    | Err { message : str }
```

---

## Functions

The keyword is `fn`. A self parameter `|self|` appears before the argument list for associated and protocol functions. The self type determines which form is used.

```
// free function
fn add(a: i32, b: i32) i32 {
    ...
}

// struct/enum method — self is T1
fn T1.foo |t1| (a: i32) void {
    ...
}

// protocol virtual method implementation — self is T1, implementing P1
fn P1[T1].foo |t1| (a: i32) void {
    ...
}

// protocol method implementation — self is the protocol type P1
fn P1.foo |p1| (a: i32) void {
    ...
}

// operator overload — colon syntax, two captures (lhs, rhs)
// the operator name maps to the infix operator it implements
fn T1:add |a, b| T1 {
    ...
}
fn T1:sub  |a, b| T1 { ... }
fn T1:mul  |a, b| T1 { ... }
fn T1:div  |a, b| T1 { ... }
fn T1:rem  |a, b| T1 { ... }
fn T1:eq   |a, b| bool { ... }   // ==
fn T1:ne   |a, b| bool { ... }   // !=
fn T1:lt   |a, b| bool { ... }   // <
fn T1:le   |a, b| bool { ... }   // <=
fn T1:gt   |a, b| bool { ... }   // >
fn T1:ge   |a, b| bool { ... }   // >=
fn T1:band |a, b| T1 { ... }     // &
fn T1:bor  |a, b| T1 { ... }     // |
fn T1:bxor |a, b| T1 { ... }     // ^
fn T1:shl  |a, b| T1 { ... }     // <<
fn T1:shr  |a, b| T1 { ... }     // >>
fn T1:ushr |a, b| T1 { ... }     // >>>
fn T1:neg  |a|    T1 { ... }     // unary -
fn T1:bnot |a|    T1 { ... }     // unary ~
```

When the compiler sees `a + b` where `a : T1`, it desugars to `T1:add(a, b)`.  
If no operator overload exists for the type, it is a compile error.  
Scalars (`i32`, `f32`, etc.) provide built-in operator implementations via their std modules.

---

## Modules

Modules are parameterized by types or protocols. Inside a module, `&` refers to the promoted type — the type that the module defines or exposes as its primary interface (inspired by `&` in nested CSS).
Modules are the unit of importing as well as the only unit of type parameterization.
**Modules do not nest.**

```
// module parameterized by concrete types
mod M1[T1, T2] {
    proto &:
        | get a : i32
        | set b : f64
        | get set c : f32
        | foo(T1) T2

    tag struct T3[&]:
        | field1 : i32
        | field2 : T2

    fn &[T3].foo |t3| (a: T1) T2 {
        ...
    }

    fn &.bar |p| () void {
        ...
    }
}

// module parameterized by protocols — in/out for variance
// out P: covariant   — P only in output positions (return types, field reads)
// in P:  contravariant — P only in input positions (parameter types)
// no annotation: invariant
mod Pair[out P1, in P2] {
    tag struct &[]:
        | first  : P1
        | second : P2

    fn add(a: &, b: &) & {
        return .{
            first  = a.first.combine(b.first)
            second = a.second.combine(b.second)
        };
    }
}

// wasm-native type binding — & maps to a wasm intrinsic instead of a utu struct/enum
// any wasm type can be declared this way: GC arrays, externref, i31, scalar value types, etc.
mod Array[T1] {
    type & = @ir/\ <ir-wasm-array elem="T1" mut="true"/> \/

    fn &.new(n: i32) & { ... }
    fn &.get |self| (i: i32) T1 { ... }
    fn &.set |self| (i: i32, v: T1) void { ... }
    fn &.len |self| () i32 { ... }
}

// scalar type as module — & resolves to the wasm scalar value type
// all arithmetic operators are defined here as operator overloads
mod i32 {
    type & = @ir/\ <ir-wasm-scalar kind="i32"/> \/

    fn &:add  |a, b| & { @ir/\ <ir-i32-add/> \/; }
    fn &:sub  |a, b| & { @ir/\ <ir-i32-sub/> \/; }
    fn &:mul  |a, b| & { @ir/\ <ir-i32-mul/> \/; }
    fn &:eq   |a, b| bool { @ir/\ <ir-i32-eq/> \/; }
    // ... etc.
    fn clz(x: &) & { @ir/\ <ir-i32-clz/> \/; }
}
```

Rules:
- A `mod` body may contain `type` declarations, structs, protocols, enums, functions, globals, tests, and benches.
- A `mod` body may **not** contain another `mod`.

---

## Type declarations (wasm-native binding)

Inside a module, `type` binds the promoted type `&` (or a named type alias) to a wasm-level descriptor provided via `@ir`:

```
type & = @ir/\ <ir-wasm-array elem="T1" mut="true"/> \/
type & = @ir/\ <ir-wasm-scalar kind="i32"/> \/
type & = @ir/\ <ir-wasm-extern/> \/      // externref (e.g. JS strings, DOM nodes)
type & = @ir/\ <ir-wasm-i31/> \/
```

After instantiation, type parameters in the `@ir` body are substituted with concrete types.  
The codegen backend reads the `ir-wasm-*` node and emits the appropriate wasm type definition.

---

## Using (imports and aliases)

`using` brings a module into scope. `from "..."` or `from platform:name` is required for cross-file imports. Without `from`, it creates a within-file alias.

The following standard modules are **auto-imported** into every file (no explicit `using` needed):

```
// numeric scalars — also defines operator overloads for each type
i32  u32  i64  u64
f32  f64
bool
// reference types
str        // externref-backed string with JS interop
Array      // std:array — mutable WasmGC array, invariant in T1
```

All auto-imported names can be shadowed by an explicit `using ... |Alias|`.

```
// cross-file import
using M1 from "...";

// platform standard library import
using M1 from std:m1;

// cross-file import with alias
using M1 |M2| from "...";

// cross-file import, instantiated with type args, aliased
using M1[i32, f64] |NumMap| from "...";

// within-file alias
using M1 |M2|;

// within-file instantiation with alias
using M1[i32, f64] |NumMap|;

// inline instantiation (no alias needed — compiler derives name automatically)
fn f() Array[i32] { Array[i32].new(10); }
```

---

## Scalar types

Scalars are value types — they live on the wasm stack, not the heap, and are never nullable by default.

```
i32  u32  i64  u64   // integers
m32  m64  m128       // masks — like integers but only bitwise/comparison ops are valid
f32  f64             // floats
v128                 // SIMD
bool                 // boolean
```

Reference types: `externref`, `i31`, `Array[T]`, `str`, structs and enums, functions `fun(T1, T2) R`.

Nullable: prefix with `?` — e.g. `?T1`, `?i32`.

---

## Operators

All operators desugar to operator overload calls (`fn T1:op |a, b|`).  
Precedence (high to low): `^` · `* / %` · `+ -` · `<< >> >>>` · `&` · `|` · `== != < > <= >=` · `and` · `xor` · `or` · `orelse` · `|>`

```
// arithmetic
+  -  *  /  %

// bitwise
&  |  ^  ~  <<  >>  >>>

// comparison
==  !=  <  >  <=  >=

// logical (not overloadable — always bool operands)
and  or  not  xor

// null fallback (else)
orelse

// pipe
|>

// assignment
=  +=  -=  *=  /=  %=  &=  |=  ^=  <<=  >>=  >>>=  and=  or=  xor=
```

---

## Expressions

```
// literals
42        0xff      0b1010    // int
3.14      1.0e-9              // float
"hello"                       // string
\\multiline                   // multiline string (each line prefixed \\)
true  false  null

// struct init
T1 { field1: 10, field2: x }

// implicit struct init (type inferred from &)
let t1: T1 = &{ field1: 10, field2: x };

// array (Array is auto-imported from std:array)
Array[i32].new(10)

// field access
expr.field
a[i]              // index — desugars to Array[T].get(a, i)
a[start, end]     // slice — desugars to Array[T].slice(a, start, end)

// call
foo(a, b)
T1.method(a)

// if / else
if cond { ... } else { ... }

// match (on scalars)
match expr {
    0 => ...,
    1 => ...,
      ~> ...,
}

// alt (on enum variants)
alt expr {
    Variant1 |x| => ...,
    Variant2 |y| => {...},
                 ~> ...,
}

// promote (nullable unwrap)
promote expr {
    |x| => { ... },
        ~> ...,
}

// for / while (for loop captures are always i64) (support labels)
for (0 ... 10) |i| { ... }     // inclusive
for (0 ..< 10) |i| { ... }     // exclusive
while (cond) { ... }

// bind (let)
let x: i32 = expr

// pipe
expr |> foo
expr |> foo(&, extra)

// assert / fatal
assert cond
fatal

// break (from loop or block with optional label)
break

// labeled block
label: { ... }
```

---

## Builtin static methods

Some types expose static methods that are not operator overloads.  
These live on the module and are called with `T.method(...)` syntax:

```
i32.clz(x)        // count leading zeros — i32, u32, i64, u64
i32.ctz(x)        // count trailing zeros
f32.sqrt(x)       // sqrt, floor, ceil, etc.
str.char(n)       // construct single-char string from code point
i31.get(x)        // i31 ref unbox
T1.null           // null reference for type T1
```

---

## Globals and escape

```
// global constant
let PI: f64 = 3.14159;

// DSL expressions — @name/\ body \/
// builtins: @es (JavaScript), @utu (utu source), @ir (raw IR xml), @wat (WAT)
// body is raw text handed to the named DSL module at compile time
let foo: fun(i32, str) f64 = @es/\ return a + b \/;
let value: f64 = @utu/\ some.utu.expr \/;
```

---

## Tests and benchmarks

```
test "description" {
    ...
}

bench "description" {
    // setup
    ...
    measure {
        //interesting code
        ...
    }
}
```
