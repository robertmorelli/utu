import * as vscode from 'vscode';
import { UtuParserService } from '../../lsp/src/core/parser';
import { formatError, type CompilerHost } from './compilerHost';
import { GeneratedDocumentStore, type GeneratedDocumentKind } from './generatedDocuments';

interface CommandDependencies {
  output: vscode.OutputChannel;
  compilerHost: CompilerHost;
  parserService: UtuParserService;
  generatedDocuments: GeneratedDocumentStore;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  dependencies: CommandDependencies,
): void {
  const register = (command: string, callback: () => Promise<void>) => {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));
  };

  register('utu.compileCurrentFile', async () => {
    const document = getActiveUtuDocument();
    if (!document) return;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Compiling ${document.fileName.split(/[\\/]/).pop() ?? 'UTU file'}`,
      },
      async () => {
        try {
          const result = await dependencies.compilerHost.compile(document.getText(), {
            optimize: getOptimizeSetting(),
          });

          dependencies.output.appendLine(
            `[utu] Compiled ${document.uri.fsPath || document.uri.toString()} (${result.js.length} JS chars, ${result.wasm.byteLength} wasm bytes)`,
          );

          vscode.window.setStatusBarMessage(
            `UTU compiled ${document.fileName.split(/[\\/]/).pop() ?? 'file'}`,
            3000,
          );
        } catch (error) {
          await revealError(
            dependencies.output,
            `Compile failed for ${document.uri.fsPath || document.uri.toString()}`,
            error,
          );
        }
      },
    );
  });

  register('utu.showGeneratedJavaScript', async () => {
    const document = getActiveUtuDocument();
    if (!document) return;

    try {
      const result = await dependencies.compilerHost.compile(document.getText(), {
        optimize: getOptimizeSetting(),
      });

      await revealGeneratedDocument(dependencies.generatedDocuments, 'js', document.uri, result.js);
    } catch (error) {
      await revealError(dependencies.output, 'Unable to generate JavaScript output', error);
    }
  });

  register('utu.showGeneratedWat', async () => {
    const document = getActiveUtuDocument();
    if (!document) return;

    try {
      const result = await dependencies.compilerHost.compile(document.getText(), {
        optimize: getOptimizeSetting(),
        wat: true,
      });

      await revealGeneratedDocument(
        dependencies.generatedDocuments,
        'wat',
        document.uri,
        result.wat ?? '; compiler did not return WAT output',
      );
    } catch (error) {
      await revealError(dependencies.output, 'Unable to generate WAT output', error);
    }
  });

  register('utu.showSyntaxTree', async () => {
    const document = getActiveUtuDocument();
    if (!document) return;

    try {
      const syntaxTree = await dependencies.parserService.getTreeString(document.getText());
      await revealGeneratedDocument(dependencies.generatedDocuments, 'tree', document.uri, syntaxTree);
    } catch (error) {
      await revealError(dependencies.output, 'Unable to generate syntax tree', error);
    }
  });
}

function getActiveUtuDocument(): vscode.TextDocument | undefined {
  const document = vscode.window.activeTextEditor?.document;

  if (document?.languageId === 'utu') {
    return document;
  }

  void vscode.window.showWarningMessage('Open a .utu file to use UTU commands.');
  return undefined;
}

async function revealGeneratedDocument(
  generatedDocuments: GeneratedDocumentStore,
  kind: GeneratedDocumentKind,
  sourceUri: vscode.Uri,
  content: string,
): Promise<void> {
  const uri = generatedDocuments.upsert(kind, sourceUri, content);
  const document = await vscode.workspace.openTextDocument(uri);
  const targetLanguage = generatedDocuments.languageIdFor(kind);

  if (document.languageId !== targetLanguage) {
    await vscode.languages.setTextDocumentLanguage(document, targetLanguage);
  }

  await vscode.window.showTextDocument(document, {
    preview: false,
    viewColumn: vscode.ViewColumn.Beside,
  });
}

async function revealError(
  output: vscode.OutputChannel,
  context: string,
  error: unknown,
): Promise<void> {
  output.appendLine(`[utu] ${context}`);
  output.appendLine(formatError(error));
  output.show(true);
  await vscode.window.showErrorMessage(`${context}. Check the UTU output channel for details.`);
}

function getOptimizeSetting(): boolean {
  return vscode.workspace.getConfiguration('utu').get<boolean>('compiler.optimize', true);
}
