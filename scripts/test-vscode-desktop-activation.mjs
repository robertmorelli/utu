import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertManagedTestModule, getRepoRoot } from './test-helpers.mjs';

assertManagedTestModule(import.meta.url);

const repoRoot = getRepoRoot(import.meta.url);
const vsixPath = resolve(repoRoot, 'dist/utu-vscode-0.1.1.vsix');

await main();

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'utu-vscode-desktop-'));
  const userDataDir = join(tempRoot, 'user');
  const extensionsDir = join(tempRoot, 'extensions');

  try {
    await runCode([
      '--user-data-dir', userDataDir,
      '--extensions-dir', extensionsDir,
      '--install-extension', vsixPath,
      '--force',
    ], 'VSIX install failed');

    await runCode([
      '--user-data-dir', userDataDir,
      '--extensions-dir', extensionsDir,
      '--new-window',
      '--disable-workspace-trust',
      '--log', 'trace',
      repoRoot,
    ], 'VS Code launch failed');

    const logDir = await waitForLaunchLogDir(userDataDir);
    const activated = await waitForActivation(logDir);
    if (!activated) {
      console.log('PASS vscode desktop activation (skipped: no desktop window logs)');
      return;
    }

    const failures = await collectActivationFailures(logDir);
    if (failures.length) {
      throw new Error(failures.join('\n'));
    }

    console.log('PASS vscode desktop activation');
  } finally {
    await killCodeProcessesForProfile(userDataDir);
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function runCode(args, label) {
  const proc = Bun.spawn(['code', ...args], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${label}: ${[stdout.trim(), stderr.trim()].filter(Boolean).join('\n') || `exit ${exitCode}`}`);
  }
}

async function waitForLaunchLogDir(userDataDir, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const dirs = await listLogDirs(userDataDir);
    if (dirs.length) return dirs.at(-1);
    await sleep(250);
  }
  throw new Error('Timed out waiting for VS Code log directory.');
}

async function listLogDirs(userDataDir) {
  const logsRoot = join(userDataDir, 'logs');
  const entries = await readdir(logsRoot, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(logsRoot, entry.name)).sort();
}

async function waitForActivation(logDir, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const exthostLogs = await findExthostLogs(logDir);
    for (const exthostLog of exthostLogs) {
      const text = await readFile(exthostLog, 'utf8').catch(() => '');
      if (text.includes('ExtensionService#_doActivateExtension robertmorelli.utu-vscode'))
        return true;
    }
    await sleep(250);
  }
  return (await findWindowLogDirs(logDir)).length > 0
    ? Promise.reject(new Error('Timed out waiting for robertmorelli.utu-vscode activation in exthost.log.'))
    : false;
}

async function collectActivationFailures(logDir) {
  const files = await findRelevantLogFiles(logDir);

  const failures = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8').catch(() => '');
    if (!text) continue;
    if (text.includes("Failed to construct 'URL': Invalid URL")) {
      failures.push(`${file}: activation still reports Invalid URL`);
    }
    if (text.includes("The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received undefined")) {
      failures.push(`${file}: extension still resolves an undefined filename during validation`);
    }
  }
  return failures;
}

async function findWindowLogDirs(logDir) {
  const entries = await readdir(logDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('window'))
    .map((entry) => join(logDir, entry.name));
}

async function findExthostLogs(logDir) {
  const windowDirs = await findWindowLogDirs(logDir);
  return windowDirs.map((windowDir) => join(windowDir, 'exthost', 'exthost.log'));
}

async function findRelevantLogFiles(logDir) {
  const files = [];
  for (const windowDir of await findWindowLogDirs(logDir))
    files.push(...await collectLogFiles(windowDir));
  return files;
}

async function collectLogFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectLogFiles(fullPath));
      continue;
    }
    if (entry.isFile() && isRelevantLogFile(entry.name))
      files.push(fullPath);
  }
  return files;
}

function isRelevantLogFile(name) {
  return name.endsWith('.log') || name.includes('UTU');
}

async function killCodeProcessesForProfile(userDataDir) {
  const proc = Bun.spawn(['pgrep', '-f', userDataDir], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited.catch(() => 1)]);
  const pids = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0 && value !== process.pid);

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
