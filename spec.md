# Utu

**A WasmGC-Native Language with Linear-Logic Semantics**

*Named after the Sumerian sun god of truth and justice.*

Language Specification — Draft — March 2026

---

## 1. Overview

Utu is a statically-typed, garbage-collected language that compiles directly to WebAssembly GC (WasmGC) instructions. It uses the browser's built-in garbage collector exclusively — no linear memory allocator, no bundled runtime. The result is near-native performance at a fraction of the bundle size of languages like Rust, Go, or Swift compiled to Wasm.

**Design principles:**

- Map directly to WasmGC primitives — every language construct has a 1:1 (or near 1:1) Wasm lowering
- Linear-by-construction data flow via pipes; unrestricted bindings via explicit promotion
- Control flow mirrors Wasm structured control flow exactly
- Strings via JS String Builtins (externref), auto-imported — no custom string runtime
- Errors as values using exclusive disjunction (`#`), no exceptions in user code
- Null safety from WasmGC's non-nullable reference types
- Struct fields const by default, explicitly `mut`

**Naming conventions:**

- Types: `CapitalCamel` — `Vec2`, `Shape`, `ApiError`, `Todo`
- Functions and variables: `snake_case` — `new_todo`, `console_log`, `my_value`

---

## 2. Type System

### 2.1 Linear Logic Foundation

The type system draws from linear logic, where values are *resources* that are produced and consumed. The key insight is that linearity is enforced *structurally through syntax* rather than through a checker: unnamed intermediate values can only flow forward through pipes and cannot be referenced twice because they have no name. Named bindings are explicitly promoted to unrestricted use via `let`.

#### 2.1.1 Connective Mapping

| Symbol | Linear Logic | Meaning |
|--------|-------------|---------|
| (return type) | `!A ⊸ B` | Function (args unrestricted, named in params) |
| `-o` | `A ⊸ B` | Pipe operator (consume left, produce right) |
| `,` | `A ⊗ B` | Tensor product — have both simultaneously |
| `\|` | `A ⊕ B` | Sum / union — one variant, tagged |
| `#` | `A ⊕ B` (exclusive) | Exclusive disjunction — exactly one non-null |
| `let` | `!A` | Exponential — promote to unrestricted (reusable binding) |

#### 2.1.2 Resource Interpretation

An unnamed value produced by an expression is a linear resource: it must be consumed exactly once by the next pipe stage or function argument. The `let` binding keyword promotes a value to unrestricted, allowing multiple uses. This makes linearity the invisible default — the common path is pipes and inline expressions, and `let` is the explicit escape hatch. The grammar itself prevents reuse of unnamed values, so no use-count analysis is required.

### 2.2 Scalar Types

| Type | Description |
|------|-------------|
| `i32` | 32-bit signed integer |
| `u32` | 32-bit unsigned integer (i32 with unsigned operations) |
| `i64` | 64-bit signed integer |
| `u64` | 64-bit unsigned integer (i64 with unsigned operations) |
| `f32` | 32-bit IEEE 754 float |
| `f64` | 64-bit IEEE 754 float |
| `v128` | 128-bit SIMD vector |
| `bool` | Boolean (i32 with 0/1 semantics) |

Note: Wasm does not distinguish signed/unsigned at the type level. `u32` and `u64` are syntactic sugar that select unsigned variants of division, remainder, comparison, and conversion instructions.

### 2.3 Reference Types

| Type | Wasm Mapping |
|------|-------------|
| `struct { ... }` | `(struct (field ...))` |
| `array[T]` | `(array (mut T))` |
| `fn(A) B` | `(func (param A) (result B))` |
| `externref` | `externref` (opaque JS value) |
| `anyref` | `anyref` (top of GC hierarchy) |
| `i31` | `i31ref` (31-bit tagged integer) |
| `eqref` | `eqref` (structurally comparable) |

All reference types are **non-nullable by default**. Nullable types are expressed using the exclusive disjunction operator: `T # null`. This maps to `(ref null $T)` in Wasm. Null safety is enforced at the Wasm validator level — no runtime overhead.

### 2.4 Product Types (Structs)

Structs are GC heap-allocated reference types. Fields are **const by default**. Use the `mut` keyword to allow mutation. The tensor product `,` appears in both struct field lists and multi-value returns.

```
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

**Wasm lowering:**

```wasm
(type $Vec2 (struct (field $x f32) (field $y f32)))
(type $Node (struct
    (field $value i32)
    (field $left (mut (ref null $Node)))
    (field $right (mut (ref null $Node)))
))
```

Note: const fields lower without the `(mut ...)` wrapper in Wasm, allowing the engine to optimize them as truly immutable.

### 2.5 Sum Types (Enums)

Sum types use `|` and map to WasmGC's type hierarchy. The compiler generates a common supertype and subtypes for each variant. Pattern matching lowers to `br_on_cast` chains.

```
type Shape =
    | Circle { radius: f32 }
    | Rect { w: f32, h: f32 }
    | Triangle { a: f32, b: f32, c: f32 }
```

**Wasm lowering:**

```wasm
(type $Shape (struct))  ;; abstract supertype
(type $Circle (sub $Shape (struct (field $radius f32))))
(type $Rect (sub $Shape (struct (field $w f32) (field $h f32))))
(type $Triangle (sub $Shape (struct
    (field $a f32) (field $b f32) (field $c f32))))
```

### 2.6 Exclusive Disjunction (Error Returns)

The `#` operator denotes an exclusive return: exactly one value is non-null. This is the error handling mechanism. It maps to Wasm multi-value return with complementary nullability.

```
fn divide(a: i32, b: i32) i32 # DivError

// Wasm signature:
// (func $divide (param i32 i32)
//     (result (ref null $i32_box) (ref null $DivError)))
// Contract: exactly one result is non-null
```

The current compiler also accepts `A # B` on import signatures. The Wasm import
surface is still a direct multi-value signature, but the generated JS wrapper
now catches throws for nullable-compatible result shapes and substitutes null
placeholders. `T # null` imports receive `null`; reference-shaped `T # E`
imports currently receive `[null, null]`. That keeps nullable fallback working
today, but it does not yet construct a typed error value. Structured JS-to-Utu
error mapping is still a planned feature.

```
// Thrown JS exceptions become null in the generated JS wrapper
import extern "es" fetch(str) Response # null

// Thrown JS exceptions currently become [null, null] here
import extern "es" fetch(str) Response # ApiError

// Call site — nullable fallback and null checks work today:
let resp: Response # null, err: ApiError # null = fetch(url)
if not ref.is_null(err) {
    // host-provided typed error path
} else {
    if ref.is_null(resp) {
        // temporary JS-throw placeholder path
    } else {
        // resp is non-null here
    }
}
```

#### 2.6.1 Nullable Types

Nullable types are expressed as exclusive disjunction with null:

```
T # null    // nullable T — maps to (ref null $T)
```

This means nullable is not a special language feature — it falls out naturally from `#`.

#### 2.6.2 Force Unwrap And Default Fallback

```
// Force unwrap — trap if null (\ unreachable)
let val: Thing = get_thing() \ unreachable

// Nullable fallback
let cached: Response = fetch(url) \ default_response

// Nullable import + force unwrap
let resp: Response = fetch(url) \ unreachable
```

Both forms are implemented for nullable references:

- `expr \ unreachable` -> evaluate `expr`, then apply `ref.as_non_null`
- `expr \ fallback` -> evaluate `expr`, keep the non-null branch, otherwise
  evaluate `fallback`

The force-unwrap form lowers directly:

```wasm
;; val = expr \ unreachable
(call $expr)
ref.as_non_null
```

### 2.7 Multi-Value Return (Tensor Product)

Functions can return multiple values using `,` which maps directly to Wasm's multi-value return. Unlike `#`, all values are non-null (tensor — you have both).

```
fn divmod(a: i32, b: i32) i32, i32 {
    a / b, a % b
}

let q: i32, r: i32 = divmod(10, 3)
```

### 2.8 Assertions, Tests, And Benchmarks

Utu also supports a compact in-source testing surface:

```
assert cond

test "adds two numbers" {
    assert add(2, 2) == 4
}

bench "sum loop" |i| {
    setup {
        let total: i32 = 0
        measure {
            total = total + i
        }
    }
}
```

- `assert` traps with `unreachable` when its condition is false
- `test` declarations are ignored by ordinary program compilation and become
  synthesized zero-argument exports in test mode
- `bench` declarations are ignored by ordinary program compilation and become
  synthesized benchmark exports in bench mode
- benchmark setup runs once per sample and measure runs inside a generated Wasm
  loop for the requested iteration count
- benchmark timing is measured by the host, not inside Wasm


---

## 3. Strings

Strings are opaque `externref` values backed by the host's native string representation via the **JS String Builtins** proposal. The compiler auto-imports all string builtins under the `"wasm:js-string"` namespace — no manual import declarations needed. The engine recognizes these imports and can inline them — they are not full JS interop calls.

The `str` type is an alias for `externref` when used with string builtins.

**Auto-imported builtins (always available):**

| Function | Signature |
|----------|-----------|
| `str.length(s)` | `(str) i32` |
| `str.char_code_at(s, i)` | `(str, i32) i32` |
| `str.concat(a, b)` | `(str, str) str` |
| `str.substring(s, start, end)` | `(str, i32, i32) str` |
| `str.equals(a, b)` | `(str, str) bool` |
| `str.from_char_code_array(arr, start, end)` | `(array[i16], i32, i32) str` |
| `str.into_char_code_array(s, arr, start)` | `(str, array[i16], i32) i32` |
| `str.from_char_code(code)` | `(i32) str` |

### 3.1 String Literals

Single-line strings use double quotes. Multi-line strings use `\\` at the start of each line (Zig-style):

```
let greeting: str = "hello world"

let multiline: str =
    \\this is a multi-line
    \\string literal in utu
    \\each line starts with \\
```

Multi-line strings are concatenated at compile time with newlines between each `\\` line.

### 3.2 String Processing

For most application code, the auto-imported builtins are sufficient and faster since they use the engine's optimized string representation. For heavy text processing (parsing, regex), convert to a GC `array[i16]` for direct indexing:

```
let msg: str = "hello" -o str.concat(_, ", ") -o str.concat(_, "world")

// Heavy processing: convert to array
let arr: array[i16] = array[i16].new(str.length(msg), 0)
str.into_char_code_array(msg, arr, 0)
// ... direct array[i16] access ...
let result: str = str.from_char_code_array(arr, 0, array.len(arr))
```

---

## 4. Memory Model

### 4.1 GC-Only Allocation

Utu uses WasmGC exclusively for all heap allocation. There is **no linear memory**, no malloc/free, no bundled allocator. All values are either Wasm value-stack scalars or GC-managed heap objects (structs, arrays, i31ref).

**Consequences:**

- The engine's generational/compacting GC manages all memory — typically better than what languages ship in linear memory
- No use-after-free, no double-free, no memory leaks from forgotten deallocations
- Bundle sizes are minimal: just compiled logic, no runtime overhead
- The engine performs escape analysis and scalar replacement — small structs that don't escape may never be heap-allocated

### 4.2 Struct Allocation

```
// Language level
let pos: Vec2 = Vec2 { x: 1.0, y: 2.0 }

// Wasm lowering
(struct.new $Vec2 (f32.const 1.0) (f32.const 2.0))
```

### 4.3 Array Allocation

```
// Fixed-size, filled with default value
let buf: array[i32] = array[i32].new(1024, 0)
// -> (array.new $i32_array (i32.const 0) (i32.const 1024))

// From existing data
let data: array[f32] = array[f32].new_fixed(1.0, 2.0, 3.0)
// -> (array.new_fixed $f32_array 3 (f32.const 1.0) ...)

// Access
let val: f32 = data[0]      // -> array.get
data[0] = 42                 // -> array.set
let len: i32 = array.len(data)  // -> array.len
```

---

## 5. Control Flow

Every control flow construct maps directly to a Wasm structured control flow instruction. There is no lowering gap — what you write is what gets emitted.

### 5.1 Conditionals

```
// if-else expression (like Rust, evaluates to a value)
let max: i32 = if a > b { a } else { b }

// Wasm lowering:
// (if (result i32) (i32.gt_s (local.get $a) (local.get $b))
//     (then (local.get $a))
//     (else (local.get $b)))
```

### 5.2 Loops

Zig-style `for` loops. The loop header takes iterables/ranges in parentheses, and captures are bound in `|...|` after the closing paren.

```
// Counted loop — range + capture
for (0..n) |i| {
    sum = sum + i
}

// While-style loop (condition only, no capture)
for (cond()) {
    body()
}

// Infinite loop (empty parens)
for () {
    if done() { break }
}
```

The parser accepts comma-separated sources and captures, but current lowering
only uses the first source/capture pair. The documented loop surface therefore
sticks to the single-range form that the compiler emits today.

**Wasm lowering:** `for (0..n) |i| { ... }` lowers to:

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

### 5.3 Blocks with Return

Rust-style labeled blocks that evaluate to a value. Labels are bare identifiers (no tick prefix). Maps to Wasm `block` with `br`.

```
let result: i32 = compute: {
    if shortcut() {
        break compute 42
    }
    expensive_calculation()
}

// Wasm lowering:
// (block $compute (result i32)
//     (br_if $compute (i32.const 42) (call $shortcut))
//     (call $expensive_calculation))
```

### 5.4 Match

Current compiler support focuses on sum-type matches. They use `br_on_cast`
chains with an `unreachable` trap for non-exhaustive matches.

```
// Type switch -> br_on_cast chain
match shape {
    s: Circle => area_circle(s),
    s: Rect => area_rect(s),
    s: Triangle => area_tri(s),
}
```

**Wasm lowering for type match:**

```wasm
(block $tri (result (ref $Triangle))
  (block $rect (result (ref $Rect))
    (block $circle (result (ref $Circle))
      (local.get $shape)
      (br_on_cast $circle (ref $Shape) (ref $Circle))
      (br_on_cast $rect (ref $Shape) (ref $Rect))
      (br_on_cast $tri (ref $Shape) (ref $Triangle))
      (unreachable))
    (call $area_circle))
  (call $area_rect))
(call $area_tri)
```

### 5.5 Unreachable

```
// Traps the program. Maps directly to (unreachable)
unreachable
```

---

## 6. Functions and Pipes

### 6.1 Function Definitions

Functions list parameters in parentheses followed directly by the return type (no `->` arrow). Implicit return (last expression) follows Rust conventions. Parameters are unrestricted (implicitly reusable) since they are named. Void functions omit the return type.

```
fn add(a: i32, b: i32) i32 {
    a + b    // implicit return
}

fn clamp(val: f32, lo: f32, hi: f32) f32 {
    if val < lo { lo }
    else if val > hi { hi }
    else { val }
}

// Void functions omit the return type
fn greet(name: str) {
    name -o console_log
}
```

### 6.2 Pipe Operator

The `-o` operator (lollipop from linear logic) pipes a value into the next function. The left side is consumed by the right side.

For **single-argument** functions, the pipe target is just the function name — no parentheses or underscore needed:

```
a -o f -o g

// Equivalent to: g(f(a))
```

For **multi-argument** functions, use parentheses with `_` marking where the piped value goes:

```
a
-o f
-o z(_, c, d)

// Equivalent to: z(f(a), c, d)

// _ can appear in any argument position
x -o clamp(0.0, _, 1.0)
```

**Chained example:**

```
"hello"
-o str.concat(_, " world")
-o console_log
```

**Wasm lowering:** The pipe is pure syntactic sugar. `a -o f` desugars to `f(a)`. `a -o f(_, b)` desugars to `f(a, b)`. The lowering is a direct function call.

### 6.3 Bindings

`let` is the binding keyword. It promotes a value to unrestricted (the linear logic exponential `!`). Every named binding is reusable. A type annotation is always required. If you only use a value once, prefer piping or inlining — no binding needed.

```
// Reusable binding (type always required)
let config: Config = load_config()
init(config)
validate(config)   // used again — fine, it's let-bound

// No binding needed for single use
load_config() -o init

// Destructuring multi-return
let q: i32, r: i32 = divmod(10, 3)
```

---

## 7. Imports and Exports

### 7.1 JS Imports

```
// Simple import (void return — no return type)
import extern "es" console_log(str)

// Nullable return import
import extern "es" fetch(str) Response # null

// Direct two-result import signature
import extern "es" fetch(str) Response # ApiError

// Import a value
import extern "es" document: externref
```

Note: String builtins (`str.length`, `str.concat`, etc.) are auto-imported from `"wasm:js-string"` and do not require import declarations. The generated JS wrapper currently catches throws from nullable-compatible imports and substitutes null placeholders. Structured typed error translation for `T # E` imports is still planned.

### 7.2 Wasm Exports

```
export fn main() {
    "hello world" -o console_log
}
```

---

## 8. Polymorphic Dispatch

Dynamic dispatch uses `br_on_cast` for type-based dispatch and `call_ref` for function reference dispatch. There is no vtable built into the language — dispatch is explicit.

```
// Type-based dispatch (br_on_cast chain)
fn describe(s: Shape) str {
    match s {
        c: Circle => "circle",
        r: Rect => "rect",
        t: Triangle => "triangle",
    }
}

// Function reference dispatch (call_ref)
type Handler = fn(Event)
let handlers: array[Handler] = array[Handler].new_fixed(on_click, on_hover, on_key)
handlers[event.kind](event)  // call_ref with array.get
```

---

## 9. Builtin Operations

Builtin operations are not library functions — the compiler emits the
corresponding Wasm instruction directly where the current implementation
supports that source form.

### 9.1 Struct Operations

| Operation | Wasm Instruction |
|-----------|-----------------|
| `StructName { fields... }` | `struct.new $T` |
| `obj.field` | `struct.get $T $field` |
| `obj.field = val` | `struct.set $T $field` (mut fields only) |

### 9.2 Array Operations

| Operation | Wasm Instruction |
|-----------|-----------------|
| `array[T].new(len, init)` | `array.new $T` |
| `array[T].new_fixed(vals...)` | `array.new_fixed $T N` |
| `array[T].new_default(len)` | `array.new_default $T` |
| `arr[i]` | `array.get $T` |
| `arr[i] = val` | `array.set $T` |
| `array.len(arr)` | `array.len` |
| `array.copy(dst, di, src, si, len)` | `array.copy $T $T` |
| `array.fill(arr, off, val, len)` | `array.fill $T` |

### 9.3 Reference Operations

| Operation | Wasm Instruction |
|-----------|-----------------|
| `ref.null T` | `ref.null $T` |
| `ref.is_null(val)` | `ref.is_null` |
| `ref.as_non_null(val)` | `ref.as_non_null` |
| `ref.eq(a, b)` | `ref.eq` |
| `i31.new(val)` | `ref.i31` |
| `i31.get_s(val)` | `i31.get_s` |
| `i31.get_u(val)` | `i31.get_u` |
| `extern.convert(val)` | `extern.convert_any` |
| `any.convert(val)` | `any.convert_extern` |

### 9.4 Numeric Operations

Standard Wasm numeric instructions are currently exposed through infix
operators:

| Category | Operations |
|----------|-----------|
| Arithmetic | `+  -  *  /  %` (maps to i32.add, i32.rem_s, f64.mul, etc.) |
| Bitwise | `& (and)  \| (or)  ^ (xor)  << (shl)  >> (shr_s)  >>> (shr_u)` |
| Unary | `- (negate)  not (logical not)  ~ (bitwise invert)` |
| Comparison | `==  !=  <  >  <=  >=` |
| Helpers not yet implemented | `i32.wrap(i64)`, `f64.sqrt(...)`, `v128.*`, and similar numeric namespace builtins |

**Operator clarity:** Each symbol has exactly one meaning. `#` is exclusive disjunction (type-level only). `%` is always remainder. `^` is always bitwise XOR. `~` is always bitwise NOT (unary only).

---

## 10. Required Wasm Instructions

Complete list of Wasm instructions the compiler must emit. Organized by category.

### 10.1 Control Flow

| Instruction | Used For |
|-------------|---------|
| `block` | Labeled blocks, block-with-return |
| `loop` | Counted, condition, and infinite `for` loops |
| `if / else` | Conditionals |
| `br` | Break from block/loop |
| `br_if` | Conditional break |
| `br_on_cast` | Type-based pattern matching |
| `call` | Direct function call |
| `call_ref` | Function reference call |
| `unreachable` | Trap / exhaustive match fallthrough / force unwrap |

### 10.2 GC Instructions

| Instruction | Used For |
|-------------|---------|
| `struct.new` | Struct allocation |
| `struct.get` | Field access |
| `struct.set` | Field mutation (mut fields only) |
| `array.new` | Array allocation (with default) |
| `array.new_fixed` | Array allocation (from values) |
| `array.new_default` | Array allocation (zero-init) |
| `array.get` | Array element access |
| `array.set` | Array element mutation |
| `array.len` | Array length |
| `array.copy` | Array bulk copy |
| `array.fill` | Array bulk fill |
| `ref.null` | Null reference literal |
| `ref.is_null` | Null check |
| `ref.as_non_null` | Assert non-null (trap on null) |
| `ref.eq` | Reference equality |
| `ref.i31` | Box i32 to i31ref |
| `i31.get_s / i31.get_u` | Unbox i31ref |
| `extern.convert_any` | anyref to externref |
| `any.convert_extern` | externref to anyref |

### 10.3 Variable Instructions

| Instruction | Used For |
|-------------|---------|
| `local.get` | Read local variable |
| `local.set` | Write local variable |
| `global.get` | Read global |
| `global.set` | Write mutable global |

### 10.4 Numeric Instructions

The current compiler uses the standard numeric instructions behind the source operators for i32, i64, f32, and f64.

---

## 11. Grammar

EBNF-style grammar for Utu. Whitespace is insignificant except inside string literals. Comments use `//` (line comments only — no block comments).

### 11.1 Top-Level

```ebnf
program      ::= item*
item         ::= import_decl | export_decl | fn_decl | type_decl
               | struct_decl | global_decl | test_decl | bench_decl
```

### 11.2 Declarations

```ebnf
struct_decl  ::= 'struct' TYPE_IDENT '{' field_list '}'
field_list   ::= (field (',' field)* ','?)?
field        ::= 'mut'? IDENT ':' type

type_decl    ::= 'type' TYPE_IDENT '=' variant_list
variant_list ::= '|'? variant ('|' variant)*
variant      ::= TYPE_IDENT ('{' field_list '}')?

fn_decl      ::= 'fn' IDENT '(' param_list ')' return_type? block
param_list   ::= (param (',' param)* ','?)?
param        ::= IDENT ':' type
return_type  ::= type ('#' type)? (',' type ('#' type)?)*

global_decl  ::= 'let' IDENT ':' type '=' expr

import_decl  ::= 'import' 'extern' STRING
                  ( IDENT '(' import_param_list? ')' return_type?
                  | IDENT ':' type )
import_param_list ::= import_param (',' import_param)* ','?
import_param ::= param | type
export_decl  ::= 'export' fn_decl
test_decl    ::= 'test' STRING block
bench_decl   ::= 'bench' STRING '|' IDENT '|' '{' setup_decl '}'
```

### 11.3 Types

```ebnf
type         ::= scalar_type | ref_type | func_type
             |   type '#' 'null'
             |   '(' type ')'

scalar_type  ::= 'i32' | 'u32' | 'i64' | 'u64'
             |   'f32' | 'f64' | 'v128' | 'bool'

ref_type     ::= TYPE_IDENT | 'str'
             |   'externref' | 'anyref' | 'eqref'
             |   'i31' | 'array' '[' type ']'

func_type    ::= 'fn' '(' type_list ')' return_type
type_list    ::= (type (',' type)*)?
```

### 11.4 Expressions

```ebnf
expr         ::= literal | IDENT | unary_expr | binary_expr
             |   call_expr | tuple_expr | pipe_expr | field_expr
             |   index_expr | if_expr | match_expr
             |   block_expr | for_expr | break_expr
             |   assign_expr | bind_expr | else_expr
             |   struct_init | array_init
             |   namespace_call_expr | ref_null_expr
             |   'unreachable' | '(' expr ')'

bind_expr    ::= 'let' IDENT ':' type (',' IDENT ':' type)* '=' expr

else_expr    ::= expr '\' expr

tuple_expr   ::= expr ',' expr

pipe_expr    ::= expr '-o' pipe_target
pipe_target  ::= pipe_path
             |   pipe_path '(' pipe_args ')'
pipe_path    ::= IDENT | BUILTIN_NS | pipe_path '.' IDENT
pipe_args    ::= pipe_arg (',' pipe_arg)*
pipe_arg     ::= '_' | expr

call_expr    ::= expr '(' arg_list ')'
arg_list     ::= (expr (',' expr)* ','?)?

field_expr   ::= expr '.' IDENT
index_expr   ::= expr '[' expr ']'

namespace_call_expr ::= BUILTIN_NS '.' IDENT ('(' arg_list? ')')?
ref_null_expr ::= 'ref' '.' 'null' TYPE_IDENT

if_expr      ::= 'if' expr block ('else' (if_expr | block))?

match_expr   ::= 'match' expr '{' match_arm+ '}'
match_arm    ::= pattern ':' TYPE_IDENT '=>' expr ','
             |   pattern '=>' expr ','
pattern      ::= IDENT | '_'

for_expr     ::= 'for' '(' for_sources ')' capture? block
for_sources  ::= for_source (',' for_source)*
for_source   ::= expr '..' expr | expr
capture      ::= '|' IDENT (',' IDENT)* '|'

block_expr   ::= (IDENT ':')? block
block        ::= '{' expr* '}'
break_expr   ::= 'break' IDENT? expr?

struct_init  ::= TYPE_IDENT '{' (IDENT ':' expr),* '}'
array_init   ::= 'array' '[' type ']' '.' IDENT '(' arg_list ')'

assign_expr  ::= (IDENT | field_expr | index_expr) '=' expr
```

The parser accepts comma-separated `for` sources and captures, but current
lowering only uses the first source/capture pair. Literal scalar switch arms
such as `0 => ...` are not part of the current `match_pattern` grammar.

### 11.5 Operators

**Precedence (high to low):**

| Precedence | Operators | Associativity |
|-----------|-----------|---------------|
| 1 (highest) | `.` `[]` `()` | Left |
| 2 | `~` (bitwise NOT) `-` (negate) `not` | Prefix |
| 3 | `*` `/` `%` | Left |
| 4 | `+` `-` | Left |
| 5 | `<<` `>>` `>>>` | Left |
| 6 | `&` (bitwise AND) | Left |
| 7 | `^` (bitwise XOR) | Left |
| 8 | `\|` (bitwise OR) | Left |
| 9 | `==` `!=` `<` `>` `<=` `>=` | Left |
| 10 | `and` | Left |
| 11 | `or` | Left |
| 12 | `\` (else/unwrap) | Left |
| 13 (lowest) | `-o` (pipe) | Left |

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

**Symbol disambiguation:** Every symbol has exactly one role. `#` is always exclusive disjunction (types only, never in expressions). `%` is always remainder. `^` is always bitwise XOR. `~` is always bitwise NOT (unary only, never binary). No overloaded symbols.

### 11.6 Literals and Identifiers

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

### 11.7 Comments

```ebnf
COMMENT      ::= '//' <characters> NEWLINE
BUILTIN_NS   ::= 'str' | 'array' | 'i31' | 'ref'
              |   'extern' | 'any'
              |   'i32' | 'i64' | 'f32' | 'f64'
```

Line comments only. No block comments.

---

## 12. Compilation Model

### 12.1 Pipeline

Source -> Parse -> parse-error validation -> Lower to WAT -> Binaryen parse and optional optimize -> .wasm binary. The compiler is intentionally simple: no monomorphization, no borrow checking, no complex optimization passes. The philosophy is to do minimal work in the compiler and let the Wasm engine's optimizing tiers handle the rest.

### 12.2 Type Lowering

All language types lower to WasmGC types within a single recursive type group (`rec`). For modules with many types, the compiler may perform SCC decomposition to emit minimal `rec` groups, improving engine optimization. The ordering within groups is topological by reference graph.

Const struct fields lower to non-mut Wasm fields. Mut struct fields lower to `(mut ...)` Wasm fields.

### 12.3 Function Lowering

Functions lower directly to Wasm functions. Parameters become locals. The implicit return (last expression) is left on the value stack. The pipe operator `-o` is desugared to nested function calls during lowering. `let` bindings become `local.set` / `local.get` pairs.

### 12.4 Multi-Value Let Binding Lowering

When a function returns multiple values, Wasm leaves them on the stack in declaration order. However, `local.set` pops from the top of the stack, so the compiler must set bindings in **reverse order**:

```
let q: i32, r: i32 = divmod(10, 3)
```

Wasm lowering:

```wasm
(call $divmod (i32.const 10) (i32.const 3))
;; stack is now: [q_val, r_val] (r_val on top)
(local.set $r)  ;; pops top of stack (second return value)
(local.set $q)  ;; pops next value (first return value)
```

This applies to all multi-value returns including `,` (tensor product) and `#` (exclusive disjunction). The compiler reverses the binding list when emitting `local.set` instructions.

### 12.5 Error Lowering

A function with return type `A # B` is emitted with signature `(result (ref null $A) (ref null $B))`. Extern imports still use that same declared Wasm signature directly. In the generated JS wrapper, throws from nullable-compatible imports are currently coerced to null placeholders instead of a structured typed error branch.

### 12.6 Else Operator Lowering

The `\` operator now lowers for nullable references in two ways:

- `expr \ unreachable` -> evaluate `expr`, then apply `ref.as_non_null`
- `expr \ fallback` -> evaluate `expr`, branch through `br_on_non_null` when a value is present, otherwise evaluate `fallback`

---

## 13. Complete Example

```
// --- types ---

struct Todo {
    text: str,
    mut done: bool,
}

type Filter =
    | All
    | Active
    | Completed

// --- imports ---

import extern "es" console_log(str)
import extern "es" fetch(str) str # null

// --- functions ---

fn new_todo(text: str) Todo {
    Todo { text: text, done: false }
}

fn toggle(todo: Todo) {
    todo.done = not todo.done
}

fn matches(todo: Todo, filter: Filter) bool {
    match filter {
        _: All => true,
        _: Active => not todo.done,
        _: Completed => todo.done,
    }
}

fn count(todos: array[Todo], filter: Filter) i32 {
    let n: i32 = 0
    for (0..array.len(todos)) |i| {
        if matches(todos[i], filter) {
            n = n + 1
        }
    }
    n
}

export fn main() {
    let todos: array[Todo] = array[Todo].new_fixed(
        new_todo("learn utu"),
        new_todo("build compiler"),
        new_todo("ship it"),
    )

    toggle(todos[0])

    let active: i32 = count(todos, Active {})

    // Nullable import + force unwrap
    let data: str = fetch("/api/data") \ unreachable
    data -o console_log

    // Piped string concat
    "hello"
    -o str.concat(_, " world")
    -o console_log
}
```
