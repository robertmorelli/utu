import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { getRepoRoot } from './test-helpers.mjs';

const releaseKind = process.argv[2];
const bumpModes = new Map([
  ['small', 'patch'],
  ['medium', 'minor'],
  ['large', 'major'],
]);

if (!bumpModes.has(releaseKind)) {
  console.error('Usage: bun run bump small|medium|large');
  process.exit(1);
}

const repoRoot = getRepoRoot(import.meta.url);
const packageJsonPath = resolve(repoRoot, 'package.json');
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const nextVersion = bumpVersion(packageJson.version, bumpModes.get(releaseKind));

packageJson.version = nextVersion;
await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

console.log(`Bumped version: ${packageJson.version}`);
await runBuild(repoRoot);
printMarketplaceLinks(packageJson);

function bumpVersion(version, mode) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version ?? '');
  if (!match) throw new Error(`Expected package.json version to be semver x.y.z, received: ${version}`);

  const [major, minor, patch] = match.slice(1).map(Number);

  if (mode === 'major') return `${major + 1}.0.0`;
  if (mode === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function runBuild(cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('bun', ['run', 'build'], {
      cwd,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(signal ? `bun run build terminated by signal ${signal}` : `bun run build exited with code ${code}`));
    });
  });
}

function printMarketplaceLinks(packageJson) {
  const publisher = packageJson.publisher;
  const extensionName = packageJson.name;
  if (typeof publisher !== 'string' || !publisher || typeof extensionName !== 'string' || !extensionName) return;

  console.log('');
  console.log(`Manage extension: https://marketplace.visualstudio.com/manage/publishers/${publisher}/extensions/${extensionName}/hub`);
  console.log(`Manage publisher: https://marketplace.visualstudio.com/manage/publishers/${publisher}`);
}
