# Control-flow experiments

Language features here were held to one bar: **fast and small**, measured on
two engines, or they stay out of the language. Numbers below are medians on an
Apple Silicon Mac, V8 = Node 25.8, JSC = Bun 1.4.2. Reproduce with:

```sh
node benchmarks/control-flow/<script>.mjs   # V8
bun  benchmarks/control-flow/<script>.mjs   # JSC
```

## Sentinel-terminated arrays — rejected (`sentinel-arrays.mjs`)

Idea: store a `null`/`0` after the last element so iteration can stop on the
sentinel instead of comparing against the length.

| 1M elements | V8 ns/elem | JSC ns/elem | loop bytes |
| --- | --- | --- | --- |
| i32, counted | 0.83 | 0.83 | 255 |
| i32, sentinel | 0.79 | 0.88 | 248 |
| ref, counted | 0.80 | 0.88 | 260 |
| ref, sentinel | 0.78 | 0.90–0.98 | 251 |

V8 gains 2–5%; JSC loses 3–10%. WasmGC has no unchecked `array.get`, so the
engine's bounds check stays either way: the sentinel only replaces our own
`i < len`. The whole-program costs are not in these numbers: one extra slot per
allocation, `len - 1` at every length use, `0` being a legitimate element of
numeric arrays, and non-null element arrays becoming nullable (a cast per
access). Not faster everywhere, not smaller overall, so arrays stay counted.

## Dispatch shapes for a switch loop (`dispatch-shapes.mjs`)

The same interpreter, hand-written in three wasm shapes:

| workload | central `br_table` | per-site `br_table` | tail calls |
| --- | --- | --- | --- |
| repeating 1→2→3, 30M dispatches, V8 | **56.8 ms** | 61.4 ms | 59.9 ms |
| repeating 1→2→3, JSC | **55.7 ms** | 59.8 ms | 69.5 ms |
| correlated 4,096-op program, 16M dispatches, V8 | 65.6 ms | **27.1 ms** | 45.8 ms |
| correlated 4,096-op program, JSC | 34.5 ms | **20.9 ms** | 40.2 ms |
| ... with arms duplicated (2 copies), V8 / JSC | | **22.5 / 18.7 ms** | |

With realistic, correlated transitions, a dispatch per transition site is
2.4× (V8) and 1.7× (JSC) faster than one shared dispatch: the predictor learns
"after op A comes op B". Tail-call threading (`return_call_indirect` per site)
pays call overhead and loses. Structured wasm cannot give *every* edge a
direct branch — a landing point must be a block end (forward) or a loop head
(backward), and for an all-to-all state graph those intervals cross — so
backward edges in the per-site shape re-enter through the loop head's table.
Laying the arms out twice makes every edge from the first copy a forward edge,
for another 12–17% at roughly twice the arm code.

## `loop match` — accepted (`switch-loop.mjs`, `json.mjs`)

```utu
loop match state {
    0 => { ...; continue 1; },     // jump to state 1
    1 => { ...; break; },          // leave the loop
    ~> { ... },                    // an arm that finishes also leaves
};
```

Lowering (dense integer states): `block $exit (loop $dispatch …)` with one
block per arm in source order. A constant `continue` to a later arm is a plain
`br`; a dynamic `continue` gets its own `br_table` at that site whose entries
jump straight to later arms and route earlier ones through the loop head. At
`-O3` the arms are emitted twice (the duplicated shape above). Sparse or
non-I32 states use the ordinary `match` dispatch.

JSON parser (`examples/json/json.utu`, 4.1 MB document):

| | V8 | JSC | wasm / gzip |
| --- | --- | --- | --- |
| `loop match`, -Oz | **12.8 ms** (322 MB/s) | **31.0 ms** | **2,230 / 920 B** |
| `while` + `match`, -Oz | 13.3 ms | 32.1 ms | 2,290 / 930 B |
| `loop match`, -O3 | 12.6 ms | 30.8 ms | 4,092 / 1,022 B |
| `JSON.parse` (builds objects) | 12.9 ms | 9.4 ms | |

Three-state lexer (4 MB): -Oz is 18% faster on V8 and level on JSC; -O3 is 25%
(V8) and 19% (JSC) faster than `while` + `match`, for ~230 extra bytes. On a
perfectly regular 1→2→3 interpreter the shapes are within noise of each other.
At the default -Oz the JSON parser is both faster on both engines and smaller.

## Generators — inline expansion, accepted (`generators.mjs`)

```utu
fn squares(n: I32) yield I32 {
    for (0..<n) |i| { if i % 3 != 0 { yield i * i; }; };
}
for (squares(10)) |x| { ... };        // or: await for (…) |x| { … }
```

Sum of squares of 0..2M that are not multiples of 3, written five ways (-Oz):

| strategy | V8 | JSC | 1 consumer | 3 consumers |
| --- | --- | --- | --- | --- |
| **`yield`** (the language feature) | 2.6 ms | 2.5 ms | **78 B** | **92 B** |
| hand-inlined loop | 2.6 ms | 2.5 ms | 78 B | 92 B |
| materialize an array | 7.1 ms | 8.7 ms | 308 B | 322 B |
| callback per value | 42 ms | 68 ms | 273 B | 428 B |
| state machine (frame + `next`) | 1.9 ms | 1.5 ms | 170 B | 184 B |

Callbacks (16–27× slower) and materialization (3× slower, 4× larger) fail the
bar. A first-class state machine is fast here only because Binaryen inlines
`next` and Heap2Local turns the non-escaping frame into locals; it is more
than twice the bytes, and it needs a regenerator-style rewrite of control flow
around every `yield`. Inline expansion is the smallest, and a consumed
generator compiles to exactly the bytes of the hand-written loop at both -Oz
and -O3 (where it is unrolled the same way). The trade: generators are
consumed directly by `for`/`await for`, not stored or passed. That is a
compile-time error. Recursive generators take a different lowering; see below.

Because `await` suspends the wasm stack (JSPI), a generator body may await;
`await for` is the same expansion, so async generators cost nothing extra.

## Recursive generators — explicit stack (`recursive-generators.mjs`)

```utu
fn walk(n: Node) yield Node {
    for (children(n)) |c| { yield c; for (walk(c)) |d| { yield d; }; };
}
for (walk(root)) |n| { if is_function(n) { prune; }; ... };
```

A generator that delegates to itself cannot expand inline, so it runs as one
loop over an explicit stack of items (values and pending calls) and frames.
The generator body and the consumer each appear once. A `yield c` followed by
`for (walk(c))` is a single item, consumed as a value and then run as the call.

An AST-shaped tree of 6.1M nodes (leaves, binary nodes, lists of 2–5) walked
four ways at -Oz. "Pruned" skips lists of five; "find" stops at 70% of the walk.

| strategy | full V8 | full JSC | pruned V8 | pruned JSC | find V8 | find JSC | module |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **recursive generator** | 59–67 ms | 60–67 ms | 7.8–8.5 ms | 3.9 ms | 37–41 ms | 42 ms | 2,531 B |
| recursion over a `children` generator | 27–32 ms | 20 ms | 7.5–7.7 ms | 3.3 ms | 21–25 ms | 14 ms | 1,188 B |
| callback per child (`cl`, tsc's `forEachChild`) | 640–690 ms | 482 ms | 39 ms | 27 ms | — | — | 890 B |
| JavaScript objects, `forEachChild` | 58–83 ms | 78 ms | 8–11 ms | 5.4 ms | 40–46 ms | 44 ms | — |

Ranges are medians from separate runs (V8 = Node 25.8, JSC = Bun 1.4.2).

The recursive generator is 2× (V8) to 3× (JSC) slower than hand-written
recursion over a full walk, and within 15% when most of the tree is pruned. Every
node is written to the item stack and read back, and every array access is
bounds-checked; recursion keeps the child in a register and its place in the
call stack. Moving the running frame's cursor into locals, sharing the value and
argument arrays, and fusing yield-then-delegate items brought it from 77 ms to
about 60 ms; the remaining gap is the item stack itself. It matches
or beats the same walk in plain JavaScript, is 10× faster than a closure per
child, and has no depth limit. Recursion stays the faster way to write a visitor;
the generator buys depth-first order as a loop with `break` and `prune`.
