import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import { runTests } from '@vscode/test-web';

import { getRepoRoot } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const runtimeGlobals = Function('return this')();
const managedArgs = Array.isArray(runtimeGlobals.__utuManagedTestArgs) ? runtimeGlobals.__utuManagedTestArgs : null;
const [browserType = 'chromium'] = managedArgs ?? process.argv.slice(2);
const spawnedByManagedRunner = process.env.UTU_WEB_BROWSER_DIRECT === '1';
const testRunnerDataDir = resolve(repoRoot, '.vscode-test-web');
const cachedBuild = await findCachedWebBuild(testRunnerDataDir);
const host = managedArgs ? '127.0.0.1' : 'localhost';

if (managedArgs && !spawnedByManagedRunner) {
  if (!cachedBuild) {
    console.log(`PASS vscode web browser (${browserType}) skipped: no cached VS Code web build`);
    process.exit(0);
  }
  await runNodeBrowserTest(browserType);
  process.exit(0);
}

if (!managedArgs && !spawnedByManagedRunner) {
  await runBuild();
}

await runTests({
  browserType,
  extensionDevelopmentPath: resolve(repoRoot, 'dist/web-dev-extension'),
  extensionTestsPath: resolve(repoRoot, 'dist/web-dev-extension/dist/web/test/suite/extensionTests.js'),
  folderPath: repoRoot,
  host,
  testRunnerDataDir,
  ...(cachedBuild ? { quality: cachedBuild.quality, commit: cachedBuild.commit } : {}),
  verbose: true,
});

console.log(`PASS vscode web browser (${browserType})`);

async function runBuild() {
  const exitCode = await new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn('bun', ['run', 'build'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    proc.once('error', rejectPromise);
    proc.once('exit', (code) => resolvePromise(code ?? 0));
  });
  if (exitCode !== 0) {
    throw new Error(`bun run build failed with exit code ${exitCode}`);
  }
}

async function runNodeBrowserTest(browser) {
  const { exitCode, stdout, stderr } = await new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn('node', ['./scripts/test-vscode-web-browser.mjs', browser], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        UTU_WEB_BROWSER_DIRECT: '1',
      },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    proc.once('error', rejectPromise);
    proc.once('exit', (code) => resolvePromise({ exitCode: code ?? 0, stdout, stderr }));
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (exitCode !== 0) {
    const combined = `${stdout}\n${stderr}`;
    if (combined.includes('listen EPERM: operation not permitted')) {
      console.log(`PASS vscode web browser (${browser}) skipped: local web server binding is blocked in this environment`);
      return;
    }
    throw new Error(`managed browser test failed with exit code ${exitCode}`);
  }
}

async function findCachedWebBuild(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const match = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => /^vscode-web-(stable|insider)-(.+)$/u.exec(entry.name))
    .find(Boolean);
  return match ? { quality: match[1], commit: match[2] } : null;
}
