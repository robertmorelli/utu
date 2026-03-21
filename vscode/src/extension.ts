import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { RepoCompilerHost } from './compilerHost';
import { DiagnosticsController } from './diagnostics';
import { GeneratedDocumentStore } from './generatedDocuments';
import { UtuDocumentSymbolProvider } from './documentSymbols';
import { registerLanguageProviders } from './languageProviders';
import { UtuLanguageModel } from './languageModel';
import { UtuParserService } from './parserService';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('UTU');
  const generatedDocuments = new GeneratedDocumentStore();
  const parserService = new UtuParserService(context.extensionUri);
  const languageModel = new UtuLanguageModel(parserService);
  const compilerHost = new RepoCompilerHost(context.extensionUri);
  const diagnostics = new DiagnosticsController(parserService, output);
  const statusBarItem = createCompileStatusBarItem();

  context.subscriptions.push(
    output,
    generatedDocuments,
    parserService,
    languageModel,
    diagnostics,
    statusBarItem,
    vscode.workspace.registerTextDocumentContentProvider('utu-generated', generatedDocuments),
    vscode.languages.registerDocumentSymbolProvider({ language: 'utu' }, new UtuDocumentSymbolProvider()),
    vscode.window.onDidChangeActiveTextEditor((editor) => updateStatusBarItem(statusBarItem, editor)),
  );

  updateStatusBarItem(statusBarItem, vscode.window.activeTextEditor);
  registerLanguageProviders(context, languageModel);
  registerCommands(context, {
    output,
    compilerHost,
    parserService,
    generatedDocuments,
  });
}

export function deactivate(): void {}

function createCompileStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.name = 'UTU Compile';
  item.text = '$(play) UTU Compile';
  item.tooltip = 'Compile the active UTU file';
  item.command = 'utu.compileCurrentFile';
  return item;
}

function updateStatusBarItem(
  item: vscode.StatusBarItem,
  editor: vscode.TextEditor | undefined,
): void {
  if (editor?.document.languageId === 'utu') {
    item.show();
  } else {
    item.hide();
  }
}
