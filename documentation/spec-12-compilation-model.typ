= 12. Compilation Model

== 12.1 Pipeline

Source -> Parse -> parse-error validation -> Lower to WAT -> Binaryen parse
and optimize -> `.wasm` binary. The compiler is intentionally simple:
no monomorphization, no borrow checking, no complex optimization passes. The
philosophy is to do minimal work in the compiler and let the Wasm engine's
optimizing tiers handle the rest.

== 12.2 Type Lowering

All language types lower to WasmGC types within a single recursive type group
`rec`. For modules with many types, the compiler may perform SCC decomposition
to emit minimal `rec` groups, improving engine optimization. The ordering
within groups is topological by reference graph.

Const struct fields lower to non-mut Wasm fields. Mut struct fields lower to
`(mut ...)` Wasm fields.

== 12.3 Function Lowering

Functions lower directly to Wasm functions. Parameters become locals.
Semicolons terminate expressions, but the last expression in a typed function
or block is still left on the value stack as the implicit return. The pipe
operator `-o` is desugared to nested function calls during lowering. `let`
bindings become `local.set` / `local.get` pairs.

== 12.4 Multi-Value Let Binding Lowering

When a function returns multiple values, Wasm leaves them on the stack in
declaration order. However, `local.set` pops from the top of the stack, so the
compiler must set bindings in *reverse order*:

```utu
let q: i32, r: i32 = divmod(10, 3);
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
`(result (ref null $A) (ref null $B))`. Extern imports still use that same
declared Wasm signature directly. In the generated JS wrapper, throws from
nullable-compatible imports are currently coerced to null placeholders instead
of a structured typed error branch.

== 12.6 Else Operator Lowering

The `\` operator lowers on nullable references in two ways:

- `expr \ fatal` -> evaluate `expr`, then apply `ref.as_non_null`
- `expr \ fallback` -> evaluate `expr`, keep the non-null branch, otherwise
  evaluate `fallback`
