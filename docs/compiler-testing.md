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
  invalid emission options, and Binaryen cleanup on construction, validation,
  optimization, binary-emission, and text-emission failures. Failure injection
  restores the original Binaryen constructor even if an assertion fails.
- `parser-lifecycle-tests.mjs`: owned versus borrowed CST lifetime, cleanup on
  conversion failure, diamond imports, and cycles without duplicate reads.
- `range-index-tests.mjs`: half-open interval semantics, empty/invalid ranges,
  duplicate-key stress, file/kind filtering, insertion-order independence, and
  seeded comparisons against an independent brute-force oracle.

Runtime execution tests complement structural checks: a well-shaped IR can
still miscompile, and successful execution alone does not prove that a closure
kept its required JavaScript representation. Test both when the ABI matters.

These checks establish concrete behavior; they do not claim universal engine
support or globally minimal output. Preserve conservative optimizer exclusions
unless a regression demonstrates that removing them is sound.
