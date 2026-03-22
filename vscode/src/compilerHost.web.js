import * as vscode from 'vscode';
import { formatError } from './compilerHost.js';
import { DEFAULT_BENCHMARK_OPTIONS } from './benchmarking.js';
import { getRunMainBlockerMessage } from './runMainSupport.js';
import { normalizeCompileArtifact } from '../../shared/compilerArtifacts.mjs';
import { executeFixedRuntimeBenchmarks, executeRuntimeTest, executeRuntimeTests, loadCompiledRuntime, selectMetadataEntry, withRuntime, } from '../../shared/compiledRuntime.mjs';
import { createWebImportProvider } from '../../shared/hostImports.mjs';
import { loadWebModuleFromSource } from '../../shared/moduleLoaders.web.mjs';

export class WebCompilerHost {
    options;
    compilerPromise;
    constructor(options) {
        this.options = options;
    }
    async compile(source, options = {}) {
        return this.compileSource(source, options);
    }
    async getRunMainBlocker(source) {
        return getRunMainBlockerMessage(source);
    }
    async runMain(source) {
        return withRuntime(this.loadRuntime(source, 'program'), async (runtime) => {
            const execution = await runtime.invoke('main', [], 'The program does not export a callable main function');
            if (execution.error) throw execution.error;
            return execution;
        });
    }
    async runTest(source, ordinal) {
        return withRuntime(this.loadRuntime(source, 'test'), (runtime) => executeRuntimeTest(runtime, ordinal, { formatError }));
    }
    async runTests(source) {
        return withRuntime(this.loadRuntime(source, 'test'), (runtime) => executeRuntimeTests(runtime, { formatError }));
    }
    async runBenchmark(source, ordinal, options = {}) {
        const profile = createProfileImportProvider();
        const settings = { ...DEFAULT_BENCHMARK_OPTIONS, ...options };
        return withRuntime(this.loadRuntime(source, 'bench', { profile: 'ticks' }, () => profile), async (runtime) => {
            const bench = selectMetadataEntry(runtime.metadata.benches, ordinal, 'benchmarks');
            const profileCounts = [];
            const runs = [];
            for (let i = 0; i < settings.warmup + settings.samples; i += 1) {
                profile.resetProfile();
                const start = performance.now();
                const sample = await runtime.invoke(bench.exportName, [settings.iterations], `Missing benchmark export "${bench.exportName}"`);
                if (sample.error) throw sample.error;
                if (i >= settings.warmup) {
                    runs.push({ durationMs: performance.now() - start, logs: sample.logs });
                    mergeCounts(profileCounts, profile.getProfile());
                }
            }
            const durations = runs.map(({ durationMs }) => durationMs);
            const durationMs = durations.reduce((sum, value) => sum + value, 0);
            const meanMs = durationMs / durations.length;
            return {
                name: bench.name,
                exportName: bench.exportName,
                durationMs,
                logs: runs.at(-1)?.logs ?? [],
                maxMs: Math.max(...durations),
                meanMs,
                minMs: Math.min(...durations),
                perIterationMs: meanMs / settings.iterations,
                profileCounts,
            };
        });
    }
    async runBenchmarks(source, options = {}) {
        return withRuntime(this.loadRuntime(source, 'bench'), (runtime) => executeFixedRuntimeBenchmarks(runtime, { ...DEFAULT_BENCHMARK_OPTIONS, ...options }));
    }
    async compileSource(source, { mode = 'program', ...options } = {}) {
        const compiler = await this.getCompiler();
        return normalizeCompileArtifact(await compiler.compile(source, {
            ...options,
            mode,
            wasmUrl: this.options.grammarWasmPath,
            runtimeWasmUrl: this.options.runtimeWasmPath,
        }));
    }
    loadRuntime(source, mode, compileOptions = {}, createImports = () => createWebImportProvider()) {
        return loadCompiledRuntime({
            source,
            mode,
            compileSource: (input, options = {}) => this.compileSource(input, options),
            loadModule: (shim) => loadWebModuleFromSource(shim, { formatError }),
            createImports,
            compileOptions,
        });
    }
    async getCompiler() {
        this.compilerPromise ??= this.loadCompiler();
        return this.compilerPromise;
    }
    async loadCompiler() {
        const source = await vscode.workspace.fs.readFile(vscode.Uri.parse(this.options.compilerModulePath, true));
        return loadWebModuleFromSource(new TextDecoder().decode(source), { formatError });
    }
}

function createProfileImportProvider() {
    const provider = createWebImportProvider();
    const counts = [];
    provider.imports.__utu_profile = {
        tick(fid) {
            counts[fid] = (counts[fid] ?? 0) + 1;
        },
    };
    return {
        ...provider,
        resetProfile() {
            counts.length = 0;
        },
        getProfile() {
            return [...counts];
        },
    };
}

function mergeCounts(target, values) {
    for (let i = 0; i < values.length; i += 1) target[i] = (target[i] ?? 0) + (values[i] ?? 0);
}
