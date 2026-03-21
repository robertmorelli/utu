import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileUtuSource } from '../cli_artifact/src/lib/compiler.mjs';
import { loadNodeModuleFromSource } from '../cli_artifact/src/lib/nodeRuntime.mjs';
import { executeFixedRuntimeBenchmark, executeRuntimeTest, loadCompiledRuntime, withRuntime } from '../shared/compiledRuntime.mjs';
import { createCliImportProvider } from '../shared/hostImports.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
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
            expectDeepEqual(execution.logs, ['ok']);
        });
    }],
    ['compile-test cycle', 25, async () => {
        await withCliRuntime(sources.test, { mode: 'test' }, async (runtime) => {
            expectEqual(runtime.metadata.tests.length, 2);
            for (let ordinal = 0; ordinal < runtime.metadata.tests.length; ordinal += 1) {
                const result = await executeRuntimeTest(runtime, ordinal);
                if (!result.passed) {
                    throw new Error(`Expected ${result.name} to pass, received ${result.error}`);
                }
            }
        });
    }],
    ['compile-bench cycle', 15, async () => {
        await withCliRuntime(sources.bench, { mode: 'bench' }, async (runtime) => {
            expectEqual(runtime.metadata.benches.length, 1);
            const result = await executeFixedRuntimeBenchmark(runtime, 0, {
                iterations: 16,
                samples: 1,
                warmup: 0,
            });
            if (!Number.isFinite(result.meanMs) || result.meanMs < 0) {
                throw new Error(`Expected a finite benchmark mean, received ${result.meanMs}`);
            }
        });
    }],
];

let failed = false;

for (const [name, iterations, run] of cases) {
    try {
        for (let iteration = 0; iteration < iterations; iteration += 1) {
            await run();
        }
        console.log(`PASS ${name} (${iterations} iterations)`);
    }
    catch (error) {
        failed = true;
        console.log(`FAIL ${name}`);
        console.log(`  ${String(error instanceof Error ? error.message : error)}`);
    }
}

if (failed) {
    process.exit(1);
}

async function withCliRuntime(source, { mode }, run) {
    return withRuntime(loadCompiledRuntime({
        source,
        mode,
        compileSource: (input, options = {}) => compileUtuSource(input, options),
        loadModule: (js) => loadNodeModuleFromSource(js, `utu-stress-${mode}-`),
        createImports: () => createCliImportProvider({ prompt: () => '', writeLine: () => {} }),
    }), run);
}

function expectEqual(actual, expected) {
    if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
    }
}

function expectDeepEqual(actual, expected) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
        throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
    }
}
