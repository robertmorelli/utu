# In-Source Testing And Benchmarking Plan

This document describes the exact implementation path for adding:

- top-level `test "name" { ... }`
- top-level `bench "name" |i| { setup { measure { ... } } }`
- an `assert` keyword

The goal is to make these features work with the existing web-tech compiler stack:

- parse `.utu`
- lower to WAT
- emit wasm
- instantiate a temporary JS wrapper
- run tests or benchmarks
- delete the temporary wrapper after execution

This plan assumes the current compiler architecture stays intact. Do not wait for a real typechecker before doing this work.

## Recommended MVP Semantics

### `assert`

Source syntax:

```utu
assert x == 42
assert value != null
```

Required behavior:

- `assert` is a keyword accepted inside function bodies, test bodies, benchmark setup bodies, and benchmark measure bodies.
- It is lowered as:

```utu
if not condition {
    unreachable
}
```

- It does not produce a value.
- An assertion failure traps in wasm via `unreachable`.

MVP constraints:

- No custom assertion message.
- No special reporting inside wasm.
- The CLI reports a trap as a failed test or benchmark run.

Important caveat:

- The current compiler does not have a full semantic checker.
- `assert` should be treated as statement-like, even if the grammar admits it as an expression node.
- Misuse in value position can be left as a compile-time error later if Binaryen rejects the generated WAT.

### `test`

Source syntax:

```utu
test "adds two numbers" {
    assert add(2, 2) == 4
}
```

Required behavior:

- `test` is a new top-level item.
- A test has:
  - a string name
  - a zero-arg block body
- Tests are ignored by normal `utu compile` and `utu run`.
- Tests are materialized only when compiling in test mode.
- Each test becomes a synthesized zero-arg wasm function with a stable export name.
- If the function traps, the test fails.
- If the function returns normally, the test passes.

### `bench`

Source syntax:

```utu
bench "normalize points" |i| {
    setup {
        let points: array[Point] = make_points()

        measure {
            normalize(points[i])
        }
    }
}
```

Required behavior:

- `bench` is a new top-level item.
- A benchmark has:
  - a string name
  - one capture identifier between pipes, for the loop index
  - a body containing exactly one `setup` block
  - that `setup` block must contain exactly one `measure` block
- In the MVP, `setup` runs once per benchmark sample.
- In the MVP, `measure` runs inside a wasm loop for `N` iterations.
- The host times the benchmark export call. Do not import a clock into wasm.

MVP constraints:

- Iteration count comes from the CLI, not from source syntax.
- Use `i32` for benchmark iterations in the synthesized wrapper, because the current loop lowering already assumes `i32` counters.
- `measure` should be the final child inside `setup`.
- Statements before `measure` are setup code.
- Statements after `measure` are rejected.
- Locals declared before `measure` remain in scope for `measure`.

This gives a simple and useful meaning:

- setup cost happens once per sample
- measured work happens `N` times
- the benchmark body can reuse setup locals

## What Already Exists

The repo already has most of the machinery needed.

### Parser And Compiler

- `grammar.js` defines the tree-sitter grammar.
- `compiler/index.js` parses source, throws parse errors, lowers to WAT, runs Binaryen, and emits wasm.
- `compiler/watgen.js` contains nearly all AST collection and lowering logic.
- `compiler/jsgen.js` builds the JS wrapper and `instantiate()` helper.

### Temporary Module Execution

Two working examples already prove the "compile -> run -> delete temp artifact" model:

- `scripts/test-examples.mjs`
- `cli_artifact/src/lib/module-loader.ts`

This means tests and benchmarks do not need persistent wasm files.

### Existing CI / Smoke Coverage

- `bun run test` already runs smoke fixtures.
- `examples/manifest.json` already drives an ephemeral compile-and-run harness.

## Implementation Work

## 1. Extend The Grammar

Files:

- `grammar.js`
- generated artifacts:
  - `src/grammar.json`
  - `src/node-types.json`
  - `src/parser.c`
  - `tree-sitter-utu.wasm`
  - copied parser wasm in `cli_artifact/`, `vscode/`, and `web_artifact/`

Add new top-level rules:

```ebnf
item         ::= import_decl | export_decl | fn_decl | type_decl
               | struct_decl | global_decl | test_decl | bench_decl

test_decl    ::= 'test' STRING block

bench_decl   ::= 'bench' STRING '|' IDENT '|' '{' setup_decl '}'
setup_decl   ::= 'setup' block_with_measure
measure_decl ::= 'measure' block
```

Add new expression rule:

```ebnf
expr         ::= ... | assert_expr
assert_expr  ::= 'assert' expr
```

Recommended shape in `grammar.js`:

- add `$.test_decl` and `$.bench_decl` to `_item`
- add `$.assert_expr` to `_expr`
- add dedicated nodes for:
  - `bench_capture`
  - `setup_decl`
  - `measure_decl`

Do not model `setup` and `measure` as ordinary identifiers. Make them keywords.

After editing the grammar:

1. run `bun run grammar`
2. run `bun run distribute` or `bun run build`

That must refresh the checked-in parser artifacts and copied wasm parser binaries.

## 2. Parse New AST Nodes In `compiler/watgen.js`

`compiler/watgen.js` is the central place to extend.

Add new collections on `WatGen`:

- `this.testDecls = []`
- `this.benchDecls = []`

Add new parse helpers near the existing `parseFnDecl` / `parseImportDecl` helpers:

- `parseTestDecl(node)`
- `parseBenchDecl(node)`
- `parseSetupDecl(node)`
- `parseMeasureDecl(node)`

Suggested metadata shapes:

```js
{ kind: "test_decl", name, body }

{
  kind: "bench_decl",
  name,
  capture,
  setupPrelude,
  measureBody,
}
```

`parseBenchDecl` should validate structure aggressively:

- exactly one `setup_decl`
- exactly one `measure_decl`
- `measure_decl` is last inside `setup`

If the structure is wrong, throw `WatError` with a helpful message.

## 3. Add Compiler Modes

Default compiler behavior must not change for normal programs.

Add a mode option to the shared compiler API:

```ts
mode?: "program" | "test" | "bench"
```

Files:

- `compiler/index.js`
- `cli_artifact/src/lib/compiler.ts`

Behavior by mode:

- `program`
  - current behavior
  - ignore `test_decl` and `bench_decl`
- `test`
  - compile ordinary declarations plus synthesized test exports
- `bench`
  - compile ordinary declarations plus synthesized benchmark exports

Do not force tests or benches into ordinary output. `utu run` should still behave like it does now.

## 4. Return Metadata From The Compiler

The CLI needs human-readable names for tests and benchmarks.

Change the WAT generator API so it returns both WAT and metadata.

Recommended change:

```js
const { wat, metadata } = watgen(tree, options)
```

Recommended metadata shape:

```js
{
  tests: [{ name: "adds two numbers", exportName: "__utu_test_0" }],
  benches: [{ name: "normalize points", exportName: "__utu_bench_0" }],
}
```

Then thread metadata through:

- `compiler/index.js`
- `cli_artifact/src/lib/compiler.ts`

`compiler/jsgen.js` does not need major changes as long as synthesized tests and benches are exported from wasm like ordinary functions.

## 5. Lower `assert`

Files:

- `compiler/watgen.js`

Add handling in `genExpr`.

Recommended lowering:

1. emit the condition as `i32`
2. emit a no-result wasm `if`
3. inside `then` or `else`, trap on failure

Equivalent source lowering:

```utu
assert cond
```

becomes

```utu
if not cond {
    unreachable
}
```

This should be implemented directly in `watgen`, not by doing a source rewrite.

Also update any scanning or local-collection code only if needed. `assert` should not declare locals and should not change result typing rules.

## 6. Lower `test` Declarations

Files:

- `compiler/watgen.js`

In `WatGen.collect()`:

- store tests in `this.testDecls`

In emit logic:

- when mode is `test`, synthesize one wasm function per test
- export each function under a stable internal name such as `__utu_test_0`

Suggested synthesized function shape:

```wasm
(func $__utu_test_0
  ;; body lowered from the test block
)
(export "__utu_test_0" (func $__utu_test_0))
```

Important details:

- test bodies can reuse existing functions, globals, types, and imports from the same source file
- test bodies should behave like zero-return functions
- any trap means failure

No special test runtime is needed inside wasm.

## 7. Lower `bench` Declarations

Files:

- `compiler/watgen.js`

In `WatGen.collect()`:

- store benches in `this.benchDecls`

In emit logic for bench mode:

- synthesize one benchmark wrapper function per bench
- export each wrapper as `__utu_bench_<n>`

Recommended synthesized wrapper shape:

```utu
fn __utu_bench_0(iterations: i32) {
    ;; setup prelude statements
    for (0..iterations) |i| {
        ;; measure body
    }
}
```

Important details:

- the user-supplied capture name from `|i|` becomes the loop variable in the synthesized wrapper
- statements before `measure` are emitted once before the loop
- statements inside `measure` are emitted inside the loop
- locals declared in setup stay visible inside measure because the whole benchmark lowers into one synthesized function

Do not try to exclude setup from timing inside wasm. The host runner times the wrapper call and setup happens once per sample.

## 8. Add CLI Commands

Files:

- `cli_artifact/src/cli.ts`
- `cli_artifact/src/commands/test.ts`
- `cli_artifact/src/commands/bench.ts`
- `cli_artifact/src/lib/help.ts`

Re-use existing infrastructure:

- `compileUtuSource(...)`
- `importEphemeralModule(...)`
- `loadRuntimeImports(...)`

### `utu test`

Expected command:

```bash
utu test <input> [--imports <file>]
```

Runner behavior:

1. compile in `mode: "test"`
2. import the generated JS wrapper ephemerally
3. instantiate wasm
4. read compiler metadata for tests
5. invoke each exported test function
6. report pass/fail per test
7. exit non-zero on any failure

Output should look similar to the existing example test harness:

- `PASS <name>`
- `FAIL <name>`

### `utu bench`

Expected command:

```bash
utu bench <input> [--imports <file>] [--iterations <n>] [--samples <n>] [--warmup <n>]
```

Runner behavior:

1. compile in `mode: "bench"`
2. import the generated JS wrapper ephemerally
3. instantiate wasm
4. read compiler metadata for benches
5. run warmups
6. time each benchmark wrapper with host timing
7. report mean/min/max and ns-per-iteration

Use host timing:

- prefer `process.hrtime.bigint()` in Bun/Node

Do not add a wasm clock import for the MVP.

## 9. Update CLI Help And Scripts

Files:

- `cli_artifact/src/lib/help.ts`
- `package.json`
- optionally `README.md`

Needed changes:

- add `test` and `bench` to main help
- add command help text for both
- optionally add package scripts such as:
  - `test:language`
  - `bench:examples`

Do not remove the existing manifest-based smoke harness yet. It is still useful while these features land.

## 10. Update Editor Support

Files:

- `vscode/syntaxes/utu.tmLanguage.json`
- `vscode/src/documentSymbols.ts`

Needed changes:

- add `assert`, `test`, `bench`, `setup`, and `measure` to keyword highlighting
- optionally show `test` and `bench` blocks in document symbols

The VS Code parser diagnostics are syntax-only already, so they should pick up the new grammar automatically once the parser wasm is updated.

## 11. Update Docs

Files:

- `spec.md`
- `documentation/03-control-flow-functions-and-interop.typ`
- `documentation/05-grammar-and-compilation.typ`
- `README.md`

Needed changes:

- document `assert`
- document top-level `test`
- document top-level `bench`
- document the benchmark timing model:
  - setup once per sample
  - measure loop timed by host

## 12. Add Coverage

Add source fixtures that exercise the new language features.

Recommended new examples:

- `examples/ci/assert_pass.utu`
- `examples/ci/tests_basic.utu`
- `examples/bench/bench_basic.utu`

Minimum coverage needed:

- `assert true` passes
- `assert false` traps
- two passing tests in one file both execute
- one failing test causes non-zero CLI exit
- benchmark wrapper runs and prints timing data
- benchmark setup locals are visible inside measure

Keep benchmark execution out of the default smoke path unless the sample count is very small.

## Recommended Order Of Work

1. Add grammar rules and regenerate parser artifacts.
2. Add `assert` lowering.
3. Add test/bench parsing and metadata collection in `watgen`.
4. Add compiler mode support and metadata return values.
5. Add `utu test`.
6. Add `utu bench`.
7. Update editor support.
8. Update docs and examples.
9. Add smoke coverage.

## Acceptance Checklist

The work is done when all of the following are true:

- a `.utu` file with `assert` parses and compiles
- `assert false` traps in wasm
- a `.utu` file with top-level `test` declarations can be run with `utu test`
- test names are reported using their source strings
- test wasm/JS wrappers are imported ephemerally and deleted after execution
- a `.utu` file with top-level `bench` declarations can be run with `utu bench`
- benchmark results are timed by the host and reported per named benchmark
- `setup` locals are visible in `measure`
- ordinary `utu run` and `utu compile` still work on existing examples
- keyword highlighting is updated
- docs mention the new syntax and timing model

## Known Caveats

- The compiler still does not have a real typechecker. This feature should ship anyway.
- `assert` is best treated as statement-like for now.
- Benchmark setup runs once per sample, not once per iteration.
- There is no custom assertion message in the MVP.
- Traps are the failure mechanism for both assertions and tests.
