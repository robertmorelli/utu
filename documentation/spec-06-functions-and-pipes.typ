= 6. Functions and Pipes

== 6.1 Function Definitions

Functions list parameters in parentheses followed directly by the return type,
with no `->` arrow. Implicit return of the last expression follows Rust
conventions. Parameters are unrestricted and implicitly reusable because they
are named. Void functions omit the return type.

```utu
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

== 6.2 Pipe Operator

The `-o` operator, the lollipop from linear logic, pipes a value into the next
function. The left side is consumed by the right side.

For *single-argument* functions, the pipe target is just the function name:
there are no parentheses and no underscore.

```utu
a -o f -o g

// Equivalent to: g(f(a))
```

For *multi-argument* functions, use parentheses with `_` marking where the
piped value goes:

```utu
a
-o f
-o z(_, c, d)

// Equivalent to: z(f(a), c, d)

// _ can appear in any argument position
x -o clamp(0.0, _, 1.0)
```

*Chained example:*

```utu
"hello"
-o str.concat(_, " world")
-o console_log
```

*Wasm lowering:* The pipe is pure syntactic sugar. `a -o f` desugars to `f(a)`.
`a -o f(_, b)` desugars to `f(a, b)`. The lowering is a direct function call.

== 6.3 Bindings

`let` is the binding keyword. It promotes a value to unrestricted use, the
linear-logic exponential `!`. Every named binding is reusable. A type
annotation is always required. If you only use a value once, prefer piping or
inlining and skip the binding.

```utu
// Reusable binding (type always required)
let config: Config = load_config()
init(config)
validate(config)   // used again — fine, it's let-bound

// No binding needed for single use
load_config() -o init

// Destructuring multi-return
let q: i32, r: i32 = divmod(10, 3)
```
