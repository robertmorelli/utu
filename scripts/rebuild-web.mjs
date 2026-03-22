import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { getRepoRoot } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);

await Promise.all([
  rm(resolve(repoRoot, 'dist'), { recursive: true, force: true }),
  rm(resolve(repoRoot, 'tree-sitter-utu.wasm'), { force: true }),
  rm(resolve(repoRoot, 'web-tree-sitter.wasm'), { force: true }),
]);

process.argv = [process.argv[0], process.argv[1], '--web-only'];
await import('./build.mjs');
