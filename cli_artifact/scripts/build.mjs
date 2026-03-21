import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(cliRoot, 'dist');
const packageRoot = resolve(distRoot, 'package');
const entry = resolve(cliRoot, 'src', 'cli.mjs');

await mkdir(distRoot, { recursive: true });
await rm(packageRoot, { recursive: true, force: true });

await exec('bun', ['build', '--target=bun', '--outdir', packageRoot, entry]);
await exec('bun', ['build', '--compile', '--target=bun', '--outfile', resolve(distRoot, 'utu'), entry]);

function exec(command, args) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(command, args, { stdio: 'inherit' });
        child.on('error', rejectPromise);
        child.on('exit', (code) => code === 0
            ? resolvePromise()
            : rejectPromise(new Error(`${command} exited with code ${code ?? 1}`)));
    });
}
