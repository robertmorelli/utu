# Utu Language Spec (v2)

---

## Top-level forms

```
// library of reusable declarations
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
- `export lib` is a codegen annotation surface. It contains only functions.
- `export lib` does not create any importable Utu interface. It only marks enclosed functions for Wasm export to JS.
- `export main` and `export lib` are mutually exclusive in one entry file.

---

## Nominal type qualifiers

Nominal qualifiers prefix struct and enum declarations. They can be combined.

```
nom[tag]
nom[rec]
nom[tag, rec]
```

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
nom[tag] struct T1[P1, P2]:
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
nom[tag] enum Color:
    | Red
    | Green
    | Blue

nom[tag] enum Result[P1]:
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
```

---

## Modules

Modules are parameterized by types or protocols. Inside a module, `&` refers to the promoted type — the type that the module defines or exposes as its primary interface (inspired by `&` in nested CSS).
Modules are the unit of importing as well as the only unit of type parameterization
Modules do not nest.

```
// module parameterized by concrete types
mod M1[T1, T2] {
    proto &:
        | get a : i32
        | set b : f64
        | get set c : f32
        | foo(T1) T2

    nom[tag] struct T3[&]:
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
    nom[tag] struct &[]:
        | first  : P1
        | second : P2

    fn add(a: &, b: &) & {
        return .{
            first  = a.first.combine(b.first)
            second = a.second.combine(b.second)
        };
    }
}
```

Rules:
- A `mod` body may contain structs, protocols, enums, functions, globals, tests, and benches.
- A `mod` body may not contain another `mod`.

---

## Using (imports and aliases)

`using` brings a module into scope. `from "..."` is required for cross-file imports. Without `from`, it creates a within-file alias.

```
// cross-file import
using M1 from "...";

// cross-file import with alias
using M1 |M2| from "...";

// cross-file import, instantiated with type args, aliased
using M1[i32, f64] |NumMap| from "...";

// within-file alias
using M1 |M2|;

// within-file instantiation with alias
using M1[i32, f64] |NumMap|;
```

---

## Scalar types

```
i32  u32  i64  u64   // integers
m32  m64  m128       // masks — like integers but only bitwise/comparison ops are valid
f32  f64             // floats
v128                 // SIMD
bool                 // boolean
```

Reference types: `externref`, `i31`, `array[T]`, `str` (which is just an externref with special treatment), struct made by using `struct` and `enum`, functions with the syntax `.(...) -> ...`

Nullable: prefix with `?` — e.g. `?T1`, `?i32`
---

## Operators

```
// arithmetic (+ also concatenates str)
+  -  *  /  %

// bitwise
&  |  ^  ~  <<  >>  >>>

// comparison
==  !=  <  >  <=  >=

// logical
and  or  not xor

// null fallback (else)
\

// pipe
-o

// assignment
=  +=  -=  *=  /=  %=  &=  |=  ^=  <<=  >>=  >>>=  and=  or= xor=
```

Precedence (high to low): `^` · `* / %` · `+ -` · `<< >> >>>` · `&` · `|` · `== != < > <= >=` · `and` · `xor` · `or` · `\` · `-o`

---

## Expressions

```
// literals
42        0xff      0b1010    // int
0xff      0b1010              // mask
3.14      1.0e-9              // float
"hello"                       // string
\\multiline                   // multiline string (each line prefixed \\)
true  false  null

// tuple
.{a, b, c}

// struct init
T1 { field1: 10, field2: x }

// implicit struct init only for simple assignments
let t1: T1 = &{ field1: 10, field2: x };


// array
array[i32].new(10)

// field access and length
expr.field
s.len             // works on str and array
a[i]              // index
a[start, end]     // slice — works on str and array

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

// for / while (note that for loop captures are always i64) (these also support labels)
for (0 ... 10) |i| { ... }     // inclusive
for (0 ..< 10) |i| { ... }     // exclusive
while (cond) { ... }

// bind (let)
let x: i32 = expr

// pipe
expr -o foo
expr -o foo(&, extra)

// assert / fatal
assert cond
fatal

// break (from loop or block with optional label)
break

// labeled block
label: { ... }
```

---

## Builtin namespaces

Builtin types expose static methods via dot syntax. These are not user-definable.

```
i32.clz(x)        // numeric ops — i32, u32, i64, u64, f32, f64
str.char(n)       // construct single-char string from code point
array[T].new(n)   // array ops
i31.get(x)        // i31 ref ops
T1.null           // null reference for type T1
```

---

## Globals and escape

```
// global constant
let PI: f64 = 3.14159;

// DSL expressions — @name\| body |/
// builtins: @es (JavaScript), @utu (utu source), @wat (WAT)
// body is raw text handed to the named DSL module at compile time
let foo: .(i32, str) -> i32 = @es\| return a + b |/;
let value: f64 = @utu\| some.utu.expr |/;
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
