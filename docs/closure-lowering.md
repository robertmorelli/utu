# Closure lowering and callable ABI

`cl(...) R` is always an ordinary JavaScript function carried as an externref.
Construction calls `utu.closure_new`; invocation calls a signature-specific
`utu.closure_call_*` import. This includes closures whose only use is a local
call. A callback returned to JavaScript needs no adapter at the call site.
`fun(...) R` is the UTU-only function-pointer representation, using Wasm
function references and `call_ref`. Converting `fun` to `cl` explicitly creates
a JavaScript wrapper with a null environment.

## Pass contract

`lowerClosures(doc, typeIndex, typeGraph)` consumes settled type facts and the
retained scope graph. It changes structure and returns whether anything changed,
including a program containing only function-to-closure coercions. After the
pass, callers must rebuild semantic graphs; the consumed graph is not reusable
as an analysis of the transformed program. Running the pass with freshly rebuilt
facts is a no-op when no literals or coercions remain.

Each literal becomes an environment struct, a lifted top-level function, and an
`ir-make-closure` expression at the original evaluation point. Captures are
matched by declaration identity, not spelling. Scalars are copied snapshots;
GC references share their referents, but later rebinding does not change the
captured reference. Captures are evaluated at construction, not invocation.

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
bypass the JavaScript ABI. There is currently no escape-analysis pass. Before
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
