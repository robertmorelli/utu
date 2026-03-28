import * as vscode from 'vscode';
import { activateUtuExtension } from './activate.js';
import { DEFAULT_BENCHMARK_OPTIONS, executeRuntimeBenchmark, executeRuntimeTest, loadCompiledRuntime, loadModuleFromSource, normalizeCompileArtifact, withRuntime } from '../../runtime/index.js';

export async function activate(context) {
    const grammarWasmPath = await readExtensionBytes(context, 'tree-sitter-utu.wasm');
    const parserRuntimeWasmPath = await readExtensionBytes(context, 'web-tree-sitter.wasm');
    const runtimeHost = new WebCompilerHost({
        compilerModuleUri: vscode.Uri.joinPath(context.extensionUri, 'dist', 'compiler.web.mjs'),
        compilerAssetBaseUrl: vscode.Uri.joinPath(context.extensionUri, 'dist', 'compiler.web.mjs').toString(),
        grammarWasmPath,
        runtimeWasmPath: parserRuntimeWasmPath,
    });
    activateUtuExtension(context, {
        compilerHost: runtimeHost,
        diagnosticsCompilerHost: undefined,
        runtimeHost,
        grammarWasmPath,
        parserRuntimeWasmPath,
        showCompileStatusBar: false,
    });
}
export function deactivate() { }

async function readExtensionFile(context, ...segments) {
    return vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, ...segments));
}

function decodeUtf8(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
}

function stripSourceMapComment(source) {
    return source.replace(/\n\/\/# sourceMappingURL=.*$/u, '');
}

async function readExtensionBytes(context, ...segments) {
    const uri = vscode.Uri.joinPath(context.extensionUri, ...segments);
    try {
        return await vscode.workspace.fs.readFile(uri);
    } catch {
        const response = await fetch(uri.toString());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return new Uint8Array(await response.arrayBuffer());
    }
}

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
        return normalizeCompileArtifact(await compiler.compile(source, { ...this.getCompilerOptions(), ...options, mode }));
    }
    loadRuntime(source, mode, compileOptions = {}, prepareRuntime) { return loadCompiledRuntime({ source, mode, compileSource: (input, options = {}) => this.compileSource(input, options), loadModule: loadModuleFromSource, prepareRuntime, compileOptions }); }
    async getMetadata(source) { return (await this.getCompiler()).get_metadata(source, this.getCompilerOptions()); }
    async getCompiler() { return (this.compilerPromise ??= this.loadCompiler()); }
    async loadCompiler() {
        const source = stripSourceMapComment(decodeUtf8(await vscode.workspace.fs.readFile(this.options.compilerModuleUri)));
        return loadModuleFromSource(source, {
            assetBaseUrl: this.options.compilerAssetBaseUrl,
            identifier: 'utu-compiler-web',
        });
    }
    getCompilerOptions() {
        return {
            wasmUrl: this.options.grammarWasmPath,
            runtimeWasmUrl: this.options.runtimeWasmPath,
        };
    }
}
async function getNamedTarget(source, getMetadata, kind, ordinal) {
    const metadata = await getMetadata(source);
    return (kind === 'test' ? metadata.tests : metadata.benches)?.[ordinal]?.name ?? null;
}
