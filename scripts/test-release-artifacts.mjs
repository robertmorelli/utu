import { access, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertManagedTestModule,
  getRepoRoot,
  runNamedCases,
} from './test-helpers.mjs';

assertManagedTestModule(import.meta.url);

const repoRoot = getRepoRoot(import.meta.url);
let nextRequestId = 1;

const failed = await runNamedCases([
  ['bundled CLI binary runs compile/run/test/bench', testBundledCliBinary],
  ['bundled CLI script runs from dist/cli-package/cli.js', testBundledCliScript],
  ['bundled LSP binary publishes diagnostics', testBundledLspBinary],
]);

if (failed)
  process.exit(1);

async function testBundledCliBinary() {
  await Promise.all([
    access(resolve(repoRoot, 'utu')),
    access(resolve(repoRoot, 'dist/cli-package/cli.js')),
  ]);

  const outdir = await mkdtemp(join(tmpdir(), 'utu-release-cli-'));
  try {
    const compile = await runProcess([
      './utu',
      'compile',
      './examples/call_simple.utu',
      '--outdir',
      outdir,
      '--node',
      '--wat',
    ]);
    expectExitCode(compile, 0, 'bundled CLI compile');
    expectIncludes(compile.output, 'call_simple.mjs', 'bundled CLI compile output');
    expectIncludes(compile.output, 'call_simple.wasm', 'bundled CLI compile output');
    expectIncludes(compile.output, 'call_simple.wat', 'bundled CLI compile output');

    const run = await runProcess(['./utu', 'run', './examples/call_simple.utu']);
    expectExitCode(run, 0, 'bundled CLI run');
    expectIncludes(run.output, '177280n', 'bundled CLI run output');

    const test = await runProcess(['./utu', 'test', './examples/ci/tests_basic.utu']);
    expectExitCode(test, 0, 'bundled CLI test');
    expectIncludes(test.output, 'PASS adds two numbers', 'bundled CLI test output');
    expectIncludes(test.output, 'PASS adds negatives', 'bundled CLI test output');

    const bench = await runProcess([
      './utu',
      'bench',
      './examples/bench/bench_basic.utu',
      '--seconds',
      '0.01',
      '--samples',
      '1',
      '--warmup',
      '0',
    ]);
    expectExitCode(bench, 0, 'bundled CLI bench');
    expectIncludes(bench.output, 'sum loop:', 'bundled CLI bench output');
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
}

async function testBundledCliScript() {
  const result = await runProcess([
    'bun',
    './dist/cli-package/cli.js',
    'run',
    './examples/call_simple.utu',
  ]);
  expectExitCode(result, 0, 'bundled CLI script');
  expectIncludes(result.output, '177280n', 'bundled CLI script output');
}

async function testBundledLspBinary() {
  await access(resolve(repoRoot, 'utu-lsp'));

  const proc = spawn('./utu-lsp', {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exitPromise = waitForExit(proc);
  const session = createJsonRpcSession(proc);
  const rootUri = pathToFileURL(repoRoot).toString();

  try {
    session.sendRequest('initialize', {
      processId: process.pid,
      rootUri,
      capabilities: {},
      workspaceFolders: [{ uri: rootUri, name: 'utu' }],
    });
    await session.waitFor((message) => message.id === 1);

    session.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: 'file:///release-artifact-smoke.utu',
        languageId: 'utu',
        version: 1,
        text: 'fun main() i32 { 0; }',
      },
    });

    const publish = await session.waitFor((message) => message.method === 'textDocument/publishDiagnostics');
    if (!Array.isArray(publish.params?.diagnostics))
      throw new Error(`Expected diagnostics array, received ${JSON.stringify(publish)}`);

    session.sendRequest('shutdown');
    await session.waitFor((message) => message.id === 2);
    session.sendNotification('exit');

    const exitCode = await exitPromise;
    if (exitCode !== 0)
      throw new Error(`Expected utu-lsp to exit cleanly, received ${exitCode}.`);
  } finally {
    proc.kill('SIGTERM');
  }
}

function createJsonRpcSession(proc) {
  let stdoutBuffer = Buffer.alloc(0);
  let stderrBuffer = '';
  const queuedMessages = [];
  const waiters = [];

  proc.stdout.on('data', (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    drainStdout();
  });
  proc.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString('utf8');
  });
  proc.on('exit', (code, signal) => {
    const error = new Error(`utu-lsp exited early (${signal ?? code ?? 'unknown'}).${stderrBuffer ? `\n${stderrBuffer}` : ''}`);
    while (waiters.length)
      waiters.shift().reject(error);
  });

  return {
    sendRequest(method, params) {
      const id = nextRequestId++;
      writeJsonRpcMessage(proc.stdin, { jsonrpc: '2.0', id, method, params });
      return id;
    },
    sendNotification(method, params) {
      writeJsonRpcMessage(proc.stdin, { jsonrpc: '2.0', method, params });
    },
    waitFor(predicate, timeoutMs = 5000) {
      const queuedIndex = queuedMessages.findIndex(predicate);
      if (queuedIndex >= 0)
        return Promise.resolve(queuedMessages.splice(queuedIndex, 1)[0]);
      return new Promise((resolvePromise, rejectPromise) => {
        const timeout = setTimeout(() => {
          const waiterIndex = waiters.findIndex((waiter) => waiter.resolve === resolvePromise);
          if (waiterIndex >= 0)
            waiters.splice(waiterIndex, 1);
          rejectPromise(new Error(`Timed out waiting for JSON-RPC message.${stderrBuffer ? `\n${stderrBuffer}` : ''}`));
        }, timeoutMs);
        waiters.push({
          predicate,
          resolve(message) {
            clearTimeout(timeout);
            resolvePromise(message);
          },
          reject(error) {
            clearTimeout(timeout);
            rejectPromise(error);
          },
        });
      });
    },
  };

  function drainStdout() {
    while (true) {
      const headerEnd = stdoutBuffer.indexOf('\r\n\r\n');
      if (headerEnd < 0)
        return;
      const headerText = stdoutBuffer.slice(0, headerEnd).toString('utf8');
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(headerText);
      if (!lengthMatch)
        throw new Error(`Missing Content-Length header in LSP output: ${headerText}`);
      const contentLength = Number.parseInt(lengthMatch[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      if (stdoutBuffer.length < bodyEnd)
        return;
      const message = JSON.parse(stdoutBuffer.slice(bodyStart, bodyEnd).toString('utf8'));
      stdoutBuffer = stdoutBuffer.slice(bodyEnd);
      deliverMessage(message);
    }
  }

  function deliverMessage(message) {
    const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiterIndex >= 0) {
      waiters.splice(waiterIndex, 1)[0].resolve(message);
      return;
    }
    queuedMessages.push(message);
  }
}

function writeJsonRpcMessage(stdin, message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  stdin.write(`Content-Length: ${payload.length}\r\n\r\n`, 'utf8');
  stdin.write(payload);
}

function waitForExit(proc) {
  return new Promise((resolvePromise, rejectPromise) => {
    proc.once('error', rejectPromise);
    proc.once('exit', (code) => resolvePromise(code ?? 0));
  });
}

function expectExitCode(result, expected, label) {
  if (result.exitCode !== expected) {
    throw new Error(`${label} exited with ${result.exitCode}, expected ${expected}.\n${result.output}`);
  }
}

function expectIncludes(text, expected, label) {
  if (!text.includes(expected))
    throw new Error(`${label} is missing ${JSON.stringify(expected)}.\n${text}`);
}

function runProcess(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(args[0], args.slice(1), {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    proc.stdout.on('data', (chunk) => {
      output += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk) => {
      output += chunk.toString('utf8');
    });
    proc.on('error', rejectPromise);
    proc.on('exit', (exitCode) => {
      resolvePromise({ exitCode: exitCode ?? 0, output });
    });
  });
}
