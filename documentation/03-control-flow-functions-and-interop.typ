= Control Flow, Functions, And Interop

== Structured Control Flow

The spec makes a strong promise: every control-flow form is designed to lower
directly into Wasm structured control flow. There is no large "desugaring gap"
between source and emitted code.

== Conditionals

`if` is an expression, not just a statement. That allows Rust-style value
selection:

```utu
let max: i32 = if a > b { a } else { b }
```

At the Wasm level this is a plain `if` with a result type.

== Loops

Utu uses Zig-style `for` syntax:

```utu
for (0..n) |i| {
    sum = sum + i
}

for (cond()) {
    body()
}

for () {
    if done() { break }
}
```

The loop forms cover:

- counted loops over a single range
- while-style loops where the source expression is the condition
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

Labeled blocks evaluate to values. A `break` targeting the label exits the
block early and supplies the resulting value.

```utu
let result: i32 = compute: {
    if shortcut() {
        break compute 42
    }
    expensive_calculation()
}
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
}
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
assert value != null
assert add(2, 2) == 4
```

The lowering is direct: evaluate the condition as `i32`, invert it, and emit a
no-result Wasm `if` that executes `unreachable` on failure.

== Function Definitions

Function syntax keeps parameters in parentheses and places the return type
immediately after the parameter list:

```utu
fn add(a: i32, b: i32) i32 {
    a + b
}

fn clamp(val: f32, lo: f32, hi: f32) f32 {
    if val < lo { lo }
    else if val > hi { hi }
    else { val }
}

fn greet(name: str) {
    name -o console_log
}
```

Important conventions:

- the last expression is the implicit return value
- void functions simply omit the return type
- parameters are unrestricted because they are already named bindings

== Pipe Operator

The `-o` operator is Utu's core linear-flow surface. It feeds the value on the
left into the function on the right.

Single-argument pipelines stay minimal:

```utu
a -o f -o g
```

That means the same thing as `g(f(a))`.

Multi-argument pipelines use `_` to mark the slot receiving the piped value:

```utu
a
-o f
-o z(_, c, d)

x -o clamp(0.0, _, 1.0)
```

This is syntactic sugar only. Lowering turns pipes into ordinary function
calls, which keeps the compiler simple and the runtime model transparent.

== Bindings

`let` introduces reusable names and always requires an explicit type
annotation.

```utu
let config: Config = load_config()
init(config)
validate(config)

load_config() -o init

let q: i32, r: i32 = divmod(10, 3)
```

The discipline is:

- use `let` when a value must be reused or named
- prefer pipes and inline expressions for single-use values
- destructure multi-value returns directly in the binding list

== Imports

JS imports use `import extern "es" ...`:

```utu
import extern "es" console_log(str)
import extern "es" fetch(str) Response # null
import extern "es" fetch(str) Response # ApiError
import extern "es" document: externref
```

The string builtins are special: they are auto-imported and do not need
declarations in source files.

`T # null` imports compile as nullable returns. `T # E` imports compile as
direct two-result Wasm import signatures. In the generated JS wrapper, throws
from nullable-compatible imports currently become null placeholders so fallback
and null checks can handle them. Structured typed error lowering is still
planned.

== Exports

Wasm exports are ordinary functions marked with `export`:

```utu
export fn main() {
    "hello world" -o console_log
}
```

== In-Source Tests And Benchmarks

The language also supports top-level `test` and `bench` items:

```utu
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

Normal program compilation ignores these declarations. Test mode synthesizes
zero-argument exports, while bench mode synthesizes one exported function per
benchmark that takes an `i32` iteration count. The host runs those exports
ephemerally and reports failures or timing.

== Polymorphic Dispatch

The language does not bake in a hidden vtable model. Current compiler support
keeps dispatch explicit through type-based `alt` lowering:

```utu
fn describe(s: Shape) str {
    alt s {
        c: Circle => "circle",
        r: Rect => "rect",
        t: Triangle => "triangle",
    }
}
```

This keeps the runtime behavior visible in the language surface and aligned
with Wasm's own dispatch mechanisms.

=== Future Work

First-class function references and `call_ref`-based dispatch are still
planned rather than implemented end to end today.
