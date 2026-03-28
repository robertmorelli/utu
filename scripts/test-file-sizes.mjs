import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { assertManagedTestModule, getRepoRoot } from './test-helpers.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = getRepoRoot(import.meta.url);
const MIN_LINES = 8;
const MAX_LINES = 800;
const skippedPrefixes = [
  '.build/',
  '.generated/',
  'documentation/',
  'dist/',
  'examples/',
  'node_modules/',
  'scripts/fixtures/',
  'src/',
];
const skippedFiles = new Set([
  'bun.lock',
  'package-lock.json',
  'tree-sitter-utu.wasm',
  'utu.png',
  'web-tree-sitter.wasm',
]);

assertManagedTestModule(import.meta.url);

const files = await listTrackedFiles();
const failures = [];

for (const relativePath of files) {
  if (shouldSkip(relativePath)) continue;
  const absolutePath = resolve(repoRoot, relativePath);
  const buffer = await readTrackedFile(absolutePath);
  if (!buffer) continue;
  if (isBinary(buffer)) continue;
  const lineCount = countLines(buffer.toString('utf8'));
  if (lineCount > MAX_LINES || lineCount < MIN_LINES)
    failures.push({ path: relativePath, lineCount });
}

if (failures.length) {
  console.log(`FAIL file-sizes (${MIN_LINES}-${MAX_LINES} lines required)`);
  for (const { path, lineCount } of failures.sort((left, right) => left.path.localeCompare(right.path)))
    console.log(`  ${path}: ${lineCount} lines`);
  process.exit(1);
}

console.log(`PASS file-sizes (${MIN_LINES}-${MAX_LINES} lines required)`);

async function listTrackedFiles() {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'buffer', maxBuffer: 1024 * 1024 * 16 });
  return stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

function shouldSkip(relativePath) {
  return skippedFiles.has(relativePath)
    || skippedPrefixes.some((prefix) => relativePath.startsWith(prefix));
}

function isBinary(buffer) {
  return buffer.includes(0);
}

function countLines(text) {
  if (text.length === 0) return 0;
  return text.split('\n').length;
}

async function readTrackedFile(absolutePath) {
  try {
    return await readFile(absolutePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
