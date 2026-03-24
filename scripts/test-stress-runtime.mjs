import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import * as compiler from '../index.js';
import { executeRuntimeBenchmark, executeRuntimeTest, loadCompiledRuntime, normalizeCompileArtifact, withRuntime } from '../loadCompiledRuntime.mjs';
import { loadNodeModuleFromSource } from '../loadNodeModuleFromSource.mjs';
import { expectDeepEqual, expectEqual, getRepoRoot, runNamedCases } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const sources = {
    run: await readFile(resolve(repoRoot, 'examples/ci/hello.utu'), 'utf8'),
    test: await readFile(resolve(repoRoot, 'examples/ci/tests_basic.utu'), 'utf8'),
    bench: await readFile(resolve(repoRoot, 'examples/bench/bench_basic.utu'), 'utf8'),
};
const cases = [
    ['compile-run cycle', 25, async () => {
        await withCliRuntime(sources.run, { mode: 'program' }, async (runtime) => {
            const execution = await runtime.invoke('main', [], 'The program does not export a callable main function');
            if (execution.error) {
                throw execution.error;
            }
            expectDeepEqual(execution.logs, []);
            expectEqual(execution.result, 'ok');
        });
    }],
    ['compile-test cycle', 25, async () => {
        await withCliRuntime(sources.test, { mode: 'test' }, async (runtime) => {
            expectEqual(runtime.metadata.tests.length, 2);
            for (let ordinal = 0; ordinal < runtime.metadata.tests.length; ordinal += 1) {
                const result = await executeRuntimeTest(runtime, ordinal);
                expectDeepEqual(result.logs, []);
                if (!result.passed) {
                    throw new Error(`Expected ${result.name} to pass, received ${result.error}`);
                }
            }
        });
    }],
    ['compile-bench cycle', 15, async () => {
        await withCliRuntime(sources.bench, { mode: 'bench' }, async (runtime) => {
            expectEqual(runtime.metadata.benches.length, 1);
            const result = await executeRuntimeBenchmark(runtime, 0, {
                seconds: 0.001,
                samples: 1,
                warmup: 0,
            });
            expectDeepEqual(result.logs, []);
            if (!Number.isFinite(result.meanMs) || result.meanMs < 0) {
                throw new Error(`Expected a finite benchmark mean, received ${result.meanMs}`);
            }
        });
    }],
].map(([name, iterations, run]) => [`${name} (${iterations} iterations)`, async () => {
    for (let iteration = 0; iteration < iterations; iteration += 1)
        await run();
}]);

if (await runNamedCases(cases))
    process.exit(1);

async function withCliRuntime(source, { mode }, run) {
  return withRuntime(loadCompiledRuntime({
    source,
    mode,
    compileSource,
    loadModule: (shim) => loadNodeModuleFromSource(shim, { prefix: `utu-stress-${mode}-` }),
  }), run);
}

async function compileSource(source, { wat = false, mode = 'program', where = 'base64', moduleFormat = 'esm', targetName = null } = {}) {
    await compiler.init();
    return normalizeCompileArtifact(await compiler.compile(source, {
        wat,
        mode,
        where,
        moduleFormat,
        targetName,
    }));
}
