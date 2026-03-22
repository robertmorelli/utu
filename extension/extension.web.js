import * as vscode from 'vscode';
import { activateUtuExtension } from './activate.js';
import { DEFAULT_BENCHMARK_OPTIONS, executeRuntimeBenchmark, executeRuntimeTest, loadCompiledRuntime, withRuntime } from '../loadCompiledRuntime.mjs';
import grammarWasmPath from '../tree-sitter-utu.wasm';
import parserRuntimeWasmPath from '../web-tree-sitter.wasm';

export async function activate(context) {
    const runtimeHost = new WebCompilerHost({
        compilerModulePath: vscode.Uri.joinPath(context.extensionUri, 'dist', 'compiler.web.mjs').toString(true),
        grammarWasmPath,
        runtimeWasmPath: parserRuntimeWasmPath,
    });
    activateUtuExtension(context, {
        compilerHost: runtimeHost,
        runtimeHost,
        grammarWasmPath,
        parserRuntimeWasmPath,
        showCompileStatusBar: false,
    });
}
export function deactivate() { }
class WebCompilerHost {
    options;
    compilerPromise;
    constructor(options) { this.options = options; }
    async compile(source, options = {}) { return this.compileSource(source, options); }
    async getRunMainBlocker(source) { return undefined; }
    async runMain(source) { return withRuntime(this.loadRuntime(source, 'program'), async (runtime) => runtime.invoke('main', [])); }
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
        const compiled = await compiler.compile(source, { ...options, mode, wasmUrl: this.options.grammarWasmPath, runtimeWasmUrl: this.options.runtimeWasmPath });
        return { ...compiled, js: compiled.js ?? compiled.shim, shim: compiled.shim ?? compiled.js, wasm: compiled.wasm instanceof Uint8Array ? compiled.wasm : new Uint8Array(compiled.wasm), metadata: compiled.metadata ?? {} };
    }
    loadRuntime(source, mode, compileOptions = {}, prepareRuntime) { return loadCompiledRuntime({ source, mode, compileSource: (input, options = {}) => this.compileSource(input, options), loadModule: loadModuleFromSource, prepareRuntime, compileOptions }); }
    async getMetadata(source) { return (await this.getCompiler()).get_metadata(source, { wasmUrl: this.options.grammarWasmPath, runtimeWasmUrl: this.options.runtimeWasmPath }); }
    async getCompiler() { return (this.compilerPromise ??= this.loadCompiler()); }
    async loadCompiler() { return loadModuleFromSource(new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.parse(this.options.compilerModulePath, true))), { preferBlobUrl: true }); }
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
    return (kind === 'test' ? metadata.tests : metadata.benches)?.[ordinal]?.name ?? null;
}
