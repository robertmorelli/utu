import * as vscode from 'vscode';
import { activateUtuExtension } from './activate';
import { WebCompilerHost } from './compilerHost.web';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const grammarWasmPath = await loadExtensionAssetBytes(
    vscode.Uri.joinPath(context.extensionUri, 'tree-sitter-utu.wasm'),
  );
  const parserRuntimeWasmPath = await loadExtensionAssetBytes(
    vscode.Uri.joinPath(context.extensionUri, 'web-tree-sitter.wasm'),
  );
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

export function deactivate(): void {}

async function loadExtensionAssetBytes(
  uri: vscode.Uri,
): Promise<Uint8Array> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer);
}
