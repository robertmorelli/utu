import * as vscode from 'vscode';
import { UtuLanguageService } from '../../lsp/src/core/languageService';
import { UtuParserService } from '../../lsp/src/core/parser';
import { registerRunCodeLensProvider } from './codeLens';
import { registerCommands } from './commands';
import type { CompilerHost, RuntimeHost } from './compilerHost';
import { DiagnosticsController } from './diagnostics';
import { GeneratedDocumentStore } from './generatedDocuments';
import { UtuDocumentSymbolProvider } from './documentSymbols';
import { registerLanguageProviders } from './languageProviders';
import { registerTesting } from './testing';

interface ActivateOptions {
  compilerHost: CompilerHost;
  runtimeHost: RuntimeHost;
  grammarWasmPath: string | Uint8Array;
  parserRuntimeWasmPath: string | Uint8Array;
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
  const scheduleMainContextRefresh = createMainContextRefresher(languageService, options.runtimeHost);
  const subscriptions: vscode.Disposable[] = [
    output,
    generatedDocuments,
    parserService,
    diagnostics,
    { dispose: () => languageService.dispose() },
    vscode.workspace.onDidChangeTextDocument((event) => {
      languageService.invalidate(event.document.uri.toString());
      if (event.document === vscode.window.activeTextEditor?.document) {
        void scheduleMainContextRefresh(event.document);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      languageService.invalidate(document.uri.toString());
      if (document === vscode.window.activeTextEditor?.document) {
        void vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', false);
      }
    }),
    vscode.workspace.registerTextDocumentContentProvider('utu-generated', generatedDocuments),
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'utu' },
      new UtuDocumentSymbolProvider(languageService),
    ),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updateStatusBarItem(statusBarItem, editor);
      void scheduleMainContextRefresh(editor?.document);
    }),
  ];

  if (statusBarItem !== undefined) {
    subscriptions.push(
      statusBarItem,
    );
    updateStatusBarItem(statusBarItem, vscode.window.activeTextEditor);
  }

  subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document === vscode.window.activeTextEditor?.document) {
        void scheduleMainContextRefresh(document);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document === vscode.window.activeTextEditor?.document) {
        void scheduleMainContextRefresh(document);
      }
    }),
  );

  context.subscriptions.push(...subscriptions);
  registerLanguageProviders(context, languageService);
  registerRunCodeLensProvider(context, languageService);
  registerTesting(context, {
    languageService,
    output,
    runtimeHost: options.runtimeHost,
  });
  registerCommands(context, {
    output,
    compilerHost: options.compilerHost,
    languageService,
    parserService,
    generatedDocuments,
    runtimeHost: options.runtimeHost,
  });
  void scheduleMainContextRefresh(vscode.window.activeTextEditor?.document);
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
  editor?.document.languageId === 'utu' ? item.show() : item.hide();
}

function createMainContextRefresher(
  languageService: UtuLanguageService,
  runtimeHost: RuntimeHost,
) {
  let refreshVersion = 0;

  return async (document: vscode.TextDocument | undefined) => {
    const currentVersion = ++refreshVersion;

    if (document?.languageId !== 'utu') {
      await vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', false);
      return;
    }

    try {
      const index = await languageService.getDocumentIndex(document);
      if (currentVersion !== refreshVersion) return;

      const hasRunnableMain = index.topLevelSymbols.some(
        (symbol) => symbol.kind === 'function' && symbol.exported && symbol.name === 'main',
      );
      if (!hasRunnableMain) {
        await vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', false);
        return;
      }

      const blocker = await runtimeHost.getRunMainBlocker?.(document.getText());
      if (currentVersion !== refreshVersion) return;

      await vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', !blocker);
    } catch {
      if (currentVersion !== refreshVersion) return;
      await vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', false);
    }
  };
}
