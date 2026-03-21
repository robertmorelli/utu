import * as vscode from 'vscode';
import { formatError } from './compilerHost.js';
import { DEFAULT_BENCHMARK_OPTIONS } from './benchmarking.js';
import { getRunMainBlockerMessage } from './runMainSupport.js';
import { normalizeCompileArtifact } from '../../shared/compilerArtifacts.mjs';
import { executeFixedRuntimeBenchmark, executeFixedRuntimeBenchmarks, executeRuntimeTest, executeRuntimeTests, loadCompiledRuntime, withRuntime, } from '../../shared/compiledRuntime.mjs';
import { createWebImportProvider } from '../../shared/hostImports.mjs';
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
        return withRuntime(this.loadRuntime(source, 'program'), async (runtime) => {
            const execution = await runtime.invoke('main', [], 'The program does not export a callable main function');
            if (execution.error) {
                throw execution.error;
            }
            return {
                logs: execution.logs,
                result: execution.result,
            };
        });
    }
    async runTest(source, ordinal) {
        return withRuntime(this.loadRuntime(source, 'test'), (runtime) => executeRuntimeTest(runtime, ordinal, { formatError }));
    }
    async runTests(source) {
        return withRuntime(this.loadRuntime(source, 'test'), (runtime) => executeRuntimeTests(runtime, { formatError }));
    }
    async runBenchmark(source, ordinal, options = {}) {
        return withRuntime(this.loadRuntime(source, 'bench'), (runtime) => executeFixedRuntimeBenchmark(runtime, ordinal, { ...DEFAULT_BENCHMARK_OPTIONS, ...options }));
    }
    async runBenchmarks(source, options = {}) {
        return withRuntime(this.loadRuntime(source, 'bench'), (runtime) => executeFixedRuntimeBenchmarks(runtime, { ...DEFAULT_BENCHMARK_OPTIONS, ...options }));
    }
    async compileWithMode(source, mode, options = {}) {
        return this.compileSource(source, { ...options, mode });
    }
    async compileSource(source, { mode = 'program', ...options } = {}) {
        const compiler = await this.getCompiler();
        return normalizeCompileArtifact(await compiler.compile(source, {
            ...options,
            mode,
            runtimeWasmUrl: this.options.runtimeWasmPath,
            wasmUrl: this.options.grammarWasmPath,
        }));
    }
    async loadRuntime(source, mode) {
        return loadCompiledRuntime({
            source,
            mode,
            compileSource: (input, options = {}) => this.compileSource(input, options),
            loadModule: (js) => importModule(js),
            createImports: () => createWebImportProvider(),
        });
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
