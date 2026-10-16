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

## Integer enums

`enum(Repr) Name:` declares field-less variants that are small integers, stored
as `Repr` (`U8 I8 U16 I16 I32 U32`). Values count up from 0, or from the previous
explicit `= n`.

```
enum(U8) Tag:
    | Leaf
    | Unary
    | Eof = 255

let t: Tag = Tag.Leaf;
match t { Tag.Leaf => 1, Tag.Unary => 2, Tag.Eof => 3, };   // exhaustive without ~>
loop match t { Tag.Leaf => { continue Tag.Unary; }, ~> { break; }, };
t.to_i32();  Tag.from_i32(1);  Tag.count();  Tag.name(t);    // == != < <= > >= compare values
```

A `Tag` is not an `I32`. Integer enums can be stored in a `mem` and dispatch
through `match` and `loop match` (`alt` is for enums whose variants carry data).

---

## Distinct types

`type Name = distinct Base;` is a new type with `Base`'s representation and
comparisons (`I32 U32 I64 U64 F32 F64`). It converts only explicitly:

```
type NodeId = distinct I32;
let id = NodeId.from_i32(3);
id.to_i32();
mem lhs: NodeId;            // stored as I32
```

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

## Multiple results (tuples)

A function returns several values with a tuple type, and a caller takes them
apart with `let .{…}`:

```
fn divmod(a: I32, b: I32) .{I32, I32} {
    .{a / b, a % b};
}
let .{q, r} = divmod(17, 5);
```

Tuples are wasm multi-value results: no allocation, no boxing. A tuple type is
only a function (or `fun`) result. Tuples cannot be parameters, struct fields,
array elements, nested in another tuple, or returned by a `cl` (a JS
function). `let .{…}` names every value.

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
>
> A closure (`cl`) does not await: it is a host function (so JS can call it),
> and JSPI cannot suspend a stack through JavaScript frames. An `await` in a
> closure's body is an error; await in a function, and pass it as a `fun`
> value where one is wanted (a `fun` is called inside wasm, and may await). A
> closure that calls a function that awaits fails when it runs.

### Streams

`Stream[T]` (std:Stream, in the prelude) is a real JavaScript async iterable,
held as an externref, as `Promise[T]` is a real promise. `await for` reads one:

```
fn total(s: Stream[I32]) I32 {
    let sum = 0;
    await for (s) |v| { sum += v; };
    sum;
}
```

The loop suspends at each value, as `await` does (so it needs JSPI too).
`continue` goes on to the next value; `break` or `return` ends the loop and
closes the stream (its iterator's `return`, awaited), as JS's `for await`
does. It is

```
let it = s.iterator(); defer s.close(it);
while (true) { let r = await s.next(it); if s.done(r) { break; }; let v = s.value(r); body; };
```

so any type with those methods can be read the same way (`next` returns a
promise, `done` a `Bool`). As with any `defer`, an exception thrown out of
the body does not close the stream. A stream is read once: reading it again
gives nothing.

Streams are made and changed by std:Stream; each change is a new stream that
reads the old one as it is read:

```
Stream[I32].of([1, 2, 3])                  // an array's values
Stream[I32].generate(10, cl(i) { i * i; })  // count values, each made from its index
s.take(n)  s.skip(n)  s.filter(cl(v) { … })  s.map(cl(v) { … })  s.chain(other)
Stream[Str].from_js(lines)                  // a host async iterable, its values typed
```

A stream utu returns to JS is the async iterable itself (`for await (const v
of exports.numbers())`). A host value that is async iterable (an async
generator, a `ReadableStream`, a Node stream) is adopted with `from_js`, which
names the type of its values.

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
`x is ${x}`                   // template string: see below
true  false  null
```

A `\\` line is text to the end of its line, so the statement's `;` goes on
a line of its own after the last one (a `;` on a `\\` line is text):

```
let usage = \\usage: utu check <file.utu>
            \\       utu run <file.utu>
;
```

```
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

// match (on scalars: integers, floats, Bool)
// Patterns are literals of the scrutinee's type; numeric patterns may be
// negative. Out-of-range, wrong-kind, and duplicate patterns are errors.
match expr {
    -1 => ...,
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
for (xs) |x| { ... }           // each element of an array (evaluated once)
for (xs, 0 ..< n) |x, i| { ... } // zipped sources stop at the shortest
while (cond) { ... }
break                          // leave the innermost loop
continue                       // next iteration of the innermost loop

// loop match: a state machine with computed-goto dispatch (Zig's labeled switch)
loop match state {
    0 => { ...; continue 1; },     // re-dispatch on the new state
    1 => { ...; break; },          // leave the loop
    ~> { ... },                    // an arm that finishes also leaves
};
// Each `continue <state>` site has its own dispatch: a direct branch for a
// constant later state, otherwise a br_table at that site, so every transition
// is predicted separately. Order arms so hot transitions point forward; -O3
// emits the arms twice so that nearly every edge is forward. Plain `continue`
// inside a loop match is an error (name the next state); `break` leaves it.
// Measurements: benchmarks/control-flow/README.md.

// generators: `yield T` as the return type; consumed by for / await for
fn squares(n: I32) yield I32 {
    for (0 ..< n) |i| { yield i * i; };
}
for (squares(10)) |x| { ... };
await for (ticks()) |t| { ... };   // the generator body may `await`
await for (stream) |v| { ... };    // a Stream[T]'s values (see Streams)
// The body expands inline at the consuming loop: in the loop body, `break`
// ends the generation and `continue` resumes after the current yield; in the
// generator, `return;` ends it. Generators are not values (they cannot be
// stored or passed); that is a compile-time error.

// recursive generators: a generator may delegate to itself, and nothing else:
// `for (walk(c)) |d| { yield d; }`. It runs as one loop over an explicit stack,
// so values arrive depth-first with no call per node and no depth limit.
fn walk(n: Node) yield Node {
    for (children(n)) |c| { yield c; for (walk(c)) |d| { yield d; }; };
}
for (walk(root)) |n| {
    if is_function(n) { prune; };  // do not descend below n
    ...
};
// `prune;` skips the delegations after the current value's yield, up to the
// next yield of the same call; the rest of the body still runs. One call's
// body runs to completion before its values reach the consumer, so the
// generator's own effects happen earlier than inline expansion would order
// them. Generators that recurse through each other remain an error.

// defer: run when the enclosing block exits — by reaching its end, return,
// break, or continue — in reverse order of registration. A block's value and
// a return value are computed first. Deferred code cannot itself return,
// break, or continue out of the block. It does not run on traps.
{
    defer close(handle);
    use(handle);
}

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

## Template strings

```
`Hello, ${name}! You are ${age} years old.`
```

A template string is text between backticks, with `${expr}` wherever a value
goes. It is a `Str`: its pieces joined with `+`, left to right, where each
`${expr}` is `expr.to_str()` and text is a string literal. So the example is

```
"Hello, " + name.to_str() + "! You are " + age.to_str() + " years old."
```

Empty text is left out (`${x}` alone is `x.to_str()`, ` `` ` is `""`).

- `I32`, `U32`, `I64`, `U64`, `F32`, `F64` and `Bool` have `to_str` (as
  JavaScript's `String()` writes them; an `F32` as the shortest decimal
  that reads back as the same `F32`, so `0.1` and not `0.10000000149…`),
  and so does `Str` (the string itself, at no cost). A type takes part by
  having one, as `x.to_str()` would call it: `fn Point.to_str |self| () Str { ... }`.
- A value with no `to_str` is an error at its `${…}`: `Unknown method
  'P.to_str'`. A nullable one is too; unwrap it first (`${x orelse "none"}`).
- Any expression fits in `${…}`, braces, blocks and other template strings
  included.
- The text may span lines (a line break is as the file has it). Escapes are
  a string's: `\n`, `\t`, `\r`, `\b`, `\f`, `\uXXXX` (four hexadecimal
  digits, or it is an error), and `\c` for any other c is c (so `` \` ``,
  `\$`, `\"`, `\\`). A `$` not followed by `{` is text (`$5`), and `\${` is
  the text `${`.

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

## Memory arrays (`mem`)

A top-level `mem` declares a resizable array of scalars that is its own wasm
linear memory (multi-memory). It is for bulk data that a hot loop reads: source
bytes, lexer tables, flat IR columns, buffers handed to the host.

```
mem src: U8;            // one linear memory, starts empty
mem node_lhs: I32;
export mem pixels: F32; // also exported to the host as "pixels"

src.push(b);            // append, growing the memory when full
let c = src[i];         // read: U8/I8/U16/I16 widen to I32
src[i] = c;             // write: narrow kinds keep the low bits
src[i] += 1;            // compound assignment evaluates i once
src.len();  src.cap();  // elements in use / that fit without growing
src.reserve(n);         // make n elements fit
src.resize(n);          // reserve(n), then len = n (contents are kept)
src.clear();            // len = 0
```

Element kinds: `U8 I8 U16 I16 I32 U32 I64 U64 F32 F64`, an integer enum (stored
as its declared integer), or a distinct type (stored as its base). Element `i` is at byte
`i * size` of its own memory, so a read is one load with no base pointer.
Reads and writes are **not** checked against `len`: an index past the end of the
memory traps, and anything below it is an ordinary load or store. Memories only
grow (doubling), up to 4 GiB each.

An initializer fills a mem when the module is instantiated, from a data
segment, and sets its length:

```
const mem prec: U8 = [0, 1, 1, 2];                // number literals
mem props: U16 = @embed/\ tables/props.bin \/;    // a file's bytes, beside the source
const mem dfa: U8 = @comptime/\ build_dfa() \/;   // runs during compilation
```

`@comptime` compiles a copy of the entry file (without its exports, tests, and
other `@comptime` mems), evaluates the expression to an `Array` of the element's
value type (`Array[I32]` for the narrow kinds), and embeds the result. A
`const mem` rejects writes, `push`, `reserve`, `resize`, `clear`, and `copy_in`.

The host reaches a mem through two methods; a mem that uses either is created by
the host and imported:

```
using JS from std:JS;                  // view() needs it, under any alias
src.copy_in(Fs.readFileSync(path));    // ArrayBuffer, typed array, or string (UTF-8); len = elements copied
Fs.writeSync(1.0, out.view(0, out.len()));   // a JS.Uint8Array over the elements, no copy
```

A view is a `JS.Uint8Array`, `JS.Float32Array`, and so on for the element kind,
and stops seeing the memory once the mem grows.

A byte mem (`U8`, `I8`) interns spans of itself in place, without copying:

```
let id = src.intern(start, stop);   // dense id (0, 1, …) of the bytes src[start ..< stop)
src.interned();                     // distinct spans so far
src.interned_start(id);             // where that id's first span starts
src.interned_size(id);              // and its length
src.intern_reset();                 // forget every id
```

The same bytes always get the same id. Ids refer to spans of the mem, so those
bytes must stay where they are. To intern text that is not in the mem, push it
first.

A `mem` is not a value: it cannot be stored, passed, or returned, and a local
or parameter of the same name hides it. Only top-level declarations are
allowed, because each one is a memory of the module, and a module has at most
100 memories (the JS API's limit): a program with more mems does not compile.
Declare the others as `vec`. The host reads and writes
an `export mem` through its `ArrayBuffer` (for example `TextEncoder.encodeInto`),
re-creating views after the memory grows. Measurements:
`benchmarks/control-flow/README.md`.

---

## Growable arrays (`vec`)

A top-level `vec` is the same array as a `mem`, held in a WasmGC array instead
of a memory. A program may declare any number; the host cannot see one.

```
vec node_kind: U8;                     // an array, starts empty
const vec dfa: U8 = @comptime/\ build_dfa() \/;
```

It has a mem's element kinds, initializers, methods, and `const`, except
`copy_in` and `view`, and it is never exported. Element `i` is `array[i]`.
Its capacity (`cap()`) is the array's length: its initial contents' count,
and when it must grow, the larger of what is needed and twice what it was
(the elements are copied to the new array). Wasm checks each access against
the capacity: past it, an access traps; past `len()` but within it, an
access reads or writes whatever is there.

An index or stored value is evaluated before the array is read, so
`v[f()] = g()` reaches the array as `f` and `g` left it, though they push to `v`.

---

## Globals and escape

```
// global constant
let PI: F64 = 3.14159;

// DSL expressions — @name/\ body \/
// builtins: @es (JavaScript), @utu (utu source), @ir (raw IR xml), @wat (WAT, below)
// body is raw text handed to the named DSL module at compile time
let foo: fun(I32, Str) F64 = @es/\ return a + b \/;
let value: F64 = @utu/\ some.utu.expr \/;
```

---

### WebAssembly text (`@wat`)

A function whose whole body is `@wat/\ … \/` is written in WebAssembly text:

```
fn rotl(x: I32, k: I32) I32 {
    @wat/\ local.get $x local.get $k i32.rotl \/;
}

fn triangle(n: I32) I32 {
    @wat/\
        (local $acc i32) (local $i i32)
        (block $done
          (loop $next
            (br_if $done (i32.gt_s (local.get $i) (local.get $n)))
            (local.set $acc (i32.add (local.get $acc) (local.get $i)))
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $next)))
        local.get $acc
    \/;
}
```

- The parameters are locals, named as in utu (`$x`) or numbered; `(local …)`
  declarations come first. Instructions are flat or folded, as in any WAT.
- It takes and returns `I32`, `U32`, `I64`, `U64`, `F32`, `F64`, `Bool`,
  `M32`, `M64` (each `i32`, `i64`, `f32` or `f64`), or `V128`, `M128`
  (`v128`), written out (not a module's type parameter), and is a plain
  function (no `|self|`, not a generator); `export main` may be one. A
  `Bool` it returns is 0 or 1: the code is trusted to leave one.
- Every numeric and vector instruction, constants, locals, `block`, `loop`,
  `if`/`else`, `br`, `br_if`, `br_table`, `return`, `select`, `drop`,
  `unreachable`, `nop`. A @wat function computes on its arguments: it has no
  memories, globals, calls or references. A block has at most one result
  (no `(param …)`, no `(type …)`: those would need types in the module).
- Numbers are written as WAT writes them (`0xff`, `1_000`, `0x1.8p3`,
  `nan:0x200000`); a float is rounded once, to the nearest, and one beyond
  its type's range is a mistake.
- It is checked as the engine checks it (each instruction's operand types,
  labels, what the body leaves), and a mistake is reported at its place in
  the text: `i64.add needs an i64, not an i32`.
- The function is the code written, in the module as written; calls to it
  are calls.

The assembler (src/wat/assemble.js) runs in the compiler's host, not in the
compiler: the self-hosted compiler finds the @wat functions, its driver
assembles them, and the compiler puts the code in the module.

---

## Doc comments

```
//! Plane geometry: *points* and the distances between them.

/// The Euclidean distance between `a` and `b`:
/// $ d(a, b) = sqrt((a_x - b_x)^2 + (a_y - b_y)^2) $
/// See @Point.
fn distance(a: Point, b: Point) F64 { … }
```

`///` lines just before a declaration (a function, type, field, variant,
module, global, …) document it; `//!` lines at the top of a file document
the file. Their text is [Typst](https://typst.app) markup: `*strong*`,
`_emphasis_`, `` `code` ``, lists, `$math$`, `#link("…")[…]`; `@Name`
refers to the declaration named so.

`tools/utudoc/utudoc.mjs <paths…> -o docs.pdf` typesets a codebase from
them, with each declaration's signature colored as the compiler reads it
and its names linked to their declarations; its contents list what is
documented. The editor shows them on hover, as Markdown. The self-hosted
compiler is documented so: `bun run build --docs` writes `dist/compiler.pdf`.

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
