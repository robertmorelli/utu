const cases = [
    ['assert-pass', ['run', 'examples/ci/assert_pass.utu'], 0, 'ok'],
    ['assert-fail', ['run', 'examples/ci/assert_fail.utu'], 1, 'Unreachable code'],
    ['tests-basic', ['test', 'examples/ci/tests_basic.utu'], 0, 'PASS adds two numbers'],
    ['tests-codegen-surface', ['test', 'examples/ci/codegen_test_surface.utu'], 0, 'PASS top-level tests become synthesized exports'],
    ['tests-nullable', ['test', 'examples/ci/codegen_nullable.utu'], 0, 'PASS else fallback runs on null'],
    ['tests-nullable-imports', ['test', 'examples/ci/nullable_imports.utu', '--imports', 'examples/ci/nullable_imports.mjs'], 0, 'PASS thrown nullable imports fall back to defaults'],
    ['tests-node-builtins', ['test', 'examples/ci/node_builtin_imports.utu'], 0, 'PASS node builtin imports auto resolve'],
    ['tests-import-values', ['test', 'examples/ci/codegen_import_values.utu', '--imports', 'examples/ci/import_values_host.mjs'], 0, 'PASS imported externref globals can stay non-null'],
    ['tests-globals', ['test', 'examples/ci/codegen_globals.utu'], 0, 'PASS top-level numeric globals lower to global.get'],
    ['tests-scalar-match', ['test', 'examples/ci/codegen_scalar_match.utu'], 0, 'PASS float match can take a specific arm'],
    ['tests-alt-fallback', ['test', 'examples/ci/codegen_alt_fallback.utu'], 0, 'PASS alt fallback can bind and forward the unmatched value'],
    ['tests-fail', ['test', 'examples/ci/tests_fail.utu'], 1, 'FAIL fails'],
    ['compile-bad-return-type', ['compile', 'scripts/fixtures/compile_bad_return_type.utu'], 1, 'Binaryen validation failed'],
    ['compile-bad-call-args', ['compile', 'scripts/fixtures/compile_bad_call_args.utu'], 1, 'call param types must match'],
    ['compile-nullability-mismatch', ['compile', 'scripts/fixtures/compile_nullability_mismatch.utu'], 1, 'function body type must match'],
    ['compile-illegal-global-init', ['compile', 'scripts/fixtures/compile_illegal_global_init.utu'], 1, 'global init must be constant'],
    ['run-break-and-call', ['run', 'examples/ci/codegen_break_and_call.utu'], 0, '42'],
    ['run-call-simple', ['run', 'examples/call_simple.utu'], 0, '177280'],
    ['run-fannkuch', ['run', 'examples/fannkuch.utu'], 0, '10'],
    ['run-float', ['run', 'examples/float.utu'], 0, '0.8944271901453098'],
    ['run-hello-name', ['run', 'examples/hello_name.utu'], 0, 'hello utu', 'utu\n'],
    ['run-spectralnorm', ['run', 'examples/spectralnorm.utu'], 0, '1.2742222097429006'],
    ['run-deltablue', ['run', 'examples/deltablue.utu'], 0, '0'],
    ['bench-basic', ['bench', 'examples/bench/bench_basic.utu', '--seconds', '0.01', '--samples', '1', '--warmup', '0'], 0, 'sum loop:'],
    ['bench-codegen-surface', ['bench', 'examples/ci/codegen_test_surface.utu', '--seconds', '0.01', '--samples', '1', '--warmup', '0'], 0, 'increment loop:'],
];

let failed = false;
for (const [name, args, code, text, stdin] of cases) {
    const proc = Bun.spawn(['bun', './cli_artifact/src/cli.mjs', ...args], {
        stdin: stdin === undefined ? 'ignore' : 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
    });
    if (stdin !== undefined) {
        proc.stdin.write(stdin);
        proc.stdin.end();
    }
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    const output = `${stdout}${stderr}`;
    const ok = exitCode === code && output.includes(text);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
    if (!ok) {
        failed = true;
        console.log(output.trim());
    }
}

if (failed) process.exit(1);
