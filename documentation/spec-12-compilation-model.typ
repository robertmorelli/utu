= 12. Compilation Model

== 12.1 Pipeline

Source → Parse → Typecheck → Lower to WAT → wasm-opt → `.wasm` binary. The
compiler is intentionally simple: no monomorphization, no borrow checking, no
complex optimization passes. The philosophy is to do minimal work in the
compiler and let the Wasm engine's optimizing tiers such as Turbofan and
IonMonkey handle the rest.

== 12.2 Type Lowering

All language types lower to WasmGC types within a single recursive type group
`rec`. For modules with many types, the compiler may perform SCC decomposition
to emit minimal `rec` groups, improving engine optimization. The ordering
within groups is topological by reference graph.

Const struct fields lower to non-mut Wasm fields. Mut struct fields lower to
`(mut ...)` Wasm fields.

== 12.3 Function Lowering

Functions lower directly to Wasm functions. Parameters become locals. The
implicit return, the last expression, is left on the value stack. The pipe
operator `-o` is desugared to nested function calls during lowering. `let`
bindings become `local.set` / `local.get` pairs.

== 12.4 Multi-Value Let Binding Lowering

When a function returns multiple values, Wasm leaves them on the stack in
declaration order. However, `local.set` pops from the top of the stack, so the
compiler must set bindings in *reverse order*:

```utu
let q: i32, r: i32 = divmod(10, 3)
```

Wasm lowering:

```wasm
(call $divmod (i32.const 10) (i32.const 3))
;; stack is now: [q_val, r_val] (r_val on top)
(local.set $r)  ;; pops top of stack (second return value)
(local.set $q)  ;; pops next value (first return value)
```

This applies to all multi-value returns including `,`, tensor product, and `#`,
exclusive disjunction. The compiler reverses the binding list when emitting
`local.set` instructions.

== 12.5 Error Lowering

A function with return type `A # B` is emitted with signature
`(result (ref null $A) (ref null $B))`. For extern imports, the compiler wraps
the import in a trampoline that uses `try` / `catch` from Wasm EH. On success,
push value then push `ref.null`. On catch, attempt `ref.cast` to `$B`; if cast
fails, use `throw_ref` to rethrow. If `B` is `null`, the catch branch is
`catch_all` and returns `(ref.null, i32.const 1)` or a similar sentinel.

== 12.6 Else Operator Lowering

The `\` operator lowers to `br_on_non_null` / `br_on_null` patterns:

- `expr \ fallback` -> check whether `expr` is null; if yes, evaluate fallback
- `expr \ unreachable` -> check whether `expr` is null; if yes, trap

For `#` returns, the compiler first extracts the success value, which is
nullable, and then applies the `\` logic.
