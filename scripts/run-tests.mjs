import { registerIteratorWutuTests } from './iterator-wutu-tests.mjs';
// scripts/run-tests.mjs — Utu compiler test runner
//
// Usage: bun ./scripts/run-tests.mjs [--no-debug-assertions | --both-debug-modes] [--jobs=N] [--only=substring]
//
// Tests run in parallel worker processes (one per core by default), each with
// its own scratch directory under .tmp/.

import path from 'node:path';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { initParser } from '../src/index.js';
import {
  assert,
  assertEq,
  assertNoErrors,
  assertThrows,
  createCompilerEnv,
  makeCompiler as makeCompilerBase,
} from './test-harness.mjs';
import { registerParserLifecycleTests } from './parser-lifecycle-tests.mjs';
import { registerRangeIndexTests } from './range-index-tests.mjs';
import { registerCompilerQualityTests } from './compiler-quality-tests.mjs';
import { registerAdversarialCompilerTests } from './adversarial-compiler-tests.mjs';
import { registerCodegenCoreTests } from './codegen-core-tests.mjs';
import { registerCodegenHeapTests } from './codegen-heap-tests.mjs';
import { registerExamplesConformanceTests } from './examples-conformance-tests.mjs';
import { registerIrStructureTests } from './ir-structure-tests.mjs';
import { registerNegativeDiagnosticTests } from './negative-diagnostic-tests.mjs';
import { registerParserAnalysisTests } from './parser-analysis-tests.mjs';
import { registerStdlibConformanceTests } from './stdlib-conformance-tests.mjs';
import { registerWutuTests } from './wutu-tests.mjs';
import { registerWutuRuntimeTests } from './wutu-runtime-tests.mjs';
import { registerImportDiagnosticTests } from './import-diagnostic-tests.mjs';
import { registerLanguageRegressionTests } from './language-regression-tests.mjs';
import { registerIteratorDifferentialTests } from './iterator-differential-tests.mjs';
import { registerJsonTests } from './json-tests.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const WORKER = process.argv.includes('--worker');
const BOTH_DEBUG_MODES = process.argv.includes('--both-debug-modes');
const ONLY = flag('only');
const JOBS = Number(flag('jobs') ?? os.availableParallelism());
const TIMES = path.join(ROOT, '.tmp', 'test-times.json');
// A worker runs tests in either mode; the mode is set per test.
let DEBUG_ASSERTIONS = !process.argv.includes('--no-debug-assertions');

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

function makeCompiler({ ROOT, target, optimize }) {
  return makeCompilerBase({ ROOT, target, optimize, debugAssertions: DEBUG_ASSERTIONS });
}

const suiteContext = {
  test,
  assert,
  assertEq,
  assertNoErrors,
  assertThrows,
  makeCompiler,
};

registerParserLifecycleTests(suiteContext);
registerRangeIndexTests(suiteContext);
registerCompilerQualityTests(suiteContext);
registerParserAnalysisTests(suiteContext);
registerIrStructureTests({ test, assertThrows });
registerCodegenCoreTests(suiteContext);
registerIteratorWutuTests(suiteContext);
registerWutuTests(suiteContext);
registerWutuRuntimeTests(suiteContext);
registerStdlibConformanceTests(suiteContext);
registerCodegenHeapTests(suiteContext);
registerAdversarialCompilerTests(suiteContext);
registerExamplesConformanceTests(suiteContext);
registerNegativeDiagnosticTests({ test, makeCompiler, assert });
registerImportDiagnosticTests(suiteContext);
registerLanguageRegressionTests(suiteContext);
registerIteratorDifferentialTests(suiteContext);
registerJsonTests(suiteContext);

const RESULT = '\u001eutu-test-result ';

/** Worker: read `{ index, debug }` lines, run each test, write one result line. */
async function worker() {
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const compilers = new Map();
  const lines = readline.createInterface({ input: process.stdin });
  for await (const line of lines) {
    const { index, debug } = JSON.parse(line);
    DEBUG_ASSERTIONS = debug;
    if (!compilers.has(debug)) compilers.set(debug, createCompilerEnv({ parser, debugAssertions: debug }));
    const started = performance.now();
    let error = null;
    try {
      await tests[index].run({ compiler: compilers.get(debug), parser, ROOT });
    } catch (err) {
      error = err?.message ?? String(err);
    }
    process.stdout.write(`${RESULT}${JSON.stringify({ index, debug, error, ms: performance.now() - started })}\n`);
  }
}

/**
 * Run every test (in both debug modes with --both-debug-modes) across --jobs
 * worker processes, longest first by the last run's times.
 */
async function main() {
  const started = performance.now();
  const modes = BOTH_DEBUG_MODES ? [true, false] : [DEBUG_ASSERTIONS];
  let times = {};
  try { times = JSON.parse(await fs.readFile(TIMES, 'utf8')); } catch {}
  const key = job => `${job.debug ? 'debug' : 'plain'} ${tests[job.index].name}`;
  const queue = modes.flatMap(debug => tests.map((t, index) => ({ index, debug })))
    .filter(job => !ONLY || tests[job.index].name.includes(ONLY))
    .sort((a, b) => (times[key(b)] ?? Infinity) - (times[key(a)] ?? Infinity));
  const total = queue.length;
  const failures = [];
  let passed = 0;
  const label = job => (modes.length > 1 && !job.debug ? `${tests[job.index].name} [no debug assertions]` : tests[job.index].name);

  async function runWorker(id) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker'], {
      cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, UTU_TEST_WORKER: `worker-${id}` },
    });
    const lines = readline.createInterface({ input: child.stdout });
    let output = [];
    const next = () => {
      const job = queue.shift();
      if (job) child.stdin.write(`${JSON.stringify(job)}\n`);
      else child.stdin.end();
      return job;
    };
    const exited = new Promise(resolve => child.on('exit', code => resolve(code)));
    let current = next();
    for await (const line of lines) {
      if (!line.startsWith(RESULT)) { output.push(line); continue; }
      const result = JSON.parse(line.slice(RESULT.length));
      times[key(result)] = Math.round(result.ms);
      if (result.error) {
        failures.push({ job: result, error: result.error, output });
        console.log(`  ✗ ${label(result)}`);
      } else {
        passed++;
        console.log(`  ✓ ${label(result)}`);
        for (const text of output) console.log(`      ${text}`);
      }
      output = [];
      current = next();
    }
    const code = await exited;
    if (current) failures.push({ job: current, error: `worker exited with code ${code}`, output });
  }

  await Promise.all(Array.from({ length: Math.min(JOBS, total) }, (_, id) => runWorker(id)));
  await fs.mkdir(path.dirname(TIMES), { recursive: true });
  const current = new Set(modes.flatMap(debug => tests.map((t, index) => key({ index, debug }))));
  await fs.writeFile(TIMES, JSON.stringify(Object.fromEntries(Object.entries(times).filter(([name]) => current.has(name) || !modes.includes(name.startsWith('debug'))))));
  await Promise.all(Array.from({ length: JOBS }, (_, id) => fs.rm(path.join(ROOT, '.tmp', `worker-${id}`), { recursive: true, force: true })));

  for (const { job, error, output } of failures) {
    console.log(`\n✗ ${label(job)}\n    ${error}`);
    for (const text of output) console.log(`      ${text}`);
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const modeText = modes.length > 1 ? `, ${tests.length} tests × 2 debug modes` : '';
  console.log(`\n${passed} passed, ${failures.length} failed${modeText}, ${seconds} s on ${Math.min(JOBS, total)} workers`);
  if (failures.length || passed !== total) process.exit(1);
}

(WORKER ? worker() : main()).catch(err => { console.error(err); process.exit(1); });
