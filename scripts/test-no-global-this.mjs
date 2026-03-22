import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

import { getRepoRoot } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const failures = [];
const forbidden = 'global' + 'This';

await scanRepo(repoRoot);
await scanJsondata(resolve(repoRoot, 'jsondata'));

if (failures.length) {
  console.log('FAIL no-global-this');
  for (const failure of failures)
    console.log(`  ${failure}`);
  process.exit(1);
}

console.log('PASS no-global-this');

async function scanRepo(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.build' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'node_modules')
      continue;
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await scanRepo(fullPath);
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')))
      await checkFile(fullPath);
  }
}

async function scanJsondata(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await scanJsondata(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json'))
      await checkFile(fullPath);
  }
}

async function checkFile(path) {
  const source = await readFile(path, 'utf8');
  if (source.includes(forbidden))
    failures.push(relative(repoRoot, path));
}
