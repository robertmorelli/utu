# To Minimize

Status: implemented in the working tree on 2026-03-21. The notes below are the original rationale/checklist that drove the refactor.

Short answer: yes, the CLI and VS Code extension should share more code, but mostly at the runtime-adapter layer, not at the UI layer.

The best opportunities are the places where both surfaces independently do some version of:

`source -> compile -> load generated JS module -> instantiate with host imports -> resolve exports -> run main/tests/benchmarks`

That flow exists in both the CLI and the VS Code web host today.

## Highest-Leverage Targets

1. Share a common compiled-runtime harness between the CLI and the VS Code extension.

Current duplication: `cli_artifact/src/cli.mjs:74-190` and `vscode/src/compilerHost.web.js:22-190`.

Why this is high value: both sides independently compile source, load generated JS, instantiate exports, resolve a named export, and turn test/benchmark metadata into invocations. The mechanics are the same even though the surrounding UX is different.

Safe extraction: a shared module that exposes something like `loadCompiledRuntime(...)`, `invokeExport(...)`, `runTests(...)`, and `runBenchmarks(...)`, with pluggable module-loading and host-import callbacks. The CLI can keep its temp-file import path and custom `--imports` merge behavior. VS Code can keep its data/blob URL import behavior and output-channel UX.

Important boundary: do not force the CLI and VS Code to share benchmark policy. The CLI's adaptive `--seconds` loop in `cli_artifact/src/cli.mjs:101-140` is a different product choice from the VS Code fixed-iterations flow in `vscode/src/compilerHost.web.js:147-175`.

2. Make host imports a single source of truth.

Current duplication: `cli_artifact/src/cli.mjs:285-307`, `cli_artifact/src/cli.mjs:321-357`, `vscode/src/webHostImports.js:1-27`, and `vscode/src/runMainSupport.js:1-36`.

Why this is high value: the same `es` host API names are hard-coded in four places. That means adding or changing a built-in host function requires synchronized edits across the CLI runtime, the generated Bun runner, the VS Code web host, and the Run Main support check.

Safe extraction: a shared `hostImports` module that exports:

`SUPPORTED_ES_HOST_IMPORTS`

`createEsHostImports({ writeLine, prompt })`

`mergeHostImports(base, override)` if the CLI still wants external import overrides

The VS Code blocker logic in `vscode/src/runMainSupport.js:9-36` should read the same exported capability list that `vscode/src/webHostImports.js:1-27` actually implements.

3. Remove the duplicated compile-result normalization wrapper.

Current duplication: `cli_artifact/src/lib/compiler.mjs:8-19` and `vscode/src/compilerHost.web.js:50-63` plus `vscode/src/compilerHost.web.js:176-194`.

Why this is worth doing: both adapters are taking raw `compiler.compile(...)` output and normalizing the same two things:

`wasm` into a `Uint8Array`

`metadata` into `{ tests: [], benches: [] }` defaults

Safe extraction: a tiny shared helper such as `normalizeCompileArtifact(result)` near `compiler/index.js:37-61`. That keeps the CLI and VS Code adapters thinner and guarantees consistent output shaping.

4. Deduplicate the tree-sitter WASM bootstrap logic.

Current duplication: `compiler/index.js:13-35` and `lsp/src/core/parser.js:36-58`, plus byte-normalization helpers in `compiler/index.js:53-61`, `lsp/src/core/parser.js:128-143`, and `cli_artifact/src/lib/compiler.mjs:15-19`.

Why this is worth doing: both the compiler and parser service independently build the same `Parser.init(...)` options with the same `instantiateWasm(...)` and `locateFile(...)` branching. The byte normalization helpers are also spread across multiple files.

Safe extraction: a shared internal helper for:

`toUint8ArrayWasm(value)`

`createTreeSitterInitOptions(runtimeWasm)`

`normalizeWasmSource(source)` if file URLs still need special handling in the LSP layer

This is a good cleanup because it reduces low-level runtime glue without changing any user-facing behavior.

## Good Extension-Only Cleanup

5. Consolidate benchmark config parsing and duration formatting inside the VS Code extension.

Current duplication: `vscode/src/commands.js:87-89`, `vscode/src/commands.js:165-177`, `vscode/src/testing.js:117-128`, and `vscode/src/testing.js:202-230`.

Why this is worth doing: `getBenchmarkSettings()` and `getBenchmarkOptions()` are the same function in two files, and the time-formatting helpers are nearly the same. This is classic small, safe dedupe.

Safe extraction: a single `vscode/src/benchmarking.js` helper with:

`getBenchmarkOptionsFromConfig()`

`formatDurationMs(value, { includeNs })`

6. Centralize runnable-symbol discovery instead of re-deriving it in four different extension features.

Current duplication:

`vscode/src/activate.js:91-118`

`vscode/src/commands.js:145-147`

`vscode/src/codeLens.js:7-24`

`vscode/src/testing.js:22-52` and `vscode/src/testing.js:188-190`

Why this is worth doing: the extension repeatedly scans `index.topLevelSymbols` for the same information:

whether `export fn main()` exists

which symbols are tests or benchmarks

what their ordinal is within the document

Safe extraction: expose `getRunnableEntries(index)` or enrich the language-service index with precomputed runnable metadata. That would let Run Main enablement, CodeLens, and Testing all consume one representation instead of keeping their own logic in sync.

7. Remove the unused parser-level diagnostics entrypoint.

Current code: `lsp/src/core/parser.js:9-11`.

Why this is worth doing: repo-wide usage points to `UtuLanguageService.getDiagnostics(...)`, not `UtuParserService.getDiagnostics(...)`. If that grep result stays true, this is dead surface area.

Safe extraction: delete it, or have callers go through one path only. It is small, but it is exactly the kind of low-risk minimization that keeps shared infrastructure from sprawling.

8. Unify the little path-label helpers in the extension.

Current duplication: `vscode/src/commands.js:114-116`, `vscode/src/testing.js:199-200`, and related basename logic in `vscode/src/generatedDocuments.js:18-20`.

Why this is lower value: this is tiny, but it is repeated string/path handling in multiple places.

Safe extraction: one small `displayNameForUri(...)` helper if these files keep growing.

## CLI-Only Cleanup Worth Doing

9. The Bun executable runner duplicates real runtime code as a string literal.

Current duplication: `cli_artifact/src/cli.mjs:313-357` repeats the same prompt, logging, and `main` invocation behavior that already exists in `cli_artifact/src/cli.mjs:74-79` and `cli_artifact/src/cli.mjs:267-297`.

Why this is worth doing: stringified runtime code is brittle. Every host-import or prompt change must be copied into the generated runner template.

Safe extraction: have `buildBunExecutable(...)` write a tiny runner that imports shared runtime helpers from the CLI package instead of embedding the full implementation inline.

10. The CLI command parsers are still more manual than they need to be.

Current duplication: `cli_artifact/src/cli.mjs:35-47`, `cli_artifact/src/cli.mjs:101-113`, and `cli_artifact/src/cli.mjs:143-153`.

Why this is only medium/low value: there is repetition, but the command set is small and explicit. I would only factor this if the CLI is about to gain more flags or subcommands.

Safe extraction: a tiny declarative argument helper for positional input plus typed flag readers. I would not over-engineer this yet.

## Things I Would Not Prioritize Yet

- I would not try to heavily abstract `lsp/src/core/languageService.js:290-1168` just to reduce line count. It is large, but a lot of that size is grammar-specific explicit logic. Some of it can be split for readability, but it is not the cleanest first minimization target.

- I would not try to merge the CLI and VS Code benchmark UX into one behavior. They should share the invocation substrate, not necessarily the product-level benchmark strategy.

## Recommended Order

1. Shared host imports and supported-import metadata.

2. Shared compiled-runtime harness for load/instantiate/invoke/test/bench execution.

3. Shared compile-result normalization helper.

4. VS Code local dedupe for benchmark config and runnable-symbol discovery.

5. Shared tree-sitter bootstrap helpers.

6. Small cleanup passes like the unused parser method and basename helpers.
