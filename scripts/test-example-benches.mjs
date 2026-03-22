const cases = [
    { name: 'call-simple', path: 'examples/call_simple.utu', labels: ['call-simple chain:'] },
    { name: 'deltablue', path: 'examples/deltablue.utu', labels: ['deltablue_chain:', 'deltablue_projection:'] },
    { name: 'fannkuch', path: 'examples/fannkuch.utu', labels: ['fannkuch:'] },
    { name: 'float', path: 'examples/float.utu', labels: ['float normalize:'] },
    { name: 'hello-name', path: 'examples/hello_name.utu', labels: ['hello-name format:'] },
    { name: 'spectralnorm', path: 'examples/spectralnorm.utu', labels: ['spectralnorm:'] },
];

let failed = false;
for (const testCase of cases) {
    const args = ['bun', './cli.mjs', 'bench', testCase.path, '--seconds', '0.01', '--samples', '1', '--warmup', '0'];
    const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    const output = `${stdout}${stderr}`;
    const ok = exitCode === 0 && testCase.labels.every(label => output.includes(label));
    console.log(`${ok ? 'PASS' : 'FAIL'} ${testCase.name}`);
    if (!ok) {
        failed = true;
        console.log(output.trim());
    }
}

if (failed) process.exit(1);
