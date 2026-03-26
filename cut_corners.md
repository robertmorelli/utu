# Compiler Cut Corners Audit

This is a blunt audit of the compiler pipeline in `index.js`, `expand.js`, `watgen.js`, `jsgen.js`, and the nearby tooling glue that has to compensate for compiler behavior.

I treated "cut corner" broadly:

- confirmed semantic/codegen bugs
- architectural shortcuts that make the compiler fragile or hard to extend
- documented temporary behavior that is still a real limitation
- small ugliness that will keep leaking into tooling and feature work

Legend:

- `Verified`: I reproduced the behavior locally against the checked-in compiler/CLI.
- `Static`: found directly by reading the current source.
- `Docs`: explicitly admitted in the README/spec, but still worth tracking as current debt.

## Confirmed Behavioral Problems

### 1. Value-position `if` without `else` emits invalid WAT
Status: `Verified`

Where: `watgen.js:1522-1546`

Why it is a cut corner: `genIf()` will still emit `(if (result ...))` when a tail-position/value-position `if` has no `else`. Wasm does not allow a reachable result-producing `if` without an `else`, so this is not a graceful language error; it is malformed backend output.

Observed repro:

```utu
fun bad(flag: bool) i32 {
    if flag {
        1;
    };
}
```

Observed result: Binaryen/validator failure about `if without else must not return a value`.

### 2. Multi-source `for` loops only lower the first source/capture pair, but later captures are still declared
Status: `Verified`, `Docs`

Where: `README.md:38-43`, `documentation/spec.typ:44-49`, `documentation/spec.typ:474-476`, `watgen.js:254-259`, `watgen.js:1722-1745`

Why it is a cut corner: the parser accepts multiple sources/captures, locals are declared for all of them, but codegen only initializes and iterates the first pair. That means later captures are not just ignored; they can read as default-zero locals and silently corrupt results.

Observed repro:

```utu
export fun main() i32 {
    let total: i32 = 0;
    for (0..2, 10..12) |i, j| {
        total = total + i + j;
    };
    total;
}
```

Observed result: returned `1`. A sane lowering would have used both ranges and returned `22`.

Required follow-up: since multi-source `for` is not supported yet, it should be removed from the spec/documentation surface for now rather than described as a partial feature. The implementation should stay clearly single-range until full support actually exists.

### 3. `promote` without `else` invents an implicit default-value branch
Status: `Verified`

Where: `watgen.js:1549-1592`, `watgen.js:2108-2111`

Why it is a cut corner: if `promote` is used in a value position and the nullable input is null, the compiler does not force the user to handle the null path. It silently synthesizes `0`/`ref.null` via `defaultValue(...)`.

Observed repro:

```utu
struct Box { value: i32 }

fun maybe_box(flag: bool) ?Box {
    if flag { Box { value: 41 }; } else { ref.null Box; };
}

fun promote_no_else(flag: bool) i32 {
    promote maybe_box(flag) |box| {
        box.value;
    };
}
```

Observed result: `promote_no_else(false)` returned `0`.

This is undocumented semantics, and it gets even shakier for non-scalar result shapes because `defaultValue()` is extremely ad hoc.

### 4. Partial struct initialization silently fills omitted fields with zero/null defaults
Status: `Verified`

Where: `watgen.js:1823-1837`, `watgen.js:2108-2111`

Why it is a cut corner: missing fields are not rejected. They are backfilled with `defaultValue(field.type)`, which means omitted scalars become zero and omitted references become `ref.null ...`.

Observed repro:

```utu
struct Pair {
    left: i32,
    right: i32,
}

fun make() Pair {
    Pair { left: 7 };
}
```

Observed result: reading `pair.right` produced `0`.

Required follow-up: if zero/default fill is intended language behavior, the compiler/spec/docs should say so explicitly. This should also be surfaced in editor hover info so users can see which fields are implicitly defaulted when they omit them during struct construction.

### 5. Method-call sugar only desugars for a small whitelist of receiver expression shapes
Status: `Verified`

Where: `expand.js:906-912`, `expand.js:1092-1137`, `watgen.js:327-329`

Why it is a cut corner: method dispatch in the expander depends on `inferExprInfo()`, and that function only recognizes a few node kinds (`identifier`, `paren_expr`, `struct_init`, `call_expr`, `promoted_module_call_expr`, `else_expr`, `promote_expr`). If the receiver is an `if`, `block`, nested field access, `match`, `alt`, and so on, the sugar is left behind for the backend to explode on.

Observed repro:

```utu
struct Vec {
    left: i32,
    right: i32,
}

fun Vec.total(self: Vec) i32 {
    self.left + self.right;
}

export fun main() i32 {
    (if true { Vec { left: 1, right: 2 }; } else { Vec { left: 3, right: 4 }; }).total();
}
```

Observed result: `Unresolved method call '.total()': desugar p.method() in expand.js before watgen`.

This same phase-coupling also affects explicit protocol-call receiver inference in `expand.js:1206-1227`.

### 6. Module-local `test`, `bench`, and `construct` declarations are silently dropped instead of supported or rejected
Status: `Verified` for `test`, `Static` for the rest

Where: `documentation/spec.typ:901-903`, `expand.js:323-326`, `expand.js:331-345`, `expand.js:465-493`

Why it is a cut corner: module bodies are supposed to reuse most declaration forms, but the expander emits `''` for `construct_decl`, `test_decl`, and `bench_decl` inside modules. There is no error, no warning, and no lowered output.

Observed repro:

```utu
mod sample {
    test "hidden" {
        assert true;
    }
}
```

Observed result: `utu test` reported `No tests found`.

This is worse than "unsupported": it is silent data loss.

Required follow-up: these forms should become explicit compile errors until real module-local support exists.

### 7. First-class function references are parsed and partially threaded through the backend, but still fail late and cryptically
Status: `Verified`, `Docs`

Where: `README.md:38-43`, `documentation/spec.typ:44-49`, `documentation/spec.typ:98-100`, `watgen.js:1179`, `watgen.js:1891-1932`, `watgen.js:2200`

Why it is a cut corner: the compiler accepts `fun(...) ...` types, carries them through `parseType()`, can emit them in import/global positions, and can mention `call_ref`, but it does not emit the needed `$func_...` type definitions as a stable end-to-end feature.

Observed repro:

```utu
shimport "es" callback: fun(i32) i32;
export fun main() i32 { 0; }
```

Observed result: late backend failure, `Fatal: ... error: unknown type identifier`.

That is a half-wired surface, not a cleanly gated unsupported feature.

## Architectural Shortcuts

### 8. There is no single semantic phase
Status: `Static`

Where: `expand.js:46-69`, `expand.js:140-164`, `expand.js:686-723`, `expand.js:857-1237`, `watgen.js:1972-2049`, `jsgen.js:56-125`

Why it is a cut corner: semantic work is split across three places.

- `expand.js` builds symbol tables, tracks return info, resolves associated functions, and does ad hoc receiver/protocol inference.
- `watgen.js` reparses the already-expanded source and does another separate round of inference and validation.
- `jsgen.js` separately walks the tree again for strings/import shapes.

That is a classic phase-skew setup. Every new feature has to stay consistent across multiple hand-written semantic mini-systems.

### 9. The module system is implemented as source-to-source rewriting plus reparsing
Status: `Static`

Where: `index.js:77-88`, `expand.js:72-89`

Why it is a cut corner: module lowering does not produce an IR. It emits fresh source text, reparses it, and then continues compilation from the reparsed tree.

Consequences:

- original comments and formatting are thrown away
- source positions after expansion no longer point at the user's original code
- later compiler errors cannot be mapped cleanly back to pre-expansion syntax
- module lowering has to preserve language syntax perfectly because it is literally re-feeding source text back into the parser

### 10. The frontend relies on Binaryen optimization to clean up front-end duplication
Status: `Static`

Where: `expand.js:72-89`, `expand.js:291-326`, `index.js:91-99`, `scripts/test-modules.mjs:1052-1056`, `scripts/test-modules.mjs:1119-1136`

Why it is a cut corner: compile-time module instantiation eagerly duplicates lowered code. The repo even has a regression test whose point is that Binaryen strips unused instantiated functions after the fact.

That means the front end is not doing its own liveness/instantiation control. It is producing extra code and trusting the optimizer to save it.

### 11. Binaryen validator wording is part of the compiler's semantic contract
Status: `Static`

Where: `index.js:91-117`, `scripts/test-modules.mjs:931-975`, `scripts/test-modules.mjs:1058-1079`

Why it is a cut corner: a meaningful chunk of "type checking" is really "generate WAT and see whether Binaryen accepts it." The tests explicitly lock onto Binaryen phrases like `function body type must match`, `call param types must match`, and `global init must be constant`.

That works for a small compiler, but it makes UTU's diagnostics backend-specific, late, and hard to evolve independently from Binaryen.

### 12. Binaryen stderr capture is global, monkey-patched, and concurrency-unsafe
Status: `Static`

Where: `index.js:1-10`, `index.js:102-117`

Why it is a cut corner: the compiler globally replaces `console.error`, and `_binaryenCapture` is a singleton with a single `active` flag and shared `lines` buffer.

If two compile/validate operations overlap, they can interleave diagnostics or flip capture state underneath each other. The process-wide console mutation is also a bad boundary for any embedded/compiler-as-library use.

### 13. The compiler always optimizes aggressively; there is no debug/no-opt backend mode
Status: `Static`

Where: `index.js:91-99`

Why it is a cut corner: the code generator does not expose a way to inspect "raw" generated backend output before Binaryen rewrites it. That makes debugging backend bugs harder and deepens the dependence on optimizer behavior.

### 14. Sum types are always treated as recursive, even when the source did not say `rec`
Status: `Static`

Where: `expand.js:551-559`, `watgen.js:2159-2170`

Why it is a cut corner: `expand.js` preserves the user-written `rec` spelling, but `watgen.js` hard-codes every `type_decl` to `rec: true`. In practice, non-recursive sum types are still emitted in the recursive type bucket.

That means the syntax surface and backend model disagree, and the `rec` marker is effectively ignored for sum types.

### 15. Type representation is stringly and equality is `JSON.stringify(...)`
Status: `Static`

Where: `watgen.js:302-306`, `watgen.js:1960-2021`, `watgen.js:2048-2049`, `watgen.js:2363-2364`

Why it is a cut corner: type information bounces between structured objects and magic strings like `nullable_foo` / `foo_array`. Equality is deep-compared by serializing both types to JSON.

This is fast to prototype, but it is brittle. It makes the type system easy to desynchronize and hard to refactor once the language surface grows.

### 16. Branch result typing is guessed from one branch/arm instead of checked as a real language rule
Status: `Static`

Where: `watgen.js:1529-1531`, `watgen.js:1604-1605`, `watgen.js:1655-1656`

Why it is a cut corner: `if`, `alt`, and `match` pick a result type from the `then` branch or the last arm, then try to force the rest of the construct into that shape. This is not a principled branch type-checker.

That is why mismatches tend to show up as backend validation errors instead of clear source-language diagnostics.

## Interop And Tooling Shortcuts

### 17. `jsgen` classifies imports by source text instead of AST shape
Status: `Static`

Where: `jsgen.js:109-115`

Why it is a cut corner: `groupImports()` decides whether an import is a function by checking `item.text.includes('(')`.

That is brittle. It is the wrong level of abstraction, and it is especially unsafe around any type spelling that can contain parentheses.

### 18. Nullable/exclusive host imports catch every JS exception and coerce it into placeholder values
Status: `Verified`, `Docs`

Where: `jsgen.js:144-155`, `documentation/spec.typ:1159-1162`

Why it is a cut corner: the generated JS wrapper turns any thrown exception from a nullable-compatible import into `null` or `[null, null]`.

That means:

- real host bugs get flattened into "ordinary" language-level null/error placeholders
- JS stack traces disappear
- UTU import behavior becomes non-transparent
- there is still no proper typed error translation

Observed generated wrapper shape:

```js
(...__args) => { try { return resolved(...__args); } catch { return null; } }
```

and

```js
(...__args) => { try { return resolved(...__args); } catch { return [null, null]; } }
```

### 19. The editor has to reverse-engineer compiler errors with regexes
Status: `Static`

Where: `extension/diagnostics.js:72-116`

Why it is a cut corner: the compiler does not return structured diagnostics. The VS Code side has to scrape strings for `Fatal: line:column`, `function at index ...`, or specific Binaryen phrases and then guess a range.

That makes the tooling layer brittle and tightly coupled to the exact text of compiler errors.

### 20. String/import metadata collection is duplicated across backend and shim generation
Status: `Static`

Where: `watgen.js:885-912`, `jsgen.js:56-82`, `jsgen.js:95-125`

Why it is a cut corner: both the WAT generator and the JS shim generator walk the tree to collect strings/import metadata. There is no single shared compile metadata object produced once by a dedicated analysis pass.

That is not a correctness bug today, but it is a synchronization hazard.

## Documented Current Limits That Still Matter

### 21. Nested `export` inside modules is explicitly unsupported
Status: `Docs`

Where: `README.md:38-43`, `documentation/spec.typ:44-49`, `expand.js:167-177`

Why it matters: this is a real surface hole, not just a code comment. Module bodies look broad on paper, but export support stops at the top level.

### 22. `proto` declarations and protocol implementations stay top-level only
Status: `Docs`

Where: `README.md:38-43`, `documentation/spec.typ:44-49`, `expand.js:510-523`, `expand.js:587-592`

Why it matters: protocols are not actually part of the module system yet. That keeps protocol organization and namespacing flatter than the rest of the language surface suggests.

### 23. Multiple `for` sources/captures are parser-visible but compiler-partial
Status: `Docs`, `Verified`

Where: `README.md:38-43`, `documentation/spec.typ:44-49`, `documentation/spec.typ:474-476`, `watgen.js:254-259`, `watgen.js:1722-1745`

Why it matters: this is not just a missing optimization or a parser-only extension. It changes program behavior today if a user assumes the surface syntax is actually implemented.

Recommended resolution: remove multi-source/capture `for` from the public spec/docs for now, and document only the single-range form until full lowering exists.

### 24. `v128.*` numeric helper surface is still missing
Status: `Docs`

Where: `documentation/spec.typ:741-742`

Why it matters: the type exists in the language surface, but parts of the intended numeric helper story are still absent.

## Smaller Ugliness And Maintainability Debt

### 25. Module-local unsupported forms are inconsistently handled
Status: `Static`

Where: `expand.js:167-177`, `expand.js:465-493`

Why it is ugly: module-local `export` is rejected loudly, but module-local `test`, `bench`, and `construct` are just dropped. Unsupported syntax should fail consistently, not disappear depending on declaration kind. The right behavior here is to reject them explicitly.

### 26. The backend deliberately treats unresolved field calls as a phase-order failure
Status: `Static`

Where: `watgen.js:327-329`, `scripts/test-modules.mjs:1043-1050`

Why it is ugly: the WAT backend explicitly says method calls must already have been desugared by `expand.js`. That is a strong sign the backend is not robust in its own right and is relying on front-end phase ordering as an invariant.

### 27. The compiler library surface is not especially host-agnostic
Status: `Static`

Where: `index.js:1-10`, `jsgen.js:131-155`

Why it is ugly: process-wide console patching, implicit global-object fallbacks, and JS exception rewriting all bleed host/runtime assumptions into what is supposed to be a reusable shared compiler core.

## Bottom Line

The biggest pattern in this compiler is not one isolated bug. It is that a lot of semantics are implemented "just enough" inside whatever phase happened to need them first:

- module lowering is a source rewriter rather than a typed transform
- semantic checks are split across expander, backend, and Binaryen
- the JS shim has its own parallel understanding of imports and results
- the editor has to scrape compiler strings because the compiler does not expose structured diagnostics

That architecture is still workable for a young language, but it is the main reason the small bugs above exist: the pipeline has too many partially-authoritative places where meaning is reconstructed instead of carried forward once.
