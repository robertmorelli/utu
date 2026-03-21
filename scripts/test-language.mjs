const cases = [
    ['assert-pass', ['run', 'examples/ci/assert_pass.utu'], 0, 'ok'],
    ['assert-fail', ['run', 'examples/ci/assert_fail.utu'], 1, 'Unreachable code'],
    ['tests-basic', ['test', 'examples/ci/tests_basic.utu'], 0, 'PASS adds two numbers'],
    ['tests-fail', ['test', 'examples/ci/tests_fail.utu'], 1, 'FAIL fails'],
    ['bench-basic', ['bench', 'examples/bench/bench_basic.utu', '--iterations', '4', '--samples', '1', '--warmup', '0'], 0, 'sum loop:'],
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
