import * as vscode from 'vscode';
import { UtuLanguageService } from '../../lsp/src/core/languageService';
import { UtuParserService } from '../../lsp/src/core/parser';
import { registerCommands } from './commands';
import type { CompilerHost } from './compilerHost';
import { DiagnosticsController } from './diagnostics';
import { GeneratedDocumentStore } from './generatedDocuments';
import { UtuDocumentSymbolProvider } from './documentSymbols';
import { registerLanguageProviders } from './languageProviders';

interface ActivateOptions {
  compilerHost: CompilerHost;
  grammarWasmPath: string;
  parserRuntimeWasmPath: string;
  showCompileStatusBar?: boolean;
}

export function activateUtuExtension(
  context: vscode.ExtensionContext,
  options: ActivateOptions,
): void {
  const output = vscode.window.createOutputChannel('UTU');
  const generatedDocuments = new GeneratedDocumentStore();
  const parserService = new UtuParserService({
    grammarWasmPath: options.grammarWasmPath,
    runtimeWasmPath: options.parserRuntimeWasmPath,
  });
  const languageService = new UtuLanguageService(parserService);
  const diagnostics = new DiagnosticsController(languageService, output);
  const statusBarItem = options.showCompileStatusBar === false ? undefined : createCompileStatusBarItem();

  context.subscriptions.push(
    output,
    generatedDocuments,
    parserService,
    diagnostics,
    { dispose: () => languageService.dispose() },
    vscode.workspace.onDidChangeTextDocument((event) => {
      languageService.invalidate(event.document.uri.toString());
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      languageService.invalidate(document.uri.toString());
    }),
    vscode.workspace.registerTextDocumentContentProvider('utu-generated', generatedDocuments),
    vscode.languages.registerDocumentSymbolProvider({ language: 'utu' }, new UtuDocumentSymbolProvider(languageService)),
  );

  if (statusBarItem) {
    context.subscriptions.push(
      statusBarItem,
      vscode.window.onDidChangeActiveTextEditor((editor) => updateStatusBarItem(statusBarItem, editor)),
    );
    updateStatusBarItem(statusBarItem, vscode.window.activeTextEditor);
  }

  registerLanguageProviders(context, languageService);
  registerCommands(context, {
    output,
    compilerHost: options.compilerHost,
    parserService,
    generatedDocuments,
  });
}

function createCompileStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.name = 'UTU Compile';
  item.text = '$(play) UTU Compile';
  item.tooltip = 'Compile the active UTU file';
  item.command = 'utu.compileCurrentFile';
  return item;
}

function updateStatusBarItem(
  item: vscode.StatusBarItem | undefined,
  editor: vscode.TextEditor | undefined,
): void {
  if (!item) return;

  if (editor?.document.languageId === 'utu') {
    item.show();
  } else {
    item.hide();
  }
}
