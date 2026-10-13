# Import and module reachability

Generated Wasm should pay only for capabilities that survive emission. There
are three distinct reachability problems; treating all of them as "tree
shaking" hides where each fact is available.

## 1. Runtime requirements

Closure, promise, and DSL imports are selected by the retained backend plan
(`buildRuntimePlan`): a program that never builds a closure imports no
`closure_new`, one that never awaits imports no `await_*`.

String builtins are added by the module as string operations are emitted
(`wasm/module.js`): each `wasm:js-string` function and each string constant
is imported the first time codegen uses it.

## 2. The emission sweep

Encoding (`wasm/encode.js`) starts from the exports and follows calls,
`ref.func`, global reads and writes, and `catch` tags. Functions, imports,
globals, and tags nothing reaches are not emitted, and neither are types no
emitted element uses. So a program that declares a hundred `@es` bindings
and uses one emits the same binary as one that declares only that one, and
a module whose only string operation is `+` imports only `concat` (plus its
constants).

The sweep always runs. Binaryen's had to be skipped for modules mixing GC,
i31, and SIMD, where it could emit malformed sections; that exception is
gone with Binaryen.

## 3. IR-level declaration reachability

The backend still emits every top-level function into the module and lets
the sweep drop the unreachable ones. If compile time becomes important, the
same removal can happen earlier:

1. Root reachability at exported functions, runtime entry points, and DSL
   imports.
2. Traverse canonical call-graph edges.
3. Add functions referenced as values (`fun`) and lifted functions named by
   `ir-make-closure`.
4. Keep declarations and layout nodes reachable from retained function
   signatures, locals, fields, and allocations.
5. Feed that set into `backendPlan.emittableFunctions` and heap layout.

This must use canonical call/type/scope graphs. A DOM selector cannot
distinguish an intrinsic template, a callable value reference, and a
genuinely dead function reliably. The emission sweep remains a final safety
net even after IR-level reachability is introduced.

## Invariant

Runtime imports are selected at the latest layer that knows the truth:

- closure, promise, and DSL requirements: retained backend plan;
- string builtins and constants: the operations codegen emits;
- everything emitted: the sweep from the exports.
