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
    ['bench-basic', ['bench', 'examples/bench/bench_basic.utu', '--iterations', '4', '--samples', '1', '--warmup', '0'], 0, 'sum loop:'],
    ['bench-codegen-surface', ['bench', 'examples/ci/codegen_test_surface.utu', '--iterations', '4', '--samples', '1', '--warmup', '0'], 0, 'increment loop:'],
];

let failed = false;
for (const [name, args, code, text] of cases) {
    const proc = Bun.spawn(['bun', './cli_artifact/src/cli.mjs', ...args], { stdout: 'pipe', stderr: 'pipe' });
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
