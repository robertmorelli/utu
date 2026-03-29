import * as vscode from 'vscode';
import { DEFAULT_GRAMMAR_WASM, DEFAULT_RUNTIME_WASM } from '../../document/default-wasm.js';
import { activateUtuExtension } from './activate.js';
import { DEFAULT_BENCHMARK_OPTIONS, executeRuntimeBenchmark, executeRuntimeTest, loadCompiledRuntime, loadModuleFromSource, normalizeCompileArtifact, withRuntime } from '../../runtime/index.js';

export async function activate(context) {
    const grammarWasmPath = DEFAULT_GRAMMAR_WASM;
    const parserRuntimeWasmPath = DEFAULT_RUNTIME_WASM;
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

function decodeUtf8(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
}

function stripSourceMapComment(source) {
    return source.replace(/\n\/\/# sourceMappingURL=.*$/u, '');
}

class WebCompilerHost {
    options;
    compilerPromise;
    constructor(options) { this.options = options; }
    async compile(source, options = {}) { return this.compileSource(source, options); }
    async getRunMainBlocker(source, options = {}) { return undefined; }
    async runMain(source, options = {}) { return withRuntime(this.loadRuntime(source, 'program', options), async (runtime) => runtime.invoke('main', [])); }
    async runTest(source, ordinal, options = {}) {
        const targetName = await getNamedTarget(source, (input) => this.getMetadata(input, options), 'test', ordinal);
        return withRuntime(this.loadRuntime(source, 'test', { ...options, targetName }), (runtime) => executeRuntimeTest(runtime, 0));
    }
    async runBenchmark(source, ordinal, options = {}) {
        const targetName = await getNamedTarget(source, (input) => this.getMetadata(input, options), 'bench', ordinal);
        return withRuntime(this.loadRuntime(source, 'bench', { ...options, targetName }), (runtime) => executeRuntimeBenchmark(runtime, 0, { ...DEFAULT_BENCHMARK_OPTIONS, ...options }));
    }
    async compileSource(source, { mode = 'program', ...options } = {}) {
        const compiler = await this.getCompiler();
        return normalizeCompileArtifact(await compiler.compile(source, { ...this.getCompilerOptions(), ...options, mode }));
    }
    loadRuntime(source, mode, compileOptions = {}, prepareRuntime) { return loadCompiledRuntime({ source, mode, compileSource: (input, options = {}) => this.compileSource(input, options), loadModule: loadModuleFromSource, prepareRuntime, compileOptions }); }
    async getMetadata(source, options = {}) { return (await this.getCompiler()).get_metadata(source, { ...this.getCompilerOptions(), ...options }); }
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
            loadImport: (fromUri, specifier) => this.loadImport(fromUri, specifier),
        };
    }
    async loadImport(fromUri, specifier) {
        const target = vscode.Uri.parse(new URL(specifier, fromUri ?? vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? this.options.compilerModuleUri.toString()).href, true);
        return {
            uri: target.toString(),
            source: decodeUtf8(await vscode.workspace.fs.readFile(target)),
        };
    }
}
async function getNamedTarget(source, getMetadata, kind, ordinal) {
    const metadata = await getMetadata(source);
    return (kind === 'test' ? metadata.tests : metadata.benches)?.[ordinal]?.name ?? null;
}
