# Closure lowering and callable ABI

`cl(...) R` is always an ordinary JavaScript function carried as an externref,
so its identity is the function's (`===`, `removeEventListener`). A callback
returned to JavaScript needs no adapter at the call site. `fun(...) R` is the
UTU-only function-pointer representation, using Wasm function references and
`call_ref`. Converting `fun` to `cl` creates a JavaScript wrapper with a null
environment.

## Calling a closure (self-hosted compiler)

A closure's body is a Wasm function `(anyref env, params...) -> R`; it casts
the environment at entry, so every body of one signature has one function
type. Construction calls a module helper, `closure.new(fn, env, flags)`, which
builds a record struct `{fn: funcref, env: anyref}` and calls
`utu.closure_new(fn, env, flags, record)`. The host returns the JS function and
keeps the record on it under a symbol.

A call from UTU goes to a per-signature helper, `closure.call(closure,
params...)`:

1. `utu.closure_rec(closure)` returns the record, or null for a JavaScript
   function UTU did not make. It returns at once, so no JS frame stays on the
   stack.
2. With a record: if its funcref is a body of the signature, `call_ref` it with
   the environment; if it is a decayed `fun` of the signature, `call_ref` it
   without one.
3. Otherwise (a host function, or a signature that does not match), call the
   `utu.closure_call_*` import, as before.

The body runs on the caller's Wasm stack, so an `await` in it, or in anything
it calls, suspends up to the export's `WebAssembly.promising` wrapper. Exports
that can reach an await through a `call_ref` are wrapped: a `call_ref` may
reach any function taken as a value, and closure bodies are taken by
`ref.func`.

A closure the host calls (a `.then` callback, an event handler, a callback an
npm package keeps) runs through its JS function: JSPI cannot suspend through
that frame. The checker reports a closure written in the call (or bound by a
`let`) that awaits, or calls by name a function that may await, where it is
given to an `@es` or declared host function, or to a UTU function whose body is
`@ir`/`@es` or that passes the parameter to an `@es` function (`Promise.then`,
`Stream.map`). A closure value that reaches the host another way and suspends
fails at run time.

Measured: 2M calls of `apply(cl(n) { n * k; }, i)` (closure made each
iteration), warm, `-O fast`: Node 25 210 ms to 57 ms, Bun 175 ms to 60 ms;
with the closure made once, Node 90 ms to 15 ms, Bun 130 ms to 12 ms. A plain
JavaScript function called as a `cl` pays one more import call than before.

## Pass contract

`lowerClosures(doc, typeIndex, typeGraph)` consumes settled type facts and the
retained scope graph. It changes structure and returns whether anything changed,
including a program containing only function-to-closure coercions. After the
pass, callers must rebuild semantic graphs; the consumed graph is not reusable
as an analysis of the transformed program. Running the pass with freshly rebuilt
facts is a no-op when no literals or coercions remain.

Each literal becomes an environment struct, a lifted top-level function, and an
`ir-make-closure` expression at the original evaluation point. Captures are
matched by declaration identity, not spelling. Captures are evaluated at
construction and copied into the environment; GC references share their
referents.

A captured variable that is reassigned after it could have been captured
(inside any closure, later in its scope, or in a loop enclosing the closure) is
first rewritten by `box-captures.js` into a one-field struct cell: `x` becomes
`x.value`, and every closure shares the cell. Variables never reassigned after
capture stay plain copies, so the common case costs nothing.

The pass snapshots closures in iterative postorder. Children are lifted before
parents, preserving the generated capture reads needed for transitive captures.
Ordering does not repeatedly scan the growing program and does not depend on
JavaScript recursion depth. This makes *ordering* linear in the input tree;
rewriting deeply nested captured bodies can still involve multiple visits.
Sibling order is preserved for deterministic generated names.

Generated function and struct names avoid existing names. The environment
parameter also avoids names inside the closure, including locals that would
otherwise shadow it when bindings are rebuilt. Generated names are internal;
codegen optimization may remove them entirely from the shipped binary.

## Escape analysis boundary

Escape analysis must not switch a `cl` value to the `fun` representation or
bypass the JavaScript ABI (a call from UTU skips the JS frame, but the closure
is still made by `closure_new`). There is currently no escape-analysis pass. Before
adding one, identify an optimization that preserves this contract and measure
its effect on emitted Wasm and required JavaScript together.

A suitable future analysis would use a finite abstract domain, monotone transfer
functions, explicit joins at control-flow merges, and a terminating worklist.
Unknown calls, storage, returns, mutation, and nested captures must be handled
conservatively. A proof that a closure stays local is not, by itself, permission
to change its representation. Avoid carrying an unused analysis in the compiler.

## Regression coverage

`scripts/compiler-quality-tests.mjs` covers generated-name collisions, parameter
and local shadowing, transitive captures, decay-only change reporting, second-pass
stability, JavaScript callback compatibility, and the separate function-pointer
ABI. A size regression checks that adding unreachable closure code leaves a
simple exported program's emitted binary byte-identical.
