= Utu Language Specification

*A WasmGC-Native Language Specification*

_Named after the Sumerian sun god of truth and justice._

Language Specification — Draft — March 2026

This Typst document is the canonical language specification. It consolidates
the current topic-oriented chapters into a single file so the full draft can be
reviewed and built from one place.

#pagebreak()

= Overview And Type System

== Overview

Utu is a statically typed, garbage collected language that compiles directly
to WebAssembly GC. The design goal is to stay close to the Wasm instruction
set: language constructs are chosen so they lower 1:1, or close to 1:1, into
structured control flow, GC heap types, and multi-value returns.

The key design principles from the spec are:

- direct lowering to WasmGC primitives
- explicit data flow through pipes and local bindings
- structured control flow that mirrors Wasm blocks and loops
- host-backed strings with explicit helper imports instead of implicit string builtins
- structured error and nullable results without hidden exceptions
- null safety derived from non-nullable Wasm reference types
- immutable struct fields by default, with `mut` opt-in

The implemented surface covered by the compiler, examples, and tests includes:

- strings, globals, structs, tagged structs, arrays, sum types, nullable references, and multi-value returns
- `if`, `while`, single-range `for`, labeled blocks with `emit`, `match`, `alt`, `promote`, `assert`, `fatal`, and pipe expressions
- host imports via `shimport` and inline JS helpers via `escape`
- compile-time modules via `mod`, `construct` aliases, open constructs, qualified type paths, associated functions, and method-call sugar
- top-level `proto` declarations as syntax for table-backed `call_indirect` over tagged receivers, including methods, getters, setters, and explicit protocol calls
- top-level `test` and `bench` declarations with `setup { ... measure { ... } }`
- WasmGC reference builtins such as `ref.null`, `ref.is_null`, `ref.as_non_null`, `ref.eq`, `ref.cast`, `ref.test`, and `i31`

Notable current limits:

- module bodies do not support nested `export` declarations in v1
- `proto` declarations and protocol implementations remain top-level only in v1
- the parser accepts comma-separated `for` sources and captures, but current lowering only uses the first pair
- `fun(A) B` function-reference syntax is parsed, but not yet supported as a stable end-to-end compiler feature

The naming convention is intentionally simple:

- types use `CapitalCamel`, such as `Vec2`, `ApiError`, and `Todo`
- functions and variables use `snake_case`, such as `new_todo` and
  `console_log`

== Data Flow And Binding

Utu keeps data flow explicit without a separate ownership system. Inline
expressions can feed directly into `-o` pipelines, while `let` introduces a
stable local name when a value needs to be reused or inspected later.

That produces a straightforward style:

- pipelines keep one-off transformations compact
- `let` makes reuse and mutation explicit
- multi-value returns stay close to Wasm's stack machine instead of forcing
  tuple boxing

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
- `externref` is an opaque host reference
- `anyref` is the top of the GC hierarchy
- `i31` maps to `i31ref`
- `eqref` is used for structurally comparable references

The `fun(A) B` surface is reserved for planned first-class function references.
The parser understands that syntax, but the current compiler does not yet
support function references end to end as part of the stable subset.

All reference types are non-nullable by default. Nullable references are
spelled as `?T`, which lowers to a nullable Wasm reference like
`(ref null $T)`.

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
    mut left: ?Node,
    mut right: ?Node,
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

== Tagged Structs

`tag struct` is the current opt-in surface for structs that participate in
table-backed protocol dispatch. Tagged structs behave like ordinary structs in
source code, but the compiler prepends a hidden `__tag: i32` field that user
code cannot declare directly. That hidden tag is what indexes protocol tables.

```utu
tag struct Box {
    width: i32,
    height: i32,
}
```

Use `tag struct` when a type needs to satisfy a `proto`. Ordinary structs stay
leaner and do not carry the hidden dispatch tag.

== Sum Types: Enums

Sum types use `|`. The compiler models them as a common supertype plus one
subtype per variant, and pattern matching becomes a `br_on_cast` chain.

```utu
type Shape =
    | Circle { radius: f32 }
    | Rect { w: f32, h: f32 }
    | Triangle { a: f32, b: f32, c: f32 };
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

== Modules And Constructs

`mod` declares a compile-time namespace/template rather than a runtime Wasm
module. Parameterized modules instantiate concrete namespaces before lowering,
so names like `math.Pair` and `boxy[i32].Box` are part of the stable surface
today.

```utu
mod cell[T] {
    struct Cell {
        value: T,
    }

    fun Cell.new(value: T) Cell {
        Cell { value: value };
    }

    fun Cell.get(self: Cell) T {
        self.value;
    }
}

construct ints = cell[i32];
construct cell[i32];
```

The two `construct` forms serve different purposes:

- `construct name = module[args];` creates a qualified alias such as `ints.Cell`
- `construct module[args];` opens the instantiated module into the current scope

Associated functions continue to use `Owner.member(...)` syntax, and method-call
sugar works for values whose associated member can be resolved unambiguously.

== Protocols

Protocols are Utu's table-backed `call_indirect` surface for tagged receivers.
They do not introduce a second hidden object model. A protocol member is the
source-language name for a Wasm table entry plus an indirect call through that
member's dedicated table. This syntax must produce this structure and only this
structure in Wasm.

```utu
proto Measure[T] {
    measure(T) i32,
};

proto Area[T] {
    get area: i32,
};

proto CounterOps[T] {
    get value: i32,
    set value: i32,
};

tag struct Box {
    width: i32,
    height: i32,
}

tag struct Rect {
    area: i32,
}

fun Measure.measure(self: Box) i32 {
    self.width * self.height;
}
```

Key v1 rules:

- protocols are declared at top level
- a protocol currently declares exactly one type parameter, and method members
  may use it only as the first parameter
- concrete protocol implementations live on tagged receiver types
- `get` and `set` members are still protocol entries: they get their own tables
  and are invoked through `call_indirect`
- current field-backed synthesis only supplies the thunk body automatically;
  it does not change what a protocol member is
- `box.measure()` works when unambiguous, while `Measure.measure(box)` is always
  available as the explicit form

Lowering uses one dispatch table per protocol member, getter, and setter. A
protocol use means tag-indexed `call_indirect` through that member's table.
This contract is absolute: this syntax must produce this structure and only
this structure in Wasm. If the compiler lowers a protocol path to something
else, that is a bug in the lowering rather than an alternate protocol
semantics.

== Structured Error Results, Nullability, And `\`

The `#` operator expresses a structured two-result convention: one position is
for success and one is for the alternate result. In practice, this is Utu's
typed error-return surface.

```utu
fun divide(a: i32, b: i32) i32 # DivError {
    fatal;
}
```

The Wasm signature becomes a multi-value return with complementary nullability:

```wasm
(func $divide (param i32 i32)
    (result (ref null $i32_box) (ref null $DivError)))
```

The contract is semantic rather than structural: exactly one result should be
non-null at runtime.

The same `A # B` spelling is used on ES host imports:

```utu
shimport "es" fetch(str) ?Response;
shimport "es" fetch(str) Response # ApiError;
```

Those imports still lower to direct Wasm multi-value signatures. The source
language keeps the error and nullable cases explicit instead of introducing
hidden exceptions.

Nullable references use a prefix `?`:

- `?T` means a nullable `T`
- there is no separate optional type syntax

The current compiler supports both force unwrap and fallback on nullable
references:

```utu
let val: Thing = get_thing() \ fatal;
let cached: Response = fetch(url) \ cached_response;
let data: Response = fetch(url) \ fatal;
```

- `expr \ fatal` force unwraps and traps on null
- `expr \ fallback` evaluates `fallback` only when the left side is null

The force-unwrap compiled form is direct:

```wasm
(call $expr)
ref.as_non_null
```

== Multi-Value Return

Comma-separated returns let functions produce multiple values directly, which
maps naturally onto Wasm multi-value returns.

```utu
fun divmod(a: i32, b: i32) i32, i32 {
    (a / b, a % b);
}

let q: i32, r: i32 = divmod(10, 3);
```

Unlike `#`, a multi-value return does not represent alternatives. Every component is
present, non-null when it is a reference, and available simultaneously.

#pagebreak()

= Strings And Memory

== Strings

Strings are host-backed `externref` values. In user-facing terms, `str`
behaves like a first-class string type. UTU does not assume a built-in string
method surface; string operations should be provided explicitly through
`escape` declarations or regular host imports.

== String Literals

Single-line string literals use double quotes:

```utu
let greeting: str = "hello world";
```

Multi-line strings use Zig-style `\\` prefixes on each line:

```utu
let multiline: str =
    \\this is a multi-line
    \\string literal in utu
    \\each line starts with \\;
```

The compiler concatenates those lines at compile time and inserts newline
characters between them.

== String Processing Strategy

The spec recommends making string behavior explicit at the boundary where you
need it. For lightweight helpers, define them inline with `escape`:

```utu
escape |(a, b) => a + b| str_concat(str, str) str;

let msg: str = "hello" -o str_concat(_, ", ") -o str_concat(_, "world");
```

For heavier text processing, prefer explicit host imports or array-oriented
data structures rather than assuming a built-in string runtime surface.

== GC-Only Memory Model

Utu uses WasmGC for all heap allocation. There is no linear memory allocator,
no bundled runtime, and no user-visible `malloc`/`free` model.

Values therefore fall into two groups:

- scalars that live on the Wasm value stack
- GC-managed heap objects such as structs, arrays, and `i31ref`

The consequences called out in the spec are:

- memory management is delegated to the engine's generational and compacting GC
- classic manual-lifetime bugs such as use-after-free and double-free disappear
- bundles stay small because the output contains compiled logic rather than a
  separate runtime system
- engines can still apply escape analysis and scalar replacement, so small
  objects may never materialize as heap allocations

== Struct Allocation

Constructing a struct lowers directly to `struct.new`:

```utu
let pos: Vec2 = Vec2 { x: 1.0, y: 2.0 };
```

```wasm
(struct.new $Vec2 (f32.const 1.0) (f32.const 2.0))
```

== Array Allocation And Access

Arrays are first-class GC objects with mutable elements. The spec exposes the
core allocation patterns directly:

```utu
let buf: array[i32] = array[i32].new(1024, 0);
let data: array[f32] = array[f32].new_fixed(1.0, 2.0, 3.0);

let val: f32 = data[0];
data[0] = 42;
let len: i32 = array.len(data);
```

The corresponding Wasm operations are:

- `array.new` for fixed-size allocation with an initializer
- `array.new_fixed` for literal element lists
- `array.get` for reads
- `array.set` for writes
- `array.len` for length queries

The design is intentionally explicit: Utu does not hide WasmGC arrays behind a
separate collection framework.

#pagebreak()

= Control Flow, Functions, And Interop

== Structured Control Flow

The spec makes a strong promise: every control-flow form is designed to lower
directly into Wasm structured control flow. There is no large "desugaring gap"
between source and emitted code.

== Conditionals

`if` is an expression, not just a statement. That allows Rust-style value
selection:

```utu
let max: i32 = if a > b { a; } else { b; };
```

At the Wasm level this is a plain `if` with a result type.

== Loops

Utu uses range `for` loops and condition-style `while` loops:

```utu
for (0..n) |i| {
    sum = sum + i;
};

while (cond()) {
    body();
};

while () {
    if done() { break; };
};
```

The loop forms cover:

- counted loops over a single range
- while-style loops where the header expression is the condition
- infinite loops using empty parentheses

The parser accepts comma-separated sources and captures, but current lowering
only uses the first source/capture pair. The docs therefore describe the
single-range form that the compiler emits today.

The counted form lowers to the canonical Wasm `block` plus `loop` shape:

```wasm
(local $i i32)
(local.set $i (i32.const 0))
(block $break
    (loop $continue
        (br_if $break (i32.ge_s (local.get $i) (local.get $n)))
        ;; body
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $continue)))
```

== Blocks With Return

Labeled blocks evaluate to values. `emit expr` exits the current labeled block
early and supplies the resulting value, while plain `break` exits loops.

```utu
let result: i32 = compute: {
    if shortcut() {
        emit 42;
    };
    expensive_calculation();
};
```

This maps naturally to a Wasm `block` with a result type and `br` targeting the
label.

== Match, Alt, And Exhaustiveness

Scalar `match` handles literal cases. Type-based `alt` lowers to a sequence
of `br_on_cast` checks.

```utu
alt shape {
    s: Circle => area_circle(s),
    s: Rect => area_rect(s),
    s: Triangle => area_tri(s),
};
```

The type-based case is important because it shows how Utu leans on WasmGC's
runtime type system instead of encoding a separate tag byte.

Non-exhaustive `alt` expressions trap through `fatal`.

== Fatal

`fatal` is the source-level spelling that lowers to the Wasm `unreachable`
instruction. The spec uses it for explicit traps, impossible control-flow
paths, exhaustive match fallthrough, and force-unwrap failure.

== Assert

`assert` is a statement-like expression that traps when its condition is false:

```utu
assert value != null;
assert add(2, 2) == 4;
```

The lowering is direct: evaluate the condition as `i32`, invert it, and emit a
no-result Wasm `if` that executes `unreachable` on failure.

== Function Definitions

Function syntax keeps parameters in parentheses and places the return type
immediately after the parameter list:

```utu
fun add(a: i32, b: i32) i32 {
    a + b;
}

fun clamp(val: f32, lo: f32, hi: f32) f32 {
    if val < lo { lo; }
    else if val > hi { hi; }
    else { val; };
}

fun check(value: bool) void {
    assert value;
}
```

Important conventions:

- the last expression is the implicit return value
- void functions write `void` explicitly
- parameters are unrestricted because they are already named bindings

== Pipe Operator

The `-o` operator is Utu's core pipe surface. It feeds the value on the left
into the function on the right.

Single-argument pipelines stay minimal:

```utu
a -o f -o g;
```

That means the same thing as `g(f(a))`.

Multi-argument pipelines use `_` to mark the slot receiving the piped value.
A pipe target may contain at most one `_`:

```utu
a
-o f
-o z(_, c, d);

x -o clamp(0.0, _, 1.0);
```

This is syntactic sugar only. Lowering turns pipes into ordinary function
calls, which keeps the compiler simple and the runtime model transparent.

== Bindings

`let` introduces reusable names and always requires an explicit type
annotation.

```utu
let config: Config = load_config();
init(config);
validate(config);

load_config() -o init;

let q: i32, r: i32 = divmod(10, 3);
```

The discipline is:

- use `let` when a value must be reused or named
- prefer pipes and inline expressions for single-use values
- destructure multi-value returns directly in the binding list

== Imports

Host imports use `shimport "<module>" ...`:

```utu
shimport "es" console_log(str) void;
shimport "es" fetch(str) ?Response;
shimport "es" fetch(str) Response # ApiError;
shimport "es" document: externref;
shimport "node:path" basename(str) str;
```

== Exports

Wasm exports are ordinary functions marked with `export`:

```utu
export fun main() void {
    "hello world" -o console_log;
}
```

== In-Source Tests And Benchmarks

The language also supports top-level `test` and `bench` items:

```utu
test "adds two numbers" {
    assert add(2, 2) == 4;
}

bench "sum loop" {
    setup {
        let total: i32 = 0;
        measure {
            total = total + 1;
        }
    }
}
```

Normal program compilation ignores these declarations. Test mode synthesizes
zero-argument exports, while bench mode synthesizes one exported function per
benchmark that takes an `i32` iteration count. `setup` runs once per exported
invocation, and `measure` runs inside the generated timing loop. The host runs
those exports ephemerally and reports failures or timing.

== Polymorphic Dispatch

The language does not bake in a hidden object model. Current compiler support
keeps dispatch explicit in two different ways:

- `alt` lowers sum-type and subtype dispatch through `br_on_cast`
- `proto` lowers protocol members through tables and `call_indirect`; a protocol member is literally a table-backed indirect call surface

`alt` is the right surface when a value already has a shared sum type.
Protocols are the right surface when separate tagged structs should share one
member contract without first being wrapped in a single sum type.

=== Future Work

First-class function references and `call_ref`-based dispatch are still
planned rather than implemented end to end today.

#pagebreak()

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
- `ref.eq(a, b)` -> `ref.eq`
- `ref.cast(val, T)` -> `ref.cast (ref $T)`
- `ref.test(val, T)` -> `ref.test (ref $T)`
- `i31.new(val)` -> `ref.i31`
- `i31.get_s(val)` -> `i31.get_s`
- `i31.get_u(val)` -> `i31.get_u`
- `extern.convert(val)` -> `extern.convert_any`
- `any.convert(val)` -> `any.convert_extern`

== Numeric Operations

Numeric support is currently exposed through operators rather than numeric
namespace builtins:

- arithmetic: `+`, `-`, `*`, `/`, `%`
- bitwise: `&`, `|`, `^`, `<<`, `>>`, `>>>`
- unary: `-`, `not`, `~`
- comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`

Numeric namespace helpers such as `f64.sqrt(...)`, `i32.wrap(...)`, and
`v128.*` are not implemented yet.

The spec also insists on symbol clarity:

- `#` is only the structured alternate-result marker at the type level
- `%` is always remainder
- `^` is always bitwise XOR
- `~` is always unary bitwise NOT

== Required Wasm Instructions

The compiler's minimum instruction surface is grouped by category.

=== Control Flow Instructions

- `block` for labeled blocks and block expressions
- `loop` for counted, condition, and infinite loops
- `if` and `else` for conditionals
- `br` for breaking out of a block or loop
- `br_if` for conditional exits
- `br_on_cast` for type-based pattern matching
- `br_on_non_null` for nullable fallback paths
- `call` for direct calls
- `unreachable` for lowered `fatal` traps and other impossible states

Planned first-class function references would add `call_ref`, but that is not
part of the current implemented instruction set.

=== GC Instructions

- `struct.new` for struct allocation
- `struct.get` for field access
- `struct.set` for mutable field writes
- `array.new` for array allocation with an initializer
- `array.new_fixed` for literal arrays
- `array.new_default` for zero-initialized arrays
- `array.get` for element access
- `array.set` for element writes
- `array.len` for length queries
- `array.copy` for bulk copying
- `array.fill` for bulk filling
- `ref.null` for null literals
- `ref.is_null` for null checks
- `ref.as_non_null` for assertions that trap on null
- `ref.eq` for reference equality
- `ref.cast` for checked downcasts
- `ref.test` for runtime type tests
- `ref.i31` for boxing an integer into `i31ref`
- `i31.get_s` and `i31.get_u` for unboxing
- `extern.convert_any` for anyref-to-externref conversion
- `any.convert_extern` for externref-to-anyref conversion

=== Variable Instructions

- `local.get`
- `local.set`
- `global.get`
- `global.set`

These cover named values, temporaries, and mutable globals.

=== Dispatch Support

- `table` definitions for protocol method, getter, and setter dispatch tables
- `elem` segments that populate those tables
- `call_indirect` for every protocol member invocation

These only appear when `proto` declarations are present.

=== Numeric Instructions

The current compiler uses the standard numeric families for `i32`, `i64`,
`f32`, and `f64` that back the source operators.

#pagebreak()

= Grammar And Compilation Model

== Grammar Overview

The grammar is presented in EBNF style. Whitespace is insignificant except
inside string literals, semicolons terminate expressions in blocks and simple
top-level declarations, and comments are line comments only.

=== Top-Level Items

```ebnf
program      ::= item*
item         ::= module_decl | construct_decl ';' | import_decl | export_decl
               | fn_decl | proto_decl ';' | type_decl ';' | struct_decl
               | global_decl ';' | jsgen_decl ';' | test_decl | bench_decl
```

The top level therefore supports modules, constructs, imports, exports,
functions, protocols, named sum types, structs, global `let` bindings, inline
JS helpers, and opt-in in-source tests and benchmarks.

=== Declarations

```ebnf
module_decl  ::= 'mod' module_name module_type_param_list? '{' module_item* '}'
module_item  ::= module_decl | construct_decl ';' | struct_decl | type_decl ';'
               | fn_decl | global_decl ';' | import_decl ';' | jsgen_decl ';'
               | test_decl | bench_decl
module_name  ::= IDENT | TYPE_IDENT
module_type_param_list ::= '[' TYPE_IDENT (',' TYPE_IDENT)* ','? ']'
module_type_arg_list   ::= '[' type (',' type)* ','? ']'

construct_decl ::= 'construct'
                   ( IDENT '=' )?
                   ( module_ref | instantiated_module_ref )
module_ref   ::= module_name
instantiated_module_ref ::= module_name module_type_arg_list

struct_decl  ::= 'rec'? 'tag'? 'struct' TYPE_IDENT '{' field_list? '}'
field_list   ::= field (',' field)* ','?
field        ::= 'mut'? IDENT ':' type

proto_decl   ::= 'proto' TYPE_IDENT module_type_param_list? '{' proto_member_list? '}'
proto_member_list ::= proto_member (',' proto_member)* ','?
proto_member ::= proto_method | proto_getter | proto_setter
proto_method ::= IDENT '(' type_list? ')' return_type
proto_getter ::= 'get' IDENT ':' type
proto_setter ::= 'set' IDENT ':' type

type_decl    ::= 'type' TYPE_IDENT '=' variant_list ';'
variant_list ::= '|'? variant ('|' variant)*
variant      ::= TYPE_IDENT ('{' field_list '}')?

fn_decl      ::= 'fun' (IDENT | TYPE_IDENT '.' IDENT) '(' param_list? ')' return_type block
param_list   ::= param (',' param)* ','?
param        ::= IDENT ':' type
return_type  ::= 'void'
               | type ('#' type)? (',' type ('#' type)?)*

global_decl  ::= 'let' IDENT ':' type '=' expr ';'
import_decl  ::= 'shimport' STRING
                  ( IDENT '(' import_param_list? ')' return_type
                  | IDENT ':' type )
                  ';'
import_param_list ::= import_param (',' import_param)* ','?
import_param ::= param | type
jsgen_decl   ::= 'escape' JSGEN IDENT '(' import_param_list? ')' return_type ';'
export_decl  ::= 'export' fn_decl
test_decl    ::= 'test' STRING block
bench_decl   ::= 'bench' STRING '{' setup_decl '}'
setup_decl   ::= 'setup' '{' (expr ';')* measure_decl '}'
measure_decl ::= 'measure' block
```

This section encodes a few core language choices:

- struct fields are declared inline with optional `mut`
- function return types are written directly after the parameter list
- `void` is written explicitly for functions with no result
- Host imports use `shimport "<module>" ...`
- `#` can appear inside the return-type grammar
- `export` wraps an ordinary function declaration rather than introducing a
  second export-only syntax

Module bodies reuse most declaration forms, but in the current v1 compiler
`export` declarations, `proto` declarations, and protocol implementations stay
top-level only.

=== Types

```ebnf
type         ::= '?' base_type | base_type
base_type    ::= scalar_type | ref_type | func_type | '(' type ')'

scalar_type  ::= 'i32' | 'u32' | 'i64' | 'u64'
             |   'f32' | 'f64' | 'v128' | 'bool'

ref_type     ::= TYPE_IDENT | qualified_type_ref | instantiated_module_ref | 'str'
             |   'externref' | 'anyref' | 'eqref'
             |   'i31' | 'array' '[' type ']'
qualified_type_ref ::= module_ref '.' TYPE_IDENT
                    | instantiated_module_ref '.' TYPE_IDENT

func_type    ::= 'fun' '(' type_list? ')' return_type
type_list    ::= type (',' type)*
```

Nullable references are written as a prefix `?`: `?T` means a nullable `T`,
lowering to `(ref null $T)`. The `?` binds tightly as a prefix type constructor.

=== Expressions

```ebnf
expr         ::= literal | IDENT | unary_expr | binary_expr
             |   call_expr | tuple_expr | pipe_expr | type_member_expr
             |   promoted_module_call_expr | field_expr | index_expr
             |   if_expr | promote_expr | match_expr | alt_expr
             |   block_expr | for_expr | while_expr | break_expr
             |   assign_expr | bind_expr | else_expr
             |   struct_init | array_init | assert_expr
             |   namespace_call_expr | ref_null_expr | emit_expr
             |   'fatal' | '(' expr ')'

assert_expr  ::= 'assert' expr

bind_expr    ::= 'let' IDENT ':' type (',' IDENT ':' type)* '=' expr

else_expr    ::= expr '\' expr

tuple_expr   ::= '(' expr ',' expr (',' expr)* ','? ')'

pipe_expr    ::= expr '-o' pipe_target
pipe_target  ::= pipe_path
             |   pipe_path '(' pipe_args ')'
pipe_path    ::= IDENT | TYPE_IDENT | BUILTIN_NS | instantiated_module_ref
             |   pipe_path '.' (IDENT | TYPE_IDENT)
pipe_args    ::= expr (',' expr)*
             |   pipe_prefix? '_' pipe_suffix?
pipe_prefix  ::= expr (',' expr)* ','
pipe_suffix  ::= ',' expr (',' expr)*

call_expr    ::= expr '(' arg_list? ')'
arg_list     ::= expr (',' expr)* ','?

type_member_expr ::= type_path '.' IDENT
type_path    ::= TYPE_IDENT | qualified_type_ref
             |   inline_module_type_path | instantiated_module_ref
inline_module_type_path ::= module_name module_type_arg_list '.' TYPE_IDENT

promoted_module_call_expr ::= module_name module_type_arg_list
                              '.' IDENT '(' arg_list? ')'

field_expr   ::= expr '.' IDENT
index_expr   ::= expr '[' expr ']'

namespace_call_expr ::= BUILTIN_NS '.' IDENT ('(' arg_list? ')')?
ref_null_expr ::= 'ref' '.' 'null' (TYPE_IDENT | qualified_type_ref)

if_expr      ::= 'if' expr block ('else' (if_expr | block))?
promote_expr ::= 'promote' expr '|' IDENT '|' block ('else' block)?

match_expr   ::= 'match' expr '{' match_arm+ '}'
match_arm    ::= match_lit '=>' expr ','
             |   '_' '=>' expr ','
match_lit    ::= INT_LIT | FLOAT_LIT | 'true' | 'false'

alt_expr     ::= 'alt' expr '{' alt_arm+ '}'
alt_arm      ::= IDENT ':' TYPE_IDENT '=>' expr ','
             |   '_' ':' TYPE_IDENT '=>' expr ','
             |   IDENT '=>' expr ','
             |   '_' '=>' expr ','

for_expr     ::= 'for' '(' for_sources ')' capture? block
while_expr   ::= 'while' '(' expr? ')' block
for_sources  ::= for_source (',' for_source)*
for_source   ::= expr '..' expr
capture      ::= '|' IDENT (',' IDENT)* '|'

block_expr   ::= (IDENT ':')? block
block        ::= '{' (expr ';')* '}'
break_expr   ::= 'break'
emit_expr    ::= 'emit' expr

struct_init  ::= (TYPE_IDENT | qualified_type_ref) '{' field_init_list? '}'
field_init_list ::= IDENT ':' expr (',' IDENT ':' expr)* ','?
array_init   ::= 'array' '[' type ']' '.' IDENT '(' arg_list ')'

assign_expr  ::= (IDENT | field_expr | index_expr) '=' expr
```

Several of the spec's most distinctive features appear here:

- binding is an expression form
- `\` is part of the expression grammar
- `-o` is parsed as a dedicated pipe form
- pipe targets allow at most one `_` placeholder
- `for` supports range sources and optional captures
- `while` handles condition and infinite loops
- blocks can be labeled and can yield values through `emit`

The parser accepts comma-separated `for` sources and captures, but current
lowering only uses the first source/capture pair.

=== Operators

The precedence table from the spec, from highest to lowest, is:

- field access, indexing, and calls: `.`, `[]`, `()`
- prefix operators: `~`, unary `-`, `not`
- multiplicative: `*`, `/`, `%`
- additive: `+`, `-`
- shifts: `<<`, `>>`, `>>>`
- bitwise AND: `&`
- bitwise XOR: `^`
- bitwise OR: `|`
- comparisons: `==`, `!=`, `<`, `>`, `<=`, `>=`
- logical `and`
- logical `or`
- else / unwrap: `\`
- pipe: `-o`

The EBNF fragment is:

```ebnf
binary_expr  ::= expr bin_op expr
bin_op       ::= '+' | '-' | '*' | '/' | '%'
             |   '==' | '!=' | '<' | '>' | '<=' | '>='
             |   '&' | '|' | '^' | '<<' | '>>' | '>>>'
             |   'and' | 'or'
             |   '\' | '-o'

unary_expr   ::= unary_op expr
unary_op     ::= '-' | 'not' | '~'
```

The spec also emphasizes symbol disambiguation. Each symbol has one role only,
so no operator is overloaded across unrelated features.

=== Literals, Identifiers, And Comments

```ebnf
literal      ::= INT_LIT | FLOAT_LIT | STRING_LIT | 'true' | 'false'
             |   'null'

INT_LIT      ::= [0-9]+ | '0x' [0-9a-fA-F]+ | '0b' [01]+
FLOAT_LIT    ::= [0-9]+ '.' [0-9]+ ([eE] [+-]? [0-9]+)?

STRING_LIT   ::= '"' <characters> '"'
             |   MULTILINE_STR
MULTILINE_STR::= ('\\\\' <characters> NEWLINE)+

IDENT        ::= [a-z_] [a-zA-Z0-9_]*
TYPE_IDENT   ::= [A-Z] [a-zA-Z0-9]*
LABEL        ::= IDENT
```

```ebnf
COMMENT      ::= '//' <characters> NEWLINE
BUILTIN_NS   ::= 'str' | 'array' | 'i31' | 'ref'
              |   'extern' | 'any'
              |   'i32' | 'i64' | 'f32' | 'f64'
```

The identifier rules reinforce the style guide from the overview chapter:

- lowercase snake case for value identifiers
- leading uppercase for type identifiers
- labels reuse the ordinary identifier form

== Compilation Pipeline

The compilation model is deliberately narrow:

- parse source
- expand modules, constructs, qualified member sugar, and protocol helpers into
  a flattened source program
- validate parse errors
- lower to WAT
- parse WAT with Binaryen and optimize
- emit the final `.wasm` binary

The spec explicitly avoids monomorphization, borrow checking, and large custom
optimization passes. The compiler is supposed to do minimal semantic work and
leave aggressive optimization to the Wasm engine.

The shared compiler also exposes mode-based lowering:

- `program` emits ordinary declarations only
- `test` additionally synthesizes one exported Wasm function per `test`
- `bench` additionally synthesizes one exported Wasm function per `bench`

Test and benchmark metadata is returned alongside generated code so host tools
can report source names while still executing ordinary Wasm exports.

=== Type Lowering

All language types lower into WasmGC types inside recursive type groups. The
compiler may split those groups by strongly connected components to keep the
generated `rec` groups smaller and more engine-friendly.

Field mutability is preserved exactly:

- const fields become immutable Wasm fields
- `mut` fields become `(mut ...)` Wasm fields

=== Function Lowering

Function lowering is meant to stay straightforward:

- parameters become Wasm locals
- the final source expression is left on the Wasm value stack as the return
- pipes are desugared into nested calls during lowering
- `let` bindings become `local.set` and `local.get`

=== Multi-Value Binding Lowering

The spec calls out one crucial stack-order rule: when multiple values are
returned, Wasm leaves them on the stack in declaration order, but `local.set`
consumes from the top. That means the compiler must bind them in reverse order.

```utu
let q: i32, r: i32 = divmod(10, 3);
```

```wasm
(call $divmod (i32.const 10) (i32.const 3))
;; stack: [q_val, r_val]
(local.set $r)
(local.set $q)
```

This reversal rule applies to both multi-value returns and `#` returns.

=== Error Lowering

A return type like `A # B` lowers to a two-result Wasm signature with nullable
references:

```wasm
(result (ref null $A) (ref null $B))
```

For imported extern functions, the compiler still emits the declared
multi-value signature directly. In the generated JS wrapper, throws from
nullable-compatible imports are temporarily converted to null placeholders.
Structured typed error translation is still planned.

=== Else Operator Lowering

The `\` operator lowers on nullable references in two ways:

- `expr \ fatal` evaluates `expr` and applies `ref.as_non_null`
- `expr \ fallback` evaluates `expr`, keeps the non-null branch, and otherwise
  evaluates `fallback`

#pagebreak()

= Complete Example Walkthrough

The spec closes with a compact program that exercises a broad slice of the
core expression and data-model surface. Module and protocol features are
covered earlier and omitted here to keep the walkthrough focused.

```utu
// --- types ---

struct Todo {
    text: str,
    mut done: bool,
}

type Filter =
    | All
    | Active
    | Completed;

// --- functions ---

fun new_todo(text: str) Todo {
    Todo { text: text, done: false };
}

fun toggle(todo: Todo) void {
    todo.done = not todo.done;
}

fun matches(todo: Todo, filter: Filter) bool {
    alt filter {
        _: All => true,
        _: Active => not todo.done,
        _: Completed => todo.done,
    };
}

fun count(todos: array[Todo], filter: Filter) i32 {
    let n: i32 = 0;
    for (0..array.len(todos)) |i| {
        if matches(todos[i], filter) {
            n = n + 1;
        };
    };
    n;
}

export fun main() void {
    escape |(a, b) => a + b| str_concat(str, str) str;
    let todos: array[Todo] = array[Todo].new_fixed(
        new_todo("learn utu"),
        new_todo("build compiler"),
        new_todo("ship it"),
    );

    toggle(todos[0]);

    let active: i32 = count(todos, Active {});
    let label: ?str = if active > 0 { "active"; } else { null; };
    let text: str = label \ "idle";

    text -o str_concat(_, " todos");
}
```

== What This Example Demonstrates

- `Todo` shows a struct with one immutable field and one mutable field.
- `Filter` shows a sum type with several variants.
- `new_todo` shows direct struct construction and implicit returns.
- `toggle` shows mutable field assignment and the `not` operator.
- `matches` shows pattern matching over a sum type.
- `count` shows typed `let` bindings, array indexing, `array.len`, a counted
  `for` loop, and an expression return at the end of the function.
- `main` shows `array.new_fixed`, export syntax, function calls on array
  elements, nullable fallback with `\`, and a simple pipeline through an
  explicit `escape` helper.

== Why The Example Matters

Taken together, the example shows the central theme of the spec:

- data types are expressed in WasmGC-native forms
- control flow stays structured and explicit
- builtins stay minimal and explicit
- nullability stays explicit in the type surface
- the compiler mostly lowers source constructs into nearly identical Wasm
  constructs

That combination is what makes Utu distinct: it aims to feel like a small,
high-level language while still looking almost transparent when viewed through
its Wasm lowering.

#pagebreak()

= Codegen Guide: Utu Beside WAT

This chapter is for reading Utu as a thin syntax layer over WebAssembly GC.
Each example places the Utu source beside the WAT shape you should expect from
lowering.

The WAT snippets here are representative rather than byte-for-byte dumps. In
real output, local names, recursive type-group placement, import names, and
some stack cleanup details may differ, and Binaryen optimization may simplify
the final result further. The important point is that the structure stays
close.

== How To Read This Guide

- the left column shows Utu source
- the right column shows the expected WAT shape
- surrounding module boilerplate is omitted when it is not the focus
- examples aim to show pre-optimization lowering so the correspondence is clear

== Arithmetic And Implicit Return

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
fun add(a: i32, b: i32) i32 {
    a + b;
}
```
  ],
  [
```wat
(func $add (param $a i32) (param $b i32) (result i32)
  (local.get $a)
  (local.get $b)
  (i32.add))
```
  ],
)

Semicolons terminate expressions, but the last expression in the function body
still becomes the value left on the Wasm stack at the end of the function.

== Pipes Desugar To Nested Calls

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
fun inc(x: i32) i32 { x + 1; }
fun double(x: i32) i32 { x * 2; }

fun use_pipe(x: i32) i32 {
    x -o inc -o double;
}
```
  ],
  [
```wat
(func $use_pipe (param $x i32) (result i32)
  (local.get $x)
  (call $inc)
  (call $double))
```
  ],
)

For multi-argument calls, the pipe position marked with `_` becomes the slot
that receives the piped value.

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
fun clamp(val: f32, lo: f32, hi: f32) f32 { ... }

fun clamp_unit(x: f32) f32 {
    x -o clamp(_, 0.0, 1.0);
}
```
  ],
  [
```wat
(func $clamp_unit (param $x f32) (result f32)
  (local.get $x)
  (f32.const 0)
  (f32.const 1)
  (call $clamp))
```
  ],
)

== `let` Becomes Locals

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
fun scaled_sum(a: i32, b: i32) i32 {
    let sum: i32 = add(a, b);
    sum * 2;
}
```
  ],
  [
```wat
(func $scaled_sum (param $a i32) (param $b i32) (result i32)
  (local $sum i32)
  (local.get $a)
  (local.get $b)
  (call $add)
  (local.set $sum)
  (local.get $sum)
  (i32.const 2)
  (i32.mul))
```
  ],
)

This is one of the clearest examples of the language design: naming a value
really is just promoting it into a local that can be read again later.

== Struct Construction And Field Access

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
struct Vec2 {
    x: f32,
    y: f32,
}

fun make_vec() Vec2 {
    Vec2 { x: 1.0, y: 2.0 };
}

fun get_x(v: Vec2) f32 {
    v.x;
}
```
  ],
  [
```wat
(type $Vec2 (struct
  (field $x f32)
  (field $y f32)))

(func $make_vec (result (ref $Vec2))
  (f32.const 1.0)
  (f32.const 2.0)
  (struct.new $Vec2))

(func $get_x (param $v (ref $Vec2)) (result f32)
  (local.get $v)
  (struct.get $Vec2 $x))
```
  ],
)

Const fields become immutable Wasm fields. That lets the runtime preserve the
struct's immutability contract directly.

== Mutable Fields Need `struct.set`

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
struct Todo {
    text: str,
    mut done: bool,
}

fun toggle(todo: Todo) void {
    todo.done = not todo.done;
}
```
  ],
  [
```wat
(func $toggle (param $todo (ref $Todo))
  (local.get $todo)
  (local.get $todo)
  (struct.get $Todo $done)
  (i32.eqz)
  (struct.set $Todo $done))
```
  ],
)

Because `struct.set` needs both the reference and the new value, the lowered
code usually reloads the reference before computing the updated field value.

== Arrays Stay Close To WasmGC Arrays

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
fun first_plus_len(xs: array[i32]) i32 {
    let first: i32 = xs[0];
    first + array.len(xs);
}
```
  ],
  [
```wat
(func $first_plus_len (param $xs (ref $i32_array)) (result i32)
  (local $first i32)
  (local.get $xs)
  (i32.const 0)
  (array.get $i32_array)
  (local.set $first)
  (local.get $first)
  (local.get $xs)
  (array.len)
  (i32.add))
```
  ],
)

Allocation is just as direct:

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
let buf: array[i32] = array[i32].new(1024, 0);
```
  ],
  [
```wat
(i32.const 1024)
(i32.const 0)
(array.new $i32_array)
```
  ],
)

== Conditionals Become Result-Typed `if`

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
fun max(a: i32, b: i32) i32 {
    if a > b { a; } else { b; };
}
```
  ],
  [
```wat
(func $max (param $a i32) (param $b i32) (result i32)
  (local.get $a)
  (local.get $b)
  (i32.gt_s)
  (if (result i32)
    (then
      (local.get $a))
    (else
      (local.get $b))))
```
  ],
)

This is the same structured shape Wasm already uses, which is why Utu can make
`if` an expression without inventing a separate runtime convention.

== Counted Loops Become `block` Plus `loop`

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
fun sum_to(n: i32) i32 {
    let sum: i32 = 0;
    for (0..n) |i| {
        sum = sum + i;
    };
    sum;
}
```
  ],
  [
```wat
(func $sum_to (param $n i32) (result i32)
  (local $sum i32)
  (local $i i32)
  (i32.const 0)
  (local.set $sum)
  (i32.const 0)
  (local.set $i)
  (block $break
    (loop $continue
      (local.get $i)
      (local.get $n)
      (i32.ge_s)
      (br_if $break)
      (local.get $sum)
      (local.get $i)
      (i32.add)
      (local.set $sum)
      (local.get $i)
      (i32.const 1)
      (i32.add)
      (local.set $i)
      (br $continue)))
  (local.get $sum))
```
  ],
)

The loop structure is intentionally unsurprising if you already know Wasm.

== Multi-Value Returns Stay On The Stack

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
fun divmod(a: i32, b: i32) i32, i32 {
    a / b, a % b;
}
```
  ],
  [
```wat
(func $divmod (param $a i32) (param $b i32) (result i32 i32)
  (local.get $a)
  (local.get $b)
  (i32.div_s)
  (local.get $a)
  (local.get $b)
  (i32.rem_s))
```
  ],
)

Binding those results shows one of the few non-obvious lowering rules:

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
let q: i32, r: i32 = divmod(10, 3);
```
  ],
  [
```wat
(i32.const 10)
(i32.const 3)
(call $divmod)
;; stack now holds [q, r], with r on top
(local.set $r)
(local.set $q)
```
  ],
)

Wasm pushes return values in declaration order, so the compiler must emit
`local.set` in reverse order.

== Force Unwrap Uses `ref.as_non_null`

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
let data: Response = fetch(url) \ fatal;
```
  ],
  [
```wat
(call $fetch)
ref.as_non_null
```
  ],
)

Default fallback on nullable references now lowers too: the compiler evaluates
the nullable expression, uses `br_on_non_null` to keep the present value, and
only evaluates the fallback when the left side is null. Force unwrap remains
the direct `ref.as_non_null` path.

== Sum-Type Matches Become `br_on_cast` Chains

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
fun describe(shape: Shape) str {
    alt shape {
        c: Circle => "circle",
        r: Rect => "rect",
        t: Triangle => "triangle",
    };
}
```
  ],
  [
```wat
(func $describe (param $shape (ref $Shape)) (result externref)
  (block $triangle (result (ref $Triangle))
    (block $rect (result (ref $Rect))
      (block $circle (result (ref $Circle))
        (local.get $shape)
        (br_on_cast $circle (ref $Shape) (ref $Circle))
        (br_on_cast $rect (ref $Shape) (ref $Rect))
        (br_on_cast $triangle (ref $Shape) (ref $Triangle))
        (unreachable))
      (drop)
      (global.get $str_circle)
      (return))
    (drop)
    (global.get $str_rect)
    (return))
  (drop)
  (global.get $str_triangle))
```
  ],
)

The exact string constant strategy may vary, but the dispatch structure is the
key point: sum-type matching is really type refinement through WasmGC casts.

== Exports Are Also Thin

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [*Utu*],
  [*WAT*],
  [
```utu
shimport "es" console_log(str) void;

export fun main() void {
    "hello world" -o console_log;
}
```
  ],
  [
```wat
(import "es" "console_log"
  (func $console_log (param externref)))

(func $main
  ;; string literal setup omitted
  (call $console_log))

(export "main" (func $main))
```
  ],
)

There is very little hidden machinery here. The language mostly chooses nicer
surface syntax for Wasm concepts that already exist.

== Takeaway

If you are comfortable reading WAT, Utu should feel mostly transparent. The
language adds:

- a friendlier syntax for types, expressions, and control flow
- pipelines for direct data flow
- a value-based error model using `#` and `\`
- direct names for WasmGC allocation and reference operations

But the generated shape remains close enough that you can usually predict the
WAT by inspection. The goal is not to invent a second runtime model; it is to
surface Wasm constructs, including tables and `call_indirect`, with a usable
syntax. In Utu, syntax is a contract over emitted Wasm structure.
