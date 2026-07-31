# Import and module reachability

Generated Wasm should pay only for capabilities that survive emission. There
are three distinct reachability problems; treating all of them as "tree
shaking" hides where each fact is available.

## 1. Feature-lowering activation

Some Binaryen lowerings install a complete host ABI. In particular,
`string-lowering-magic-imports` installs ten `wasm:js-string` functions and
several signatures even when the emitted module has no string values.

Codegen now records requirements while mapping the types that are actually
emitted. The string lowering runs only if an emitted signature, local, or
expression uses the `wasm-stringref` representation. This avoids inferring
usage from the merged DOM, which still contains standard-library intrinsic
wrappers that codegen deliberately does not emit.

## 2. Distribution optimization and post-lowering sweep

Every emitted module is finalized first with Binaryen optimize level 3 and
shrink level 2, then with a dedicated `-Oz` stage (optimize level 2, shrink
level 2). The second stage matters: max optimization can retain speed-oriented
shapes even when maximum shrink is enabled. This is a language invariant rather
than a caller option; utu does not expose an accidentally unoptimized binary
path.

A required lowering may still install more ABI than one program uses. After all
feature lowerings, codegen runs Binaryen's:

```text
remove-unused-module-elements
```

The sweep starts from exports and live references, preserving direct calls and
`ref.func` uses while removing dead functions, imports, globals, and signatures.
The current Binaryen release can emit malformed sections when this sweep is
combined with some GC, i31, or SIMD module shapes, so codegen records those
features during emission and conservatively skips the sweep for mixed-feature
modules. String-only and scalar-only modules take the swept path. Binaryen's
separate `remove-unused-types` pass is not run for the same reason.
For the rope benchmark this reduces the lowered string module from 426 bytes and
ten JS-string function imports to 123 bytes with only `concat` plus the imported
empty-string constant.

This post-lowering sweep is preferable to maintaining a second hand-written
mapping from each string operation to Binaryen's private magic-import ABI.
Binaryen remains the authority on how stringref operations lower; utu only asks
it to remove the products that proved unreachable.

## 3. IR-level declaration reachability

The backend currently materializes a broad top-level function set and relies on
the module sweep for binary dead-code elimination. If compile time or temporary
Binaryen module size becomes important, the same removal can happen earlier:

1. Root reachability at exported functions, runtime entry points, and DSL
   imports.
2. Traverse canonical call-graph edges.
3. Add functions referenced as values (`fun`) and lifted functions named by
   `ir-make-closure`.
4. Keep declarations and layout nodes reachable from retained function
   signatures, locals, fields, and allocations.
5. Feed that set into `backendPlan.emittableFunctions` and heap layout.

This must use canonical call/type/scope graphs. A DOM selector cannot distinguish
an intrinsic template, a callable value reference, and a genuinely dead
function reliably. The Binaryen sweep remains a final safety net even after
IR-level reachability is introduced.

## Invariant

Runtime imports are selected at the latest layer that knows the truth:

- closure, promise, and DSL requirements: retained backend plan;
- feature-lowering activation: emitted type/operation requirements;
- lowering-generated ABI members and signatures: post-lowering Binaryen sweep.
