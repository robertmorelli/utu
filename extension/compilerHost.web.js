import * as vscode from 'vscode';
import { DEFAULT_BENCHMARK_OPTIONS, executeRuntimeBenchmark, executeRuntimeTest, loadCompiledRuntime, withRuntime, } from '../loadCompiledRuntime.mjs';

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
        return undefined;
    }
    async runMain(source) {
        return withRuntime(this.loadRuntime(source, 'program'), async (runtime) => {
            return runtime.invoke('main', []);
        });
    }
    async runTest(source, ordinal) {
        const targetName = await getNamedTarget(source, (input) => this.getMetadata(input), 'test', ordinal);
        return withRuntime(this.loadRuntime(source, 'test', { targetName }), (runtime) => executeRuntimeTest(runtime, 0));
    }
    async runBenchmark(source, ordinal, options = {}) {
        const targetName = await getNamedTarget(source, (input) => this.getMetadata(input), 'bench', ordinal);
        return withRuntime(this.loadRuntime(source, 'bench', { targetName }), (runtime) => executeRuntimeBenchmark(runtime, 0, { ...DEFAULT_BENCHMARK_OPTIONS, ...options }));
    }
    async compileSource(source, { mode = 'program', ...options } = {}) {
        const compiler = await this.getCompiler();
        const value = await compiler.compile(source, {
            ...options,
            mode,
            wasmUrl: this.options.grammarWasmPath,
            runtimeWasmUrl: this.options.runtimeWasmPath,
        });
        return {
            ...value,
            js: value.js ?? value.shim,
            shim: value.shim ?? value.js,
            wasm: value.wasm instanceof Uint8Array ? value.wasm : new Uint8Array(value.wasm),
            metadata: value.metadata ?? {},
        };
    }
    loadRuntime(source, mode, compileOptions = {}, prepareRuntime) {
        return loadCompiledRuntime({
            source,
            mode,
            compileSource: (input, options = {}) => this.compileSource(input, options),
            loadModule: (shim) => loadModuleFromSource(shim),
            prepareRuntime,
            compileOptions,
        });
    }
    async getMetadata(source) {
        const compiler = await this.getCompiler();
        return compiler.get_metadata(source, {
            wasmUrl: this.options.grammarWasmPath,
            runtimeWasmUrl: this.options.runtimeWasmPath,
        });
    }
    async getCompiler() {
        this.compilerPromise ??= this.loadCompiler();
        return this.compilerPromise;
    }
    async loadCompiler() {
        const source = await vscode.workspace.fs.readFile(vscode.Uri.parse(this.options.compilerModulePath, true));
        return loadModuleFromSource(new TextDecoder().decode(source), { preferBlobUrl: true });
    }
}

function loadModuleFromSource(source, { preferBlobUrl = false } = {}) {
    if (preferBlobUrl && typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        return import(url).finally(() => URL.revokeObjectURL(url));
    }
    return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
}

async function getNamedTarget(source, getMetadata, kind, ordinal) {
    const metadata = await getMetadata(source);
    const entries = kind === 'test' ? metadata.tests : metadata.benches;
    return entries?.[ordinal]?.name ?? null;
}
