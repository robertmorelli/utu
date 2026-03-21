import * as vscode from 'vscode';
import { activateUtuExtension } from './activate.js';
import { WebCompilerHost } from './compilerHost.web.js';
export async function activate(context) {
    const grammarWasmPath = await loadExtensionAssetBytes(vscode.Uri.joinPath(context.extensionUri, 'tree-sitter-utu.wasm'));
    const parserRuntimeWasmPath = await loadExtensionAssetBytes(vscode.Uri.joinPath(context.extensionUri, 'web-tree-sitter.wasm'));
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
async function loadExtensionAssetBytes(uri) {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new Uint8Array(bytes);
}
