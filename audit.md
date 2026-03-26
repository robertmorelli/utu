# Compiler Audit

Date: 2026-03-26

Scope reviewed:
- `index.js`
- `expand.js`
- `watgen.js`
- `jsgen.js`
- `parser.js`
- compiler-facing tests and examples

Verification run:
- `bun ./scripts/test-modules.mjs`
- `bun ./scripts/test-examples.mjs --compile-all`

Both suites passed. The findings below are therefore mostly coverage gaps, semantic drift between compiler stages, or accepted syntax that should fail explicitly but currently lowers incorrectly or too permissively.

## Main Themes

1. `expand.js` and `watgen.js` both implement their own partial type/name/protocol reasoning. They have already drifted apart, and several user-visible failures come directly from that duplication.
2. The grammar surface is currently wider than the intended lowering surface. Where a form is not meant to exist in the language yet, the compiler should fail explicitly instead of silently dropping it or partially lowering it.
3. `watgen.js` allocates locals with a function-wide flat namespace. Any feature that depends on lexical scope is at risk.

## Findings

### 1. [High] Local shadowing should be a hard compile-time error, but the backend currently miscompiles it

Code:
- `watgen.js:250-277`
- `watgen.js:1229-1248`

Why it happens:
- `collectLocals()` and `addLocal()` use one function-wide `seen` set plus `this.localTypes`.
- Inner bindings are skipped if an outer binding or parameter already used the same name.
- The source layer in `expand.js` tracks scopes correctly, but the backend throws that information away.

Observed repro:

```utu
export fun main() i32 {
    let x: i32 = 1;
    {
        let x: i32 = 2;
        x;
    };
    x;
}
```

Expected:
- compilation failure
- the same error should surface in VS Code diagnostics, not just at CLI compile time

Observed:
- the program compiles
- runtime result is `2`

Impact:
- Inner `let` bindings overwrite outer bindings instead of being rejected.
- Shadowing a parameter mutates the parameter slot instead of creating a fresh local.
- Capture names in `for`, `alt`, `match`, and `promote` are vulnerable to the same bug.
- This needs both a compile-time assertion and editor-facing diagnostics.

### 2. [High] Captureless `for` loops are accepted, but lower to an undeclared temp local

Code:
- `watgen.js:254-259`
- `watgen.js:1722-1745`

Why it happens:
- `LOCAL_COLLECT_HANDLERS.for_expr` only allocates a loop local when a capture name exists.
- `genFor()` still invents `__i_<uid>` when the capture is omitted, but never declares it.

Observed repro:

```utu
export fun main() i32 {
    let sum: i32 = 0;
    for (0..3) {
        sum = sum + 1;
    };
    sum;
}
```

Observed failure:
- Binaryen parse error: `local $__i_0 does not exist`

Impact:
- The grammar and spec both say the capture is optional, but the implementation only works when a capture is present.

### 3. [High] Multi-capture `for` loops are being removed, but the compiler still accepts and miscompiles them

Code:
- `expand.js:1248-1258`
- `watgen.js:254-259`
- `watgen.js:1722-1745`
- `watgen.js:2285-2287`

Why it happens:
- The parser and expander still preserve every source and capture.
- `genFor()` only uses `sources[0]` and `captures[0]`.
- Later captures are still declared as locals, but never initialized.

Observed repro:

```utu
export fun main() i32 {
    let sum: i32 = 0;
    for (0..2, 10..12) |i, j| {
        sum = sum + j;
    };
    sum;
}
```

Expected:
- compilation failure because multi-capture `for` is being removed

Observed:
- the program compiles
- runtime result is `0`

Impact:
- This is silent wrong code for syntax that should no longer be accepted at all.
- The parser, compiler, and VS Code diagnostics should all move to an explicit failure mode here.

### 4. [High] Module-local tests/benches are silently dropped, but they should be hard failures

Code:
- `expand.js:331-347`
- `expand.js:350-385`
- `expand.js:465-490`

Why it happens:
- `collectNamespaceNames()` does not pass `onConstruct`, so module-local `construct` declarations are ignored.
- `collectSymbols()` ignores nested `module_decl`.
- `emitItem()` returns `''` for `module_decl`, `construct_decl`, and for `test_decl` / `bench_decl` when `inModule === true`.
- `export_decl` is already explicitly rejected inside modules; `test_decl` and `bench_decl` should follow the same policy instead of disappearing.

Observed repro:

```utu
mod M {
    test "inside" {
        assert true;
    }
}

export fun main() i32 {
    0;
}
```

Observed behavior:
- `get_metadata()` reports no tests.
- `compile(..., { mode: "test" })` emits no test exports.

Impact:
- Module-local tests and benches disappear without an error.
- Nested modules and module-local constructs are still being ignored by the same code paths instead of getting a clear unsupported-form failure.
- The intended contract should be: code inside `mod` exists to be used from outside the module, and tests / benches / exports inside a module should fail explicitly.
- This is source loss during expansion, which is one of the most dangerous failure modes in the current pipeline.

### 5. [High] Large `i64` / `u64` literals lose precision before code generation

Code:
- `watgen.js:1197-1226`
- `watgen.js:2304-2313`

Why it happens:
- `parseIntLit()` always returns a JavaScript `Number`.
- Large 64-bit integers are rounded before both constant folding and direct codegen see them.

Observed repro:

```utu
export fun main() i64 {
    9223372036854775807;
}
```

Observed WAT:

```wasm
(func $main (result i64)
  i64.const 9223372036854776000
)
```

Observed runtime result:
- `-9223372036854775616`

Impact:
- Any large `i64` / `u64` literal can compile to the wrong value.
- The same bug also affects constant-folded expressions and scalar match planning that depends on `parseIntLit()`.

### 6. [Medium] Method sugar only works for a narrow subset of receiver expressions

Code:
- `expand.js:906-912`
- `expand.js:1092-1105`

Why it happens:
- `resolveMethodCall()` depends on `inferExprInfo()`.
- `inferExprInfo()` only handles identifiers, parens, struct init, some calls, `else`, and `promote`.
- Common receivers like `field_expr`, `if_expr`, `index_expr`, `block_expr`, and `alt` are not modeled.

Observed repros:

```utu
o.inner.get();
(if true { s; } else { s; }).get();
```

Observed failure:
- `Unresolved method call '.get()': desugar p.method() in expand.js before watgen`

Impact:
- The surface syntax looks expression-generic, but method sugar is actually limited to a much smaller subset of receivers.
- This is a direct symptom of the expander and backend owning different pieces of type inference.

### 7. [High] Protocol lowering is not yet faithful to "protocols are syntax for table `call_indirect`"

Code:
- `expand.js:1069-1089`
- `expand.js:1206-1227`
- `watgen.js:500-640`
- `watgen.js:772-857`
- `watgen.js:1095-1155`
- `watgen.js:1474-1485`

Why it happens:
- The current implementation treats protocols as a richer semantic feature than "nicer syntax for a table dispatch."
- `watgen.js` synthesizes field-backed getter/setter protocol implementations.
- It also emits helper/thunk layers around the eventual dispatch path.
- Some protocol-adjacent spellings fall back to direct `struct.get` / `struct.set` behavior or to extra wrapper code before reaching the table dispatch.

Observed repros:

```utu
proto Area[T] { get area: i32, };
tag struct Rect { area: i32, }
rect.area();
```

```utu
proto ValueOps[T] { set value: i32, };
tag struct Counter { mut value: i32, }
ValueOps.value(counter, 9);
```

Observed failures:
- `rect.area()` stays unresolved even though `Area.area(rect)` works.
- Explicit setter calls report `Type "Counter" does not implement protocol "ValueOps" method "value"` even though the backend can synthesize the setter path for field assignment.

Impact:
- Protocol lowering is not yet "nothing more and nothing less" than table `call_indirect`.
- The current synthesis and helper emission add behavior and emitted code that go beyond that contract.
- This is both a semantic-design mismatch and a concrete source of expander/backend drift.

### 8. [Medium] Array-typed import values can reference undefined array type definitions

Code:
- `watgen.js:993-1035`
- `watgen.js:1171-1179`
- `watgen.js:1886-1902`

Why it happens:
- `collectArrayTypes()` walks structs, sum types, functions, tests, benches, import functions, and globals.
- It never walks `importVals`.
- `emitImportVal()` still calls `wasmType(imp.type)`, which lazily creates the array type name after the type section has already been emitted.

Observed repro:

```utu
shimport "es" xs: array[i32];

export fun main() i32 {
    0;
}
```

Observed failure:
- Binaryen parse error: `unknown type identifier`

Impact:
- Array-typed imported globals are currently broken even though the surface syntax parses.

### 9. [Medium] Function references should assert unimplemented immediately, but currently lower into broken WAT

Code:
- `watgen.js:1043-1055`
- `watgen.js:1886-1892`
- `watgen.js:1931-1932`

Why it happens:
- `wasmType()` lowers `func_type` to `(ref $func_<sig>)`.
- No corresponding `(type $func_<sig> (func ...))` definitions are ever emitted in the general type section.
- The only emitted function type definitions today are the protocol dispatch helper signatures.

Observed repro:

```utu
shimport "es" f: fun(i32) i32;

export fun main() i32 {
    0;
}
```

Observed failure:
- Binaryen parse error: `unknown type identifier`

Impact:
- Function references should not exist as a supported compiler surface yet.
- Type parsing can stay in place for future work, but any attempted use should fail with an explicit unimplemented assertion instead of reaching broken WAT.

### 10. [Medium-Low] Unsupported source forms should assert unimplemented instead of partially lowering

Code:
- `watgen.js:1186-1226`
- `watgen.js:1522-1546`

Observed repro:

```utu
export fun main() i32 {
    if true {
        1;
    };
}
```

Observed failure:
- Binaryen validator error: `if without else must not return a value`

Why it matters:
- Using Binaryen as the final wasm-faithfulness check is acceptable here.
- The problem is narrower: when the source form is not intended to exist as direct wasm-adjacent syntax, the compiler should assert unsupported or unimplemented earlier instead of letting a partial lowering continue.
- Value-position `if` without `else` is one example of a source form that currently survives too far into lowering.

Impact:
- The compiler contract becomes fuzzier than it should be for a language that is meant to be "nicer WAT," not a higher-level abstraction layer.

### 11. [Low] `index.js` globally monkeypatches `console.error` at module load

Code:
- `index.js:1-10`

Why it happens:
- Binaryen stderr capture is implemented by replacing `console.error` for the whole process.

Impact:
- This leaks compiler internals outside the compiler boundary.
- It is fragile in shared hosts like the extension, tests, or any embedding that expects `console.error` identity and behavior to stay stable.
- Even if it works today, it raises the blast radius of future concurrency or logging changes.

## Recommended Fix Order

1. Make shadowing an explicit compiler error and surface the same diagnostic in VS Code.
2. Fix the `for` lowering contract so unsupported forms fail explicitly: captureless loops must work, while multi-capture loops should reject cleanly.
3. Stop silently dropping module-local executable forms during expansion. Tests, benches, and any unsupported module-only forms should fail explicitly.
4. Rework protocol lowering around the intended contract: protocols should be exact syntax for table `call_indirect`, with no extra semantic layer.
5. Switch integer literal parsing for `i64` / `u64` paths to `BigInt` end-to-end.
6. Reduce drift between `expand.js` and `watgen.js`, ideally by centralizing protocol/type inference instead of duplicating partial versions.
7. Fill the missing type-definition prepasses for array import values.
8. Make every function-reference use fail immediately with an explicit unimplemented assertion until the feature is intentionally added.

## Coverage Notes

Current tests are strong on the happy path and on a few explicit failure cases, but they do not cover:
- local shadowing behavior
- shadowing diagnostics in the editor / language service
- captureless `for`
- multi-source `for` wrong-code behavior
- explicit rejection of module-local tests/benches/exports
- large `i64` / `u64` literals
- array-typed import values
- explicit unimplemented failures for `fun(...) ...` uses
- method sugar over non-trivial receiver expressions
- protocol lowering faithfulness to exact table `call_indirect`
