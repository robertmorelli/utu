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
    | get a : I32
    | set b : F64
    | get set c : T1
    | foo(I32, F64) T2
    | bar() void
```

> Protocol composition is planned for a future version.

---

## Structs

```
tag struct T1[P1, P2]:
    | field1 : I32
    | field2 : T2

// no nominal qualifiers
struct T2:
    | x : F32
    | y : F32
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
    | Ok { value : I32 }
    | Err { message : Str }
```

---

## Functions

The keyword is `fn`. A self parameter `|self|` appears before the argument list for associated and protocol functions. The self type determines which form is used.

```
// free function
fn add(a: I32, b: I32) I32 {
    ...
}

// struct/enum method — self is T1
fn T1.foo |t1| (a: I32) void {
    ...
}

// protocol virtual method implementation — self is T1, implementing P1
fn P1[T1].foo |t1| (a: I32) void {
    ...
}

// protocol method implementation — self is the protocol type P1
fn P1.foo |p1| (a: I32) void {
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
fn T1:eq   |a, b| Bool { ... }   // ==
fn T1:ne   |a, b| Bool { ... }   // !=
fn T1:lt   |a, b| Bool { ... }   // <
fn T1:le   |a, b| Bool { ... }   // <=
fn T1:gt   |a, b| Bool { ... }   // >
fn T1:ge   |a, b| Bool { ... }   // >=
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
Scalars (`I32`, `F32`, etc.) provide built-in operator implementations via their std modules.

---

## Function pointers and closures

Two callable types, deliberately distinct — and the distinction is
representational, not cosmetic:

```
fun(T1, T2) R      // a wasm function — (ref $sig), called with call_ref
cl(T1, T2) R       // a JS function — an externref, always a closure
```

A `fun` call never leaves wasm: there is no table, no indirection, and no host
involvement. A `cl` *is* a JS function, so it can be handed to any JS callback
with no marshalling, at the cost of a host boundary crossing per call.

**`fun` has no literal form.** A `fun` value is produced by naming a declared
function, or by an `@es` import. It carries no environment.

```
fn double(x: I32) I32 { x * 2; }

let g: fun(I32) I32 = double;
```

**`cl` is written inline** with the `cl` keyword. Parameter types may be omitted
when the context supplies them, and written out otherwise. A return type may be
given when it is not otherwise determined.

```
let h: cl(I32) I32 = cl(x) { x * 2; };          // types from the annotation
let t: cl() void   = cl() { count += 1; };
let k: cl(I32) I32 = cl(x: I32) I32 { x * 2; }; // written out

// as a callback argument — parameter types come from the declaration
listen("click", cl(e) { handle(e); });
```

Since `let` always carries a type annotation, a closure bound to a `let` can
always read its parameter types from it.

Captures are implicit, as in JS:

- **scalars are snapshot** — the value is copied when the closure is built, so
  a later assignment to the original binding is not observed.
- **GC references are shared** — the reference is copied, so mutation *through*
  it is observed.

In both cases *rebinding* the original variable is not observed by the closure.
This differs from JS, which captures the binding rather than the value.

**Closure decay.** A `fun` converts implicitly to a `cl` with an empty
environment. The reverse is never allowed — it would have to discard the
environment.

```
fn on_each(f: cl(I32) void) void { ... }
on_each(double);        // fun(I32) void decays to cl(I32) void

let bad: fun(I32) I32 = cl(x) { x; };   // error: cl does not decay to fun
```

Decay and nullable widening are the only two implicit conversions in the
language.

> **Why closures are always JS functions.** Any closure can be handed to any JS
> callback with no marshalling, which is what makes DOM work feel invisible.
> The cost is that a closure call from utu crosses the JS boundary, and that
> utu requires a JS host — see `the_future.md`, which drops non-JS wasm hosts
> for this reason. Iteration and stream combinators are planned as syntax
> rather than callbacks so that hot paths never pay this cost.

---

## Promises and await

`Promise[T]` is a real JavaScript promise, held as an externref — the same
decision as `cl`. A promise from `fetch` is the same object utu passes back, and
a promise utu produces is directly `await`-able from JS. Nothing is wrapped.

```
let delay: fun(I32, I32) Promise[I32] =
    @es/\ (v, ms) => new Promise(r => setTimeout(() => r(v), ms)) \/;
```

**Subscribing** works on any JS host. The callback is a `cl`, which is already a
JS function, so it is handed straight to the platform:

```
delay(n, 5).then(cl(v) { record(v); });
delay(n, 5).catch(cl(e) { report(e); });
```

**Awaiting** is ordinary straight-line code:

```
fn total(a: I32, b: I32) I32 {
    let first: I32  = await delay(a, 5);
    let second: I32 = await delay(b, 5);
    first + second;
}
```

`await p` where `p : Promise[T]` has type `T`. It binds tighter than any binary
operator, so `await a + b` is `(await a) + b`, as in JS.

> **There is no `async` keyword, and functions are not coloured.** Any function
> may await; a function that awaits is called like any other. The wasm stack
> suspends at the `await` and resumes when the promise settles, so locals stay
> live across it exactly as they look. This is done by the host through
> WebAssembly's JS Promise Integration — the compiler emits an ordinary call and
> performs no CPS or state-machine transform.
>
> The cost is a host requirement: `await` needs a JSPI-capable host (Chrome
> 126+, Node 23+, Bun). `.then` does not, and is the portable floor.

---

## Modules

Modules are parameterized by types or protocols. Inside a module, `&` refers to the promoted type — the type that the module defines or exposes as its primary interface (inspired by `&` in nested CSS).
Modules are the unit of importing as well as the only unit of type parameterization.
**Modules do not nest.**

```
// module parameterized by concrete types
mod M1[T1, T2] {
    proto &:
        | get a : I32
        | set b : F64
        | get set c : F32
        | foo(T1) T2

    tag struct T3[&]:
        | field1 : I32
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
// any wasm type can be declared this way: GC arrays, Externref, I31, scalar value types, etc.
mod Array[T1] {
    type & = @ir/\ <ir-wasm-array elem="T1" mut="true"/> \/

    fn &.new(n: I32) & { ... }
    fn &.get |self| (i: I32) T1 { ... }
    fn &.set |self| (i: I32, v: T1) void { ... }
    fn &.len |self| () I32 { ... }
}

// scalar type as module — & resolves to the wasm scalar value type
// all arithmetic operators are defined here as operator overloads
mod I32 {
    type & = @ir/\ <ir-wasm-scalar kind="I32"/> \/

    fn &:add  |a, b| & { @ir/\ <ir-i32-add/> \/; }
    fn &:sub  |a, b| & { @ir/\ <ir-i32-sub/> \/; }
    fn &:mul  |a, b| & { @ir/\ <ir-i32-mul/> \/; }
    fn &:eq   |a, b| Bool { @ir/\ <ir-i32-eq/> \/; }
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
type & = @ir/\ <ir-wasm-scalar kind="I32"/> \/
type & = @ir/\ <ir-wasm-extern/> \/      // Externref (e.g. JS strings, DOM nodes)
type & = @ir/\ <ir-wasm-I31/> \/
```

After instantiation, type parameters in the `@ir` body are substituted with concrete types.  
The codegen backend reads the `ir-wasm-*` node and emits the appropriate wasm type definition.

---

## Using (imports and aliases)

`using` brings a module into scope. `from "..."` or `from platform:name` is required for cross-file imports. Without `from`, it creates a within-file alias.

The following standard modules are **auto-imported** into every file (no explicit `using` needed):

```
// numeric scalars — also defines operator overloads for each type
I32  U32  I64  U64
F32  F64
Bool
// reference types
Str        // Externref-backed string with JS interop
Array      // std:Array — mutable WasmGC Array, invariant in T1
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
using M1[I32, F64] |NumMap| from "...";

// within-file alias
using M1 |M2|;

// within-file instantiation with alias
using M1[I32, F64] |NumMap|;

// inline instantiation (no alias needed — compiler derives name automatically)
fn f() Array[I32] { Array[I32].new(10); }
```

---

## Scalar types

Scalars are value types — they live on the wasm stack, not the heap, and are never nullable by default.

```
I32  U32  I64  U64   // integers
M32  M64  M128       // masks — like integers but only bitwise/comparison ops are valid
F32  F64             // floats
V128                 // SIMD
Bool                 // boolean
```

Reference types: `Externref`, `I31`, `Array[T]`, `Str`, structs and enums, function pointers `fun(T1, T2) R`, closures `cl(T1, T2) R`.

Nullable: prefix with `?` — e.g. `?T1`, `?I32`.

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

// logical (not overloadable — always Bool operands)
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

// Array is auto-imported from std:Array
Array[I32].new(10)

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

// for / while (for loop captures are always I64) (support labels)
for (0 ... 10) |i| { ... }     // inclusive
for (0 ..< 10) |i| { ... }     // exclusive
while (cond) { ... }

// bind (let)
let x: I32 = expr

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
I32.clz(x)        // count leading zeros — I32, U32, I64, U64
I32.ctz(x)        // count trailing zeros
F32.sqrt(x)       // sqrt, floor, ceil, etc.
Str.char(n)       // construct single-char string from code point
I31.get(x)        // I31 ref unbox
T1.null           // null reference for type T1
```

---

## Globals and escape

```
// global constant
let PI: F64 = 3.14159;

// DSL expressions — @name/\ body \/
// builtins: @es (JavaScript), @utu (utu source), @ir (raw IR xml), @wat (WAT)
// body is raw text handed to the named DSL module at compile time
let foo: fun(I32, Str) F64 = @es/\ return a + b \/;
let value: F64 = @utu/\ some.utu.expr \/;
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
