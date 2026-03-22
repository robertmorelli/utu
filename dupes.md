# Duplicate Logic Audit

Goal: identify source-level dedupe opportunities that can reclaim meaningful LOC without touching generated artifacts like `src/parser.c`.

Estimated reclaim potential: roughly 180-300 lines if the top clusters are consolidated into shared helpers/modules.

## Highest-value targets

### 1. Shared script test harness helpers
Files:
- `scripts/test-all-examples-compile.mjs`
- `scripts/test-editor-example-parity.mjs`
- `scripts/test-editor-core.mjs`
- `scripts/test-stress-runtime.mjs`
- `scripts/test-examples.mjs`

Repeated logic:
- `collectUtuFiles(dir)` exists in:
  - `scripts/test-all-examples-compile.mjs`
  - `scripts/test-editor-example-parity.mjs`
- `firstLine(...)` exists in:
  - `scripts/test-all-examples-compile.mjs`
  - `scripts/test-editor-example-parity.mjs`
  - `scripts/test-examples.mjs`
- `createDocument(uri, text)` exists in:
  - `scripts/test-editor-example-parity.mjs`
  - `scripts/test-editor-core.mjs`
- `expectEqual(...)` and `expectDeepEqual(...)` exist in:
  - `scripts/test-editor-core.mjs`
  - `scripts/test-stress-runtime.mjs`

Why this is a good dedupe:
- These are nearly copy-paste identical utilities.
- They are test-only helpers, so extracting them is low risk.
- One `scripts/test-helpers.mjs` module could absorb almost all of this.

Likely reclaim:
- 45-80 lines

Suggested extraction:
- `collectUtuFiles`
- `firstLine`
- `createTestDocument`
- `expectEqual`
- `expectDeepEqual`

### 2. Repeated script bootstrap and repo-root setup
Files:
- `scripts/test-all-examples-compile.mjs`
- `scripts/test-docs-codegen.mjs`
- `scripts/test-editor-core.mjs`
- `scripts/test-editor-example-parity.mjs`
- `scripts/test-editor-webhost.mjs`
- `scripts/test-examples.mjs`
- `scripts/test-stress-runtime.mjs`
- `scripts/build.mjs`

Repeated logic:
- `const scriptDir = dirname(fileURLToPath(import.meta.url));`
- `const repoRoot = resolve(scriptDir, '..');`

Related duplication:
- wasm/runtime asset setup is also repeated in several scripts.

Why this is a good dedupe:
- This boilerplate appears across most scripts.
- A tiny `scripts/repo-paths.mjs` or `scripts/script-runtime.mjs` helper would remove repeated startup code and make future scripts shorter.

Likely reclaim:
- 20-35 lines

Suggested extraction:
- `getRepoRoot(import.meta.url)`
- `getScriptDir(import.meta.url)`
- optional shared compiler asset loader

### 3. Rust benchmark toolchain/build helpers duplicated across two benchmark scripts
Files:
- `scripts/prepare-deltablue-bench-cache.mjs`
- `scripts/compare-deltablue-rust.mjs`

Repeated logic:
- `resolveRustcPath()`
- cargo invocation setup with `RUSTC`, `CARGO_TERM_COLOR`, `cwd`, `stdout`, `stderr`
- wasm optimization flow
- UTU compiler asset setup

Why this is a good dedupe:
- This is the cleanest “real” business-logic duplication in the repo.
- The functions are non-trivial and likely to drift independently.
- A single benchmark utility module would reduce LOC and keep Rust/wasm benchmarking behavior consistent.

Likely reclaim:
- 35-60 lines

Suggested extraction:
- `resolveRustToolchain()`
- `spawnCargoBuild(...)`
- `optimizeWasm(...)`
- `getCompilerAssetOptions()`

### 4. `.utu` workspace file discovery exists in four different shapes
Files:
- `extension/workspaceSymbols.js`
- `extension/testing.js`
- `lsp_server/index.js`
- `scripts/test-all-examples-compile.mjs`
- `scripts/test-editor-example-parity.mjs`

Repeated logic:
- locate every `*.utu` file
- skip `node_modules` or similar directories
- open/read each file after discovery

Specific duplication:
- `extension/workspaceSymbols.js` uses `vscode.workspace.findFiles('**/*.utu', '**/node_modules/**')`
- `extension/testing.js` uses the same glob/exclude pair inline
- `lsp_server/index.js` reimplements recursive directory walking for `.utu` files
- two scripts recursively walk directories with bespoke `collectUtuFiles`

Why this is a good dedupe:
- This is a cross-cutting concern that already exists in extension, LSP, and scripts.
- Even if the VS Code and Node versions stay separate, each side can still have a single source of truth.

Likely reclaim:
- 30-55 lines

Suggested extraction:
- `extension/workspaceFiles.js` for VS Code-side globbing constants and helpers
- `scripts/find-utu-files.mjs` or `lsp_core/fs.js` for Node-side recursive walking

### 5. Debounced refresh/watcher logic is duplicated in extension controllers
Files:
- `extension/testing.js`
- `extension/diagnostics.js`
- `extension/activate.js`

Repeated logic:
- file/document watcher setup
- debounce map keyed by URI
- refresh/validate only after a short delay

Specific duplication:
- `extension/testing.js` has `pending` + `scheduleRefresh(uri)` with `setTimeout(..., 150)`
- `extension/diagnostics.js` has `pending` + `schedule(document)` with `setTimeout(..., 150)`
- `extension/activate.js` separately wires a watcher for `**/*.utu`

Why this is a good dedupe:
- Not just LOC savings: shared debouncing/watch registration would reduce subtle behavior drift.
- The current duplication is small per file, but the pattern is already spreading.

Likely reclaim:
- 20-35 lines

Suggested extraction:
- `createDebouncedUriScheduler(delay, callback)`
- shared `UTU_GLOB` and `UTU_EXCLUDE`
- optional `registerUtuDocumentWatchers(...)`

### 6. Output/error reporting is hand-rolled in multiple extension modules
Files:
- `extension/commands.js`
- `extension/diagnostics.js`
- `extension/testing.js`
- `extension/workspaceSymbols.js`

Repeated logic:
- append `[utu] ...` or `[workspace symbols] ...` lines to an output channel
- stringify/format errors
- show the output channel on failure

Why this is a good dedupe:
- A tiny logger helper would centralize message formatting and make failures more uniform.
- This is medium value because LOC savings are modest, but it would simplify maintenance.

Likely reclaim:
- 15-30 lines

Suggested extraction:
- `logUtuError(output, label, error, options?)`
- `appendOutputBlock(output, title, lines, result?)`

### 7. `scripts/editor-test-assets.mjs` contains duplicate candidate lists in the same file
File:
- `scripts/editor-test-assets.mjs`

Repeated logic:
- `grammarCandidates` and `cliGrammarCandidates` are effectively the same
- several candidate arrays duplicate the same string literals, including repeated `tree-sitter-utu.wasm`

Why this is a good dedupe:
- Small but very easy win.
- This file can probably collapse to a couple of base arrays plus lightweight overrides.

Likely reclaim:
- 8-15 lines

Suggested extraction:
- `BASE_GRAMMAR_CANDIDATES`
- `BASE_RUNTIME_CANDIDATES`
- per-mode overrides only when truly different

## Lower-priority or conditional targets

### 8. Repeated command wiring patterns in `extension/commands.js`
File:
- `extension/commands.js`

Repeated logic:
- several commands follow the same shape:
  - get current document
  - run host action
  - show output
  - update status bar

Why it is lower priority:
- Much of this is already partially deduped through `command(...)`, `generated(...)`, and `show(...)`.
- More abstraction is possible, but the payoff is smaller than the test/benchmark helpers above.

Likely reclaim:
- 10-20 lines

### 9. Bench/test case runner patterns across benchmark scripts
Files:
- `scripts/compare-deltablue-rust.mjs`
- `scripts/generate-utu-v-rust-report.mjs`
- `scripts/run-deltablue-bench-case.mjs`

Repeated logic:
- loading cached artifacts
- formatting benchmark outputs
- path layout assumptions for UTU/Rust cache dirs

Why it is lower priority:
- Some similarity is conceptual rather than copy-paste exact.
- Worth revisiting after the stricter duplicates above are cleaned up.

Likely reclaim:
- 15-25 lines

## What I would dedupe first

1. Create `scripts/test-helpers.mjs` and move shared test helpers there.
2. Create `scripts/bench-utils.mjs` for Rust toolchain/build/wasm-opt helpers.
3. Create shared `.utu` file discovery helpers for scripts/LSP/extension sides.
4. Extract one tiny extension logging helper and one tiny debounce helper.
5. Collapse `scripts/editor-test-assets.mjs` candidate arrays.

## Probably not worth targeting

- `src/parser.c`
  - generated parser output, huge line count but not a dedupe target
- tiny one-off helpers that only save 2-3 lines unless they also reduce drift risk
- JSON/data files unless they are actively hand-maintained and clearly duplicative
