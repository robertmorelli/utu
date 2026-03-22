= 5. Control Flow

Every control flow construct maps directly to a Wasm structured control flow
instruction. There is no lowering gap: what you write is what gets emitted.

== 5.1 Conditionals

```utu
// if-else expression (like Rust, evaluates to a value)
let max: i32 = if a > b { a; } else { b; };

// Wasm lowering:
// (if (result i32) (i32.gt_s (local.get $a) (local.get $b))
//     (then (local.get $a))
//     (else (local.get $b)))
```

== 5.2 Loops

Range `for` loops pair with condition-style `while` loops. `for` takes a
range in parentheses and binds captures in `|...|` after the closing paren.

```utu
// Counted loop — range + capture
for (0..n) |i| {
    sum = sum + i;
};

// While-style loop (condition only)
while (cond()) {
    body();
};

// Infinite loop (empty parens)
while () {
    if done() { break; };
};
```

Today the compiler lowers one source/capture pair. The parser accepts
comma-separated sources and captures, but only the first pair currently has a
defined lowering.

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
identifiers, with no tick prefix. `emit expr` exits the current labeled block
with a value, while plain `break` remains loop-only.

```utu
let result: i32 = compute: {
    if shortcut() {
        emit 42;
    };
    expensive_calculation();
};

// Wasm lowering:
// (block $compute (result i32)
//     (br_if $compute (i32.const 42) (call $shortcut))
//     (call $expensive_calculation))
```

== 5.4 Match / Alt

Scalar `match` compares literal arms directly. Type-based `alt` uses
`br_on_cast` chains with a final `fatal` path, lowered with Wasm
`unreachable`.

```utu
// Type switch -> br_on_cast chain
alt shape {
    s: Circle => area_circle(s),
    s: Rect => area_rect(s),
    s: Triangle => area_tri(s),
};
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

== 5.5 Fatal

```utu
// Source-level trap keyword. Lowers directly to (unreachable)
fatal;
```
