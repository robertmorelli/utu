import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = resolve(repoRoot, 'package.json');

assertSuiteEntry();

const build = Bun.spawn(['bun', 'run', 'build'], {
  cwd: repoRoot,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});

const buildExitCode = await build.exited;
if (buildExitCode !== 0)
  process.exit(buildExitCode);

const token = randomUUID();
const runnerDir = await mkdtemp(resolve(tmpdir(), 'utu-test-runner-'));
const runnerPath = resolve(runnerDir, 'managed-runner.mjs');

await writeFile(runnerPath, createManagedRunnerSource(), 'utf8');

try {
  const { runTestSuite } = await import('./test-all.mjs');
  const exitCode = await runTestSuite({ runnerPath, token });
  process.exit(exitCode);
} finally {
  await rm(runnerDir, { recursive: true, force: true });
}

function createManagedRunnerSource() {
  return `
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const runtimeGlobals = Function('return this')();
const [modulePath, rawArgs = '[]'] = process.argv.slice(2);

if (typeof process.env.UTU_MANAGED_TEST_TOKEN !== 'string' || process.env.UTU_MANAGED_TEST_TOKEN.length === 0) {
  console.error('Managed test launcher is internal. Run \`bun run test\`.');
  process.exit(1);
}

if (!modulePath) {
  throw new Error('Expected a managed test module path.');
}

let args;
try {
  args = JSON.parse(rawArgs);
} catch (error) {
  throw new Error(\`Invalid managed test args JSON: \${String(error instanceof Error ? error.message : error)}\`);
}

if (!Array.isArray(args)) {
  throw new Error('Managed test args must decode to an array.');
}

runtimeGlobals.__utuManagedTestToken = process.env.UTU_MANAGED_TEST_TOKEN;
runtimeGlobals.__utuManagedTestArgs = args;

await import(pathToFileURL(resolve(process.cwd(), modulePath)).href);
`;
}

function assertSuiteEntry() {
  const launchedFromTestScript = process.env.UTU_SUITE_GATE === 'utu_test';
  const launchedFromPackageRunner = process.env.npm_command === 'run-script'
    && process.env.npm_package_json === packageJsonPath;
  if (launchedFromTestScript && launchedFromPackageRunner) return;
  console.error('Test suite entry is locked. Run `bun run test`.');
  process.exit(1);
}
