// scripts/run-tests.mjs — Utu compiler test runner
//
// Usage: bun ./scripts/run-tests.mjs [--no-debug-assertions] [--both-debug-modes]

import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

registerParserLifecycleTests(suiteContext);
registerRangeIndexTests(suiteContext);
registerCompilerQualityTests(suiteContext);
registerParserAnalysisTests(suiteContext);
registerIrStructureTests({ test, assertThrows });
registerCodegenCoreTests(suiteContext);
registerStdlibConformanceTests(suiteContext);
registerCodegenHeapTests(suiteContext);
registerAdversarialCompilerTests(suiteContext);
registerExamplesConformanceTests(suiteContext);
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
  for (const flags of [[], ['--no-debug-assertions']]) {
    const child = spawnSync(process.execPath, [script, ...flags], { cwd: ROOT, stdio: 'inherit' });
    if (child.error) throw child.error;
    if (child.status !== 0) process.exit(child.status ?? 1);
  }
} else {
  main().catch(err => { console.error(err); process.exit(1); });
}
