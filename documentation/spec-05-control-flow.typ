= 5. Control Flow

Every control flow construct maps directly to a Wasm structured control flow
instruction. There is no lowering gap: what you write is what gets emitted.

== 5.1 Conditionals

```utu
// if-else expression (like Rust, evaluates to a value)
let max: i32 = if a > b { a } else { b }

// Wasm lowering:
// (if (result i32) (i32.gt_s (local.get $a) (local.get $b))
//     (then (local.get $a))
//     (else (local.get $b)))
```

== 5.2 Loops

Zig-style `for` loops. The loop header takes iterables or ranges in
parentheses, and captures are bound in `|...|` after the closing paren.

```utu
// Counted loop — range + capture
for (0..n) |i| {
    sum = sum + i
}

// Multiple ranges / counters
for (0..width, 0..height) |x, y| {
    draw_pixel(x, y)
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

*Wasm lowering:* `for (0..n) |i| { ... }` lowers to:

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

== 5.3 Blocks with Return

Rust-style labeled blocks that evaluate to a value. Labels are bare
identifiers, with no tick prefix. This maps to Wasm `block` with `br`.

```utu
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

== 5.4 Switch / Match

Pattern matching on scalars uses `br_table`. Pattern matching on sum types
uses `br_on_cast` chains with an `unreachable` trap for non-exhaustive
matches.

```utu
// Scalar switch -> br_table
match opcode {
    0 => handle_nop(),
    1 => handle_add(),
    2 => handle_sub(),
    _ => unreachable,
}

// Type switch -> br_on_cast chain
match shape {
    s: Circle => area_circle(s),
    s: Rect => area_rect(s),
    s: Triangle => area_tri(s),
}
```

*Wasm lowering for type match:*

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

== 5.5 Unreachable

```utu
// Traps the program. Maps directly to (unreachable)
unreachable
```
