import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import grammarWasmPath from '../tree-sitter-utu.wasm' with { type: 'file' };
import runtimeWasmPath from 'web-tree-sitter/web-tree-sitter.wasm' with { type: 'file' };

import * as compiler from '../index.js';
import { executeRuntimeBenchmark, executeRuntimeTest, loadCompiledRuntime, withRuntime } from '../loadCompiledRuntime.mjs';
import { loadNodeModuleFromSource } from '../loadNodeModuleFromSource.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const compilerAssetOptions = { wasmUrl: grammarWasmPath, runtimeWasmUrl: runtimeWasmPath };
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
            const result = await executeRuntimeBenchmark(runtime, 0, {
                seconds: 0.001,
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
    compileSource,
    loadModule: (shim) => loadNodeModuleFromSource(shim, { prefix: `utu-stress-${mode}-` }),
  }), run);
}

async function compileSource(source, { wat = false, mode = 'program', where = 'base64', moduleFormat = 'esm', targetName = null } = {}) {
    await compiler.init(compilerAssetOptions);
    const value = await compiler.compile(source, {
        wat,
        mode,
        where,
        moduleFormat,
        targetName,
        ...compilerAssetOptions,
    });
    return {
        ...value,
        js: value.js ?? value.shim,
        shim: value.shim ?? value.js,
        wasm: value.wasm instanceof Uint8Array ? value.wasm : new Uint8Array(value.wasm),
        metadata: value.metadata ?? {},
    };
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
