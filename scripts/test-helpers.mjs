import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSourceDocument } from '../packages/document/index.js';

const runtimeGlobals = Function('return this')();

export function getRepoRoot(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), '..');
}

export function isDirectModuleExecution(importMetaUrl) {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(importMetaUrl);
}

export function failDirectTestExecution(importMetaUrl) {
  if (!isDirectModuleExecution(importMetaUrl)) return;
  console.error('Individual test scripts are disabled. Run `bun run test`.');
  process.exit(1);
}

export function getManagedTestArgs(importMetaUrl) {
  failDirectTestExecution(importMetaUrl);
  const token = runtimeGlobals.__utuManagedTestToken;
  const args = runtimeGlobals.__utuManagedTestArgs;
  if (typeof token !== 'string' || token.length === 0 || !Array.isArray(args))
    throw new Error('UTU test modules must be launched by `bun run test`.');
  return [...args];
}

export function assertManagedTestModule(importMetaUrl) {
  void getManagedTestArgs(importMetaUrl);
}

export async function collectUtuFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectUtuFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.utu'))
      files.push(fullPath);
  }
  return files;
}

export function collectCompileJobs(source) {
  const jobs = [];
  if (/^\s*(fun\s+main\s*\(|library\s*\{)/m.test(source)) jobs.push({ mode: 'program' });
  if (/^\s*test\s+"/m.test(source)) jobs.push({ mode: 'test' });
  if (/^\s*bench\s+"/m.test(source)) jobs.push({ mode: 'bench' });
  return jobs;
}

export function firstLine(value) { return String(value).split('\n')[0]; }

export function createDocument(uri, text) {
  return createSourceDocument(text, { uri, version: 1 });
}

export function expectEqual(actual, expected) {
  if (actual !== expected)
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

export function expectDeepEqual(actual, expected) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson)
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
}

export function expectValue(actual, expected) {
  const actualText = describeValue(actual);
  const expectedText = describeValue(expected);
  if (Object.is(actual, expected) || actualText === expectedText) return;
  throw new Error(`Expected ${expectedText}, received ${actualText}`);
}

export function describeValue(value) {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

export async function runNamedCases(cases) {
  let failed = false;
  for (const [name, run] of cases) {
    try {
      await run();
      console.log(`PASS ${name}`);
    } catch (error) {
      failed = true;
      console.log(`FAIL ${name}`);
      console.log(`  ${String(error instanceof Error ? error.message : error)}`);
    }
  }
  return failed;
}

export async function runCli(args, stdin) {
  const proc = Bun.spawn(['bun', './packages/hosts/cli/main.mjs', ...args], { stdin: stdin === undefined ? 'ignore' : 'pipe', stdout: 'pipe', stderr: 'pipe' });
  if (stdin !== undefined) {
    proc.stdin.write(stdin);
    proc.stdin.end();
  }
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { output: `${stdout}${stderr}`, exitCode };
}
