import * as vscode from 'vscode';
import { activateUtuExtension } from './activate';
import { WebCompilerHost } from './compilerHost.web';

export function activate(context: vscode.ExtensionContext): void {
  activateUtuExtension(context, {
    compilerHost: new WebCompilerHost(),
    grammarWasmPath: vscode.Uri.joinPath(context.extensionUri, 'tree-sitter-utu.wasm').toString(true),
    parserRuntimeWasmPath: vscode.Uri.joinPath(context.extensionUri, 'web-tree-sitter.wasm').toString(true),
    showCompileStatusBar: false,
  });
}

export function deactivate(): void {}
