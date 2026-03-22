import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getRepoRoot } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const manifestPath = resolve(repoRoot, 'jsondata/test.manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const requestedIds = process.argv.slice(2);

const tests = requestedIds.length === 0
  ? manifest
  : requestedIds.map((id) => {
      const match = manifest.find((test) => test.id === id);
      if (!match) throw new Error(`Unknown test id: ${id}`);
      return match;
    });

for (const [index, test] of tests.entries()) {
  const step = `[${index + 1}/${tests.length}]`;
  console.log(`${step} ${test.label}`);
  const proc = Bun.spawn(test.command, {
    cwd: repoRoot,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error(`${step} Failed: ${test.id}`);
    process.exit(exitCode);
  }
}

console.log(`Completed ${tests.length} test${tests.length === 1 ? '' : 's'}.`);
