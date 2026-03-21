import * as vscode from 'vscode';
import { UtuLanguageService } from '../../lsp/src/core/languageService';
import { UtuParserService } from '../../lsp/src/core/parser';
import {
  formatError,
  type CompileOptions,
  type CompilerHost,
  type RuntimeHost,
} from './compilerHost';
import { GeneratedDocumentStore, type GeneratedDocumentKind } from './generatedDocuments';

interface CommandDependencies {
  output: vscode.OutputChannel;
  compilerHost: CompilerHost;
  languageService: UtuLanguageService;
  parserService: UtuParserService;
  generatedDocuments: GeneratedDocumentStore;
  runtimeHost: RuntimeHost;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  dependencies: CommandDependencies,
): void {
  registerCommand(context, 'utu.compileCurrentFile', () =>
    withActiveUtuDocument(async (document) => {
      const label = getDocumentLabel(document);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Compiling ${label}`,
        },
        async () => {
          try {
            const result = await compileDocument(dependencies.compilerHost, document);
            dependencies.output.appendLine(
              `[utu] Compiled ${document.uri.fsPath || document.uri.toString()} (${result.js.length} JS chars, ${result.wasm.byteLength} wasm bytes)`,
            );
            vscode.window.setStatusBarMessage(`UTU compiled ${label}`, 3000);
          } catch (error) {
            await revealError(
              dependencies.output,
              `Compile failed for ${document.uri.fsPath || document.uri.toString()}`,
              error,
            );
          }
        },
      );
    }),
  );

  registerCommand(context, 'utu.showGeneratedJavaScript', () =>
    withActiveUtuDocument(async (document) => {
      try {
        const result = await compileDocument(dependencies.compilerHost, document);
        await revealGeneratedDocument(dependencies.generatedDocuments, 'js', document.uri, result.js);
      } catch (error) {
        await revealError(dependencies.output, 'Unable to generate JavaScript output', error);
      }
    }),
  );

  registerCommand(context, 'utu.showGeneratedWat', () =>
    withActiveUtuDocument(async (document) => {
      try {
        const result = await compileDocument(dependencies.compilerHost, document, { wat: true });
        await revealGeneratedDocument(
          dependencies.generatedDocuments,
          'wat',
          document.uri,
          result.wat ?? '; compiler did not return WAT output',
        );
      } catch (error) {
        await revealError(dependencies.output, 'Unable to generate WAT output', error);
      }
    }),
  );

  registerCommand(context, 'utu.showSyntaxTree', () =>
    withActiveUtuDocument(async (document) => {
      try {
        const syntaxTree = await dependencies.parserService.getTreeString(document.getText());
        await revealGeneratedDocument(dependencies.generatedDocuments, 'tree', document.uri, syntaxTree);
      } catch (error) {
        await revealError(dependencies.output, 'Unable to generate syntax tree', error);
      }
    }),
  );

  registerCommand(context, 'utu.runMain', (uri) =>
    withUtuDocument(uri, async (document) => {
      try {
        if (!(await hasRunnableMain(dependencies.languageService, document))) {
          await vscode.window.showWarningMessage('UTU Run Main requires `export fn main()` in the active file.');
          return;
        }

        const execution = await dependencies.runtimeHost.runMain(document.getText());
        revealExecution(dependencies.output, `Ran ${getDocumentLabel(document)}`, execution.logs, execution.result);
        vscode.window.setStatusBarMessage(`UTU ran ${getDocumentLabel(document)}`, 3000);
      } catch (error) {
        await revealError(dependencies.output, 'Unable to run main', error);
      }
    }),
  );

  registerCommand(context, 'utu.runTestAt', async (uri, ordinal) => {
    const testOrdinal = typeof ordinal === 'number' ? ordinal : Number(ordinal);
    await withUtuDocument(uri, async (document) => {
      try {
        const result = await dependencies.runtimeHost.runTest(document.getText(), testOrdinal);
        revealExecution(
          dependencies.output,
          `${result.passed ? 'Passed' : 'Failed'} test "${result.name}"`,
          result.logs,
          result.error,
        );
        const label = result.passed ? `UTU passed ${result.name}` : `UTU failed ${result.name}`;
        vscode.window.setStatusBarMessage(label, 3000);
      } catch (error) {
        await revealError(dependencies.output, 'Unable to run test', error);
      }
    });
  });

  registerCommand(context, 'utu.runBenchmarkAt', async (uri, ordinal) => {
    const benchmarkOrdinal = typeof ordinal === 'number' ? ordinal : Number(ordinal);
    await withUtuDocument(uri, async (document) => {
      try {
        const result = await dependencies.runtimeHost.runBenchmark(
          document.getText(),
          benchmarkOrdinal,
          getBenchmarkSettings(),
        );
        revealExecution(
          dependencies.output,
          `Benchmarked "${result.name}"`,
          result.logs,
          `${formatMilliseconds(result.meanMs)} mean, ${formatMilliseconds(result.perIterationMs)}/iter`,
        );
        vscode.window.setStatusBarMessage(`UTU benchmarked ${result.name}`, 3000);
      } catch (error) {
        await revealError(dependencies.output, 'Unable to run benchmark', error);
      }
    });
  });
}

function registerCommand(
  context: vscode.ExtensionContext,
  command: string,
  callback: (...args: unknown[]) => Promise<void>,
): void {
  context.subscriptions.push(vscode.commands.registerCommand(command, callback));
}

async function withActiveUtuDocument(
  callback: (document: vscode.TextDocument) => Promise<void>,
): Promise<void> {
  await withUtuDocument(vscode.window.activeTextEditor?.document, callback);
}

async function withUtuDocument(
  target: vscode.Uri | vscode.TextDocument | undefined | unknown,
  callback: (document: vscode.TextDocument) => Promise<void>,
): Promise<void> {
  const document = await resolveDocument(target);

  if (document?.languageId !== 'utu') {
    await vscode.window.showWarningMessage('Open a .utu file to use UTU commands.');
    return;
  }

  await callback(document);
}

function compileDocument(
  compilerHost: CompilerHost,
  document: vscode.TextDocument,
  options: CompileOptions = {},
) {
  return compilerHost.compile(document.getText(), options);
}

function getDocumentLabel(document: vscode.TextDocument): string {
  return document.fileName.split(/[\\/]/).pop() ?? 'UTU file';
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

function revealExecution(
  output: vscode.OutputChannel,
  title: string,
  logs: string[],
  result: unknown,
): void {
  output.appendLine(`[utu] ${title}`);

  for (const line of logs) {
    output.appendLine(line);
  }

  if (result !== undefined) {
    output.appendLine(String(result));
  }

  output.show(true);
}

async function hasRunnableMain(
  languageService: UtuLanguageService,
  document: vscode.TextDocument,
): Promise<boolean> {
  const index = await languageService.getDocumentIndex(document);
  return index.topLevelSymbols.some(
    (symbol) => symbol.kind === 'function' && symbol.exported && symbol.name === 'main',
  );
}

async function resolveDocument(
  target: vscode.Uri | vscode.TextDocument | undefined | unknown,
): Promise<vscode.TextDocument | undefined> {
  if (target instanceof vscode.Uri) {
    return vscode.workspace.openTextDocument(target);
  }

  if (hasTextDocumentShape(target)) {
    return target;
  }

  return vscode.window.activeTextEditor?.document;
}

function hasTextDocumentShape(value: unknown): value is vscode.TextDocument {
  return typeof value === 'object'
    && value !== null
    && 'languageId' in value
    && 'getText' in value
    && 'uri' in value;
}

function formatMilliseconds(value: number): string {
  return value >= 1 ? `${value.toFixed(3)}ms` : `${(value * 1000).toFixed(3)}us`;
}

function getBenchmarkSettings() {
  const config = vscode.workspace.getConfiguration('utu');
  return {
    iterations: clampCount(config.get<number>('bench.iterations', 1000), 1),
    samples: clampCount(config.get<number>('bench.samples', 10), 1),
    warmup: clampCount(config.get<number>('bench.warmup', 2), 0),
  };
}

function clampCount(value: number | undefined, minimum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.floor(value ?? minimum)) : minimum;
}
