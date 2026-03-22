import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compile } from '../index.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const exampleRoot = resolve(repoRoot, 'examples');
const wasmUrl = pathToFileURL(resolve(repoRoot, 'tree-sitter-utu.wasm'));
const files = (await collectUtuFiles(exampleRoot)).sort();

let failed = false;
for (const file of files) {
    const source = await readFile(file, 'utf8');
    const rel = relative(repoRoot, file);
    const jobs = [{ mode: 'program' }];
    if (/^\s*test\s+"/m.test(source)) jobs.push({ mode: 'test' });
    if (/^\s*bench\s+"/m.test(source)) jobs.push({ mode: 'bench' });

    for (const { mode } of jobs) {
        try {
            const { metadata } = await compile(source, { wasmUrl, mode });
            const details = mode === 'test'
                ? ` ${metadata.tests.length} tests`
                : mode === 'bench'
                    ? ` ${metadata.benches.length} benches`
                    : '';
            console.log(`PASS ${rel} [${mode}]${details}`);
        } catch (error) {
            failed = true;
            console.log(`FAIL ${rel} [${mode}]`);
            console.log(`  ${firstLine(error?.message ?? error)}`);
        }
    }
}

if (failed) process.exit(1);

async function collectUtuFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = resolve(dir, entry.name);
        if (entry.isDirectory()) files.push(...await collectUtuFiles(fullPath));
        else if (entry.isFile() && entry.name.endsWith('.utu')) files.push(fullPath);
    }
    return files;
}

function firstLine(value) {
    return String(value).split('\n')[0];
}
