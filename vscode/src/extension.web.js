import * as vscode from 'vscode';
import { activateUtuExtension } from './activate.js';
import { WebCompilerHost } from './compilerHost.web.js';
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
