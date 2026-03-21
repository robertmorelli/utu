const cases = [
    { name: 'call-simple', path: 'examples/call_simple.utu', label: 'call-simple chain:' },
    { name: 'deltablue', path: 'examples/deltablue.utu', label: 'deltablue:' },
    { name: 'fannkuch', path: 'examples/fannkuch.utu', label: 'fannkuch:' },
    { name: 'float', path: 'examples/float.utu', label: 'float normalize:' },
    { name: 'hello-name', path: 'examples/hello_name.utu', label: 'hello-name format:' },
    { name: 'spectralnorm', path: 'examples/spectralnorm.utu', label: 'spectralnorm:' },
];

let failed = false;
for (const testCase of cases) {
    const args = ['bun', './cli_artifact/src/cli.mjs', 'bench', testCase.path, '--iterations', '1', '--samples', '1', '--warmup', '0'];
    const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    const output = `${stdout}${stderr}`;
    const ok = exitCode === 0 && output.includes(testCase.label);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${testCase.name}`);
    if (!ok) {
        failed = true;
        console.log(output.trim());
    }
}

if (failed) process.exit(1);
