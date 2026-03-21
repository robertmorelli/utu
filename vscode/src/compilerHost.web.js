import * as vscode from 'vscode';
import { formatError } from './compilerHost.js';
import { getRunMainBlockerMessage } from './runMainSupport.js';
import { createDefaultHostImports } from './webHostImports.js';
const DEFAULT_BENCHMARK_OPTIONS = {
    iterations: 1000,
    samples: 10,
    warmup: 2,
};
export class WebCompilerHost {
    options;
    compilerPromise;
    constructor(options) {
        this.options = options;
    }
    async compile(source, options = {}) {
        return this.compileWithMode(source, 'program', options);
    }
    async getRunMainBlocker(source) {
        return getRunMainBlockerMessage(source);
    }
    async runMain(source) {
        const runtime = await this.loadRuntime(source, 'program');
        const execution = await runtime.invoke('main');
        if (execution.error) {
            throw execution.error;
        }
        return {
            logs: execution.logs,
            result: execution.result,
        };
    }
    async runTest(source, ordinal) {
        const runtime = await this.loadRuntime(source, 'test');
        return executeTest(runtime, ordinal);
    }
    async runTests(source) {
        const runtime = await this.loadRuntime(source, 'test');
        return Promise.all(runtime.metadata.tests.map((_, ordinal) => executeTest(runtime, ordinal)));
    }
    async runBenchmark(source, ordinal, options = {}) {
        const runtime = await this.loadRuntime(source, 'bench');
        return executeBenchmark(runtime, ordinal, { ...DEFAULT_BENCHMARK_OPTIONS, ...options });
    }
    async runBenchmarks(source, options = {}) {
        const runtime = await this.loadRuntime(source, 'bench');
        const settings = { ...DEFAULT_BENCHMARK_OPTIONS, ...options };
        return Promise.all(runtime.metadata.benches.map((_, ordinal) => executeBenchmark(runtime, ordinal, settings)));
    }
    async compileWithMode(source, mode, options = {}) {
        const compiler = await this.getCompiler();
        const result = await compiler.compile(source, {
            ...options,
            mode,
            runtimeWasmUrl: this.options.runtimeWasmPath,
            wasmUrl: this.options.grammarWasmPath,
        });
        return {
            js: result.js,
            wat: result.wat,
            wasm: toUint8Array(result.wasm),
            metadata: normalizeMetadata(result.metadata),
        };
    }
    async loadRuntime(source, mode) {
        const artifact = await this.compileWithMode(source, mode);
        const module = await importGeneratedModule(artifact.js);
        let logSink = [];
        const exports = await module.instantiate(createDefaultHostImports((line) => {
            logSink.push(line);
        }));
        return {
            metadata: artifact.metadata,
            async invoke(exportName, args = []) {
                const fn = getExport(exports, exportName);
                logSink = [];
                const start = performance.now();
                try {
                    const result = await fn(...args);
                    return {
                        durationMs: performance.now() - start,
                        logs: [...logSink],
                        result,
                    };
                }
                catch (error) {
                    return {
                        durationMs: performance.now() - start,
                        error,
                        logs: [...logSink],
                    };
                }
            },
        };
    }
    async getCompiler() {
        this.compilerPromise ??= this.loadCompiler();
        return this.compilerPromise;
    }
    async loadCompiler() {
        const source = await vscode.workspace.fs.readFile(vscode.Uri.parse(this.options.compilerModulePath, true));
        return importModule(new TextDecoder().decode(source));
    }
}
async function importGeneratedModule(source) {
    return importModule(source);
}
async function importModule(source) {
    const errors = [];
    const strategies = source.length > 1_000_000
        ? [() => importBlobModule(source), () => importDataModule(source)]
        : [() => importDataModule(source), () => importBlobModule(source)];
    try {
        for (const strategy of strategies) {
            try {
                return await strategy();
            }
            catch (error) {
                errors.push(formatError(error));
            }
        }
    }
    catch {
        // Unreachable, kept so TS preserves the structured control flow.
    }
    throw new Error(`Failed to import generated module.\n${errors.map((error, index) => `Attempt ${index + 1}: ${error}`).join('\n')}`);
}
function getExport(exports, exportName) {
    const value = exports[exportName];
    if (typeof value !== 'function') {
        throw new Error(`Missing export "${exportName}".`);
    }
    return (...args) => value(...args);
}
async function executeTest(runtime, ordinal) {
    const test = selectMetadataEntry(runtime.metadata.tests, ordinal, 'tests');
    const execution = await runtime.invoke(test.exportName, []);
    return {
        name: test.name,
        exportName: test.exportName,
        durationMs: execution.durationMs,
        error: execution.error ? formatError(execution.error) : undefined,
        logs: execution.logs,
        passed: execution.error === undefined,
    };
}
async function executeBenchmark(runtime, ordinal, options) {
    const bench = selectMetadataEntry(runtime.metadata.benches, ordinal, 'benchmarks');
    for (let warmupIndex = 0; warmupIndex < options.warmup; warmupIndex += 1) {
        const warmup = await runtime.invoke(bench.exportName, [options.iterations]);
        if (warmup.error)
            throw warmup.error;
    }
    const durations = [];
    let logs = [];
    for (let sampleIndex = 0; sampleIndex < options.samples; sampleIndex += 1) {
        const sample = await runtime.invoke(bench.exportName, [options.iterations]);
        if (sample.error)
            throw sample.error;
        durations.push(sample.durationMs);
        logs = sample.logs;
    }
    const durationMs = durations.reduce((sum, value) => sum + value, 0);
    const meanMs = durationMs / durations.length;
    return {
        name: bench.name,
        exportName: bench.exportName,
        durationMs,
        logs,
        maxMs: Math.max(...durations),
        meanMs,
        minMs: Math.min(...durations),
        perIterationMs: meanMs / options.iterations,
    };
}
function normalizeMetadata(metadata) {
    return {
        tests: metadata?.tests ?? [],
        benches: metadata?.benches ?? [],
    };
}
function selectMetadataEntry(entries, ordinal, label) {
    if (!entries.length) {
        throw new Error(`No ${label} found.`);
    }
    const entry = entries[ordinal];
    if (!entry) {
        throw new Error(`Missing ${label.slice(0, -1)} #${ordinal + 1}.`);
    }
    return entry;
}
function toUint8Array(value) {
    return value instanceof Uint8Array ? value : new Uint8Array(value);
}
async function importBlobModule(source) {
    const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
        return (await import(moduleUrl));
    }
    finally {
        URL.revokeObjectURL(moduleUrl);
    }
}
async function importDataModule(source) {
    return (await import(`data:text/javascript;base64,${base64Encode(source)}`));
}
function base64Encode(source) {
    return base64EncodeBytes(new TextEncoder().encode(source));
}
function base64EncodeBytes(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
}
