// scripts/run-tests.mjs — Utu compiler test runner
//
// Usage: bun ./scripts/run-tests.mjs [--no-debug-assertions] [--both-debug-modes]

import path from 'node:path';
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
import { registerCodegenCoreTests } from './codegen-core-tests.mjs';
import { registerCodegenHeapTests } from './codegen-heap-tests.mjs';
import { registerIrStructureTests } from './ir-structure-tests.mjs';
import { registerNegativeDiagnosticTests } from './negative-diagnostic-tests.mjs';
import { registerParserAnalysisTests } from './parser-analysis-tests.mjs';
import { registerStdlibConformanceTests } from './stdlib-conformance-tests.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOTH_DEBUG_MODES = process.argv.includes('--both-debug-modes');
const DEBUG_ASSERTIONS = !process.argv.includes('--no-debug-assertions');

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

function makeCompiler({ ROOT, target }) {
  return makeCompilerBase({ ROOT, target, debugAssertions: DEBUG_ASSERTIONS });
}

const suiteContext = {
  test,
  assert,
  assertEq,
  assertNoErrors,
  assertThrows,
  makeCompiler,
};

registerParserAnalysisTests(suiteContext);
registerIrStructureTests({ test, assertThrows });
registerCodegenCoreTests(suiteContext);
registerStdlibConformanceTests(suiteContext);
registerCodegenHeapTests(suiteContext);
registerNegativeDiagnosticTests({ test, makeCompiler, assert });

async function main() {
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const compiler = createCompilerEnv({ parser, debugAssertions: DEBUG_ASSERTIONS });

  let passed = 0;
  let failed = 0;

  for (const { name, run } of tests) {
    try {
      await run({ compiler, parser, ROOT });
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${name}`);
      console.log(`      ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

if (BOTH_DEBUG_MODES) {
  const script = fileURLToPath(import.meta.url);
  const debug = Bun.spawnSync(['bun', script], { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' });
  const release = Bun.spawnSync(['bun', script, '--no-debug-assertions'], { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' });
  process.exit(debug.exitCode || release.exitCode);
} else {
  main().catch(err => { console.error(err); process.exit(1); });
}
