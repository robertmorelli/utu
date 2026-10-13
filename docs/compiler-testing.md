# Compiler verification

From the repository root, after installing development dependencies:

```sh
node scripts/run-tests.mjs --both-debug-modes
# Or exercise the same source and tests under JavaScriptCore:
bun scripts/run-tests.mjs --both-debug-modes
node scripts/build.mjs
node scripts/bundle-smoke-test.mjs
node scripts/test-vscode-extension.mjs
```

The test runner launches child processes using the current executable. Node does
not require Bun for the compiler suite; Bun remains necessary for tools that
explicitly build standalone Bun executables. Both debug modes are required:
structural assertions must catch compiler bugs without becoming necessary for
correct compilation. A failing or signalled child produces a failing exit code.

Tests register through a common suite context. Use `compileAndInstantiate` for
behavioral checks and `withTempUtu` for compiler-only checks. Assert observable
results, diagnostics, ABI boundaries, and resource ownership. Avoid golden
snapshots of incidental generated identifiers or exact optimizer-dependent byte
counts. Compare equivalent programs within the same run for size regressions.

## Focused compiler regressions

- `compiler-quality-tests.mjs`: closure hygiene and ABI, dead-code size equality,
  and invalid modules reported with the engine's reason.
- `parser-lifecycle-tests.mjs`: owned versus borrowed CST lifetime, cleanup on
  conversion failure, diamond imports, and cycles without duplicate reads.
- `range-index-tests.mjs`: half-open interval semantics, empty/invalid ranges,
  duplicate-key stress, file/kind filtering, insertion-order independence, and
  seeded comparisons against an independent brute-force oracle.
- `wutu-tests.mjs`: the Wutu parser (else-if, comments, located syntax errors,
  seeded mutation fuzzing), formatter round trips, static and reactive
  rendering against linkedom, template diagnostics, island-name warnings, and
  `@stored` diagnostics.
- `wutu-runtime-tests.mjs`: the reconciler driven directly as compiled templates
  call it: element reuse, keyed and global-key moves, listener replacement,
  islands and cleanup, timers, styles, and storage conflict handling.
- `import-diagnostic-tests.mjs`: missing files and modules, syntax errors in
  imported files, and recovered syntax in `export lib`.
- `language-regression-tests.mjs`: nested generic-module calls, closure arrays,
  negative and invalid `match` patterns, operator and unknown-type diagnostics,
  and one report per syntax-error offset.

`npm test` also runs two browser-free scripts: `test-wutu-stencils.mjs` (CSS
projection and formatter idempotence over the example sites) and
`test-wutu-cli.mjs` (format, build diagnostics, and the dev server's serving,
live-reload events, path guard, and cleanup). The Playwright suites
(`test:wutu*`) remain separate because they need installed browsers.

Runtime execution tests complement structural checks: a well-shaped IR can
still miscompile, and successful execution alone does not prove that a closure
kept its required JavaScript representation. Test both when the ABI matters.

These checks establish concrete behavior; they do not claim universal engine
support or globally minimal output. Preserve conservative optimizer exclusions
unless a regression demonstrates that removing them is sound.

## TypeScript ABI experiment

`bun run test:bindings` runs declaration/runtime coverage, the in-memory browser
Worker linker check, and the browser demo. Run `bun scripts/dts-abi-tests.mjs` as
well to exercise JavaScriptCore. See [the ABI guide](typescript-abi.md) for test
dependencies and scope. Compiler regressions also cover module host bindings
beside intrinsic methods, and value-returning expressions in void functions.

The TypeScript ABI workflow runs the declaration suites on Node and Bun on Linux
and macOS, checks regeneration against the committed corpus, then exercises the
Worker and demo in Chromium. It saves size measurements and screenshots as CI
artifacts. Local checks do not substitute for a successful remote workflow run.
