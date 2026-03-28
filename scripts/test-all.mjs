import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { failDirectTestExecution, getRepoRoot } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const manifestPath = resolve(repoRoot, 'jsondata/test.manifest.json');
const ignoredTestScripts = new Set(['test-all.mjs', 'test-helpers.mjs']);

failDirectTestExecution(import.meta.url);

export async function runTestSuite({ token, runnerPath }) {
  if (typeof token !== 'string' || token.length === 0)
    throw new Error('runTestSuite requires a non-empty managed test token.');
  if (typeof runnerPath !== 'string' || runnerPath.length === 0)
    throw new Error('runTestSuite requires an ephemeral managed runner path.');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await assertManifestCoverage(manifest);

  for (const [index, test] of manifest.entries()) {
    const step = `[${index + 1}/${manifest.length}]`;
    console.log(`${step} ${test.label}`);
    const proc = Bun.spawn(['bun', runnerPath, test.module, JSON.stringify(test.args ?? [])], {
      cwd: repoRoot,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
      env: {
        ...process.env,
        UTU_MANAGED_TEST_TOKEN: token,
      },
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      console.error(`${step} Failed: ${test.id}`);
      return exitCode;
    }
  }

  console.log(`Completed ${manifest.length} test${manifest.length === 1 ? '' : 's'}.`);
  return 0;
}

async function assertManifestCoverage(tests) {
  const scriptsDir = resolve(repoRoot, 'scripts');
  const scriptEntries = await readdir(scriptsDir, { withFileTypes: true });
  const expectedScripts = scriptEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith('test-') && name.endsWith('.mjs') && !ignoredTestScripts.has(name))
    .sort();
  const coveredScripts = new Set(tests
    .map(({ module }) => module)
    .filter((value) => typeof value === 'string' && value.startsWith('./scripts/test-') && value.endsWith('.mjs'))
    .map((value) => value.slice('./scripts/'.length)));
  const missingScripts = expectedScripts.filter((name) => !coveredScripts.has(name));
  if (missingScripts.length) {
    throw new Error(`jsondata/test.manifest.json is missing test scripts: ${missingScripts.join(', ')}`);
  }
}
