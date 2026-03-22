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
- pipelines for linear-looking data flow
- a value-based error model using `#` and `\`
- direct names for WasmGC allocation and reference operations

But the generated shape remains close enough that you can usually predict the
WAT by inspection.
