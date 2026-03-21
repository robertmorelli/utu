import * as vscode from 'vscode';
import { formatError, } from './compilerHost.js';
import { formatDurationMs, getBenchmarkOptionsFromConfig } from './benchmarking.js';
import { displayNameForDocument } from './documentNames.js';
import { hasRunnableMain as indexHasRunnableMain } from '../../lsp/src/core/languageService.js';
export function registerCommands(context, dependencies) {
    registerCommand(context, 'utu.compileCurrentFile', () => withActiveUtuDocument(async (document) => {
        const label = displayNameForDocument(document);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Compiling ${label}`,
        }, async () => {
            try {
                const result = await compileDocument(dependencies.compilerHost, document);
                dependencies.output.appendLine(`[utu] Compiled ${document.uri.fsPath || document.uri.toString()} (${result.js.length} JS chars, ${result.wasm.byteLength} wasm bytes)`);
                vscode.window.setStatusBarMessage(`UTU compiled ${label}`, 3000);
            }
            catch (error) {
                await revealError(dependencies.output, `Compile failed for ${document.uri.fsPath || document.uri.toString()}`, error);
            }
        });
    }));
    registerCommand(context, 'utu.showGeneratedJavaScript', () => withActiveUtuDocument(async (document) => {
        try {
            const result = await compileDocument(dependencies.compilerHost, document);
            await revealGeneratedDocument(dependencies.generatedDocuments, 'js', document.uri, result.js);
        }
        catch (error) {
            await revealError(dependencies.output, 'Unable to generate JavaScript output', error);
        }
    }));
    registerCommand(context, 'utu.showGeneratedWat', () => withActiveUtuDocument(async (document) => {
        try {
            const result = await compileDocument(dependencies.compilerHost, document, { wat: true });
            await revealGeneratedDocument(dependencies.generatedDocuments, 'wat', document.uri, result.wat ?? '; compiler did not return WAT output');
        }
        catch (error) {
            await revealError(dependencies.output, 'Unable to generate WAT output', error);
        }
    }));
    registerCommand(context, 'utu.showSyntaxTree', () => withActiveUtuDocument(async (document) => {
        try {
            const syntaxTree = await dependencies.parserService.getTreeString(document.getText());
            await revealGeneratedDocument(dependencies.generatedDocuments, 'tree', document.uri, syntaxTree);
        }
        catch (error) {
            await revealError(dependencies.output, 'Unable to generate syntax tree', error);
        }
    }));
    registerCommand(context, 'utu.runMain', (uri) => withUtuDocument(uri, async (document) => {
        try {
            if (!(await hasRunnableMain(dependencies.languageService, document))) {
                await vscode.window.showWarningMessage('UTU Run Main requires `export fn main()` in the active file.');
                return;
            }
            const blocker = await dependencies.runtimeHost.getRunMainBlocker?.(document.getText());
            if (blocker) {
                dependencies.output.appendLine(`[utu] Run Main blocked for ${document.uri.fsPath || document.uri.toString()}`);
                dependencies.output.appendLine(blocker);
                dependencies.output.show(true);
                await vscode.window.showWarningMessage(blocker);
                return;
            }
            const execution = await dependencies.runtimeHost.runMain(document.getText());
            revealExecution(dependencies.output, `Ran ${displayNameForDocument(document)}`, execution.logs, execution.result);
            vscode.window.setStatusBarMessage(`UTU ran ${displayNameForDocument(document)}`, 3000);
        }
        catch (error) {
            await revealError(dependencies.output, 'Unable to run main', error);
        }
    }));
    registerCommand(context, 'utu.runTestAt', async (uri, ordinal) => {
        const testOrdinal = typeof ordinal === 'number' ? ordinal : Number(ordinal);
        await withUtuDocument(uri, async (document) => {
            try {
                const result = await dependencies.runtimeHost.runTest(document.getText(), testOrdinal);
                revealExecution(dependencies.output, `${result.passed ? 'Passed' : 'Failed'} test "${result.name}"`, result.logs, result.error);
                const label = result.passed ? `UTU passed ${result.name}` : `UTU failed ${result.name}`;
                vscode.window.setStatusBarMessage(label, 3000);
            }
            catch (error) {
                await revealError(dependencies.output, 'Unable to run test', error);
            }
        });
    });
    registerCommand(context, 'utu.runBenchmarkAt', async (uri, ordinal) => {
        const benchmarkOrdinal = typeof ordinal === 'number' ? ordinal : Number(ordinal);
        await withUtuDocument(uri, async (document) => {
            try {
                const result = await dependencies.runtimeHost.runBenchmark(document.getText(), benchmarkOrdinal, getBenchmarkOptionsFromConfig());
                revealExecution(dependencies.output, `Benchmarked "${result.name}"`, result.logs, `${formatDurationMs(result.meanMs)} mean, ${formatDurationMs(result.perIterationMs)}/iter`);
                vscode.window.setStatusBarMessage(`UTU benchmarked ${result.name}`, 3000);
            }
            catch (error) {
                await revealError(dependencies.output, 'Unable to run benchmark', error);
            }
        });
    });
}
function registerCommand(context, command, callback) {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));
}
async function withActiveUtuDocument(callback) {
    await withUtuDocument(vscode.window.activeTextEditor?.document, callback);
}
async function withUtuDocument(target, callback) {
    const document = await resolveDocument(target);
    if (document?.languageId !== 'utu') {
        await vscode.window.showWarningMessage('Open a .utu file to use UTU commands.');
        return;
    }
    await callback(document);
}
function compileDocument(compilerHost, document, options = {}) {
    return compilerHost.compile(document.getText(), options);
}
async function revealGeneratedDocument(generatedDocuments, kind, sourceUri, content) {
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
async function revealError(output, context, error) {
    output.appendLine(`[utu] ${context}`);
    output.appendLine(formatError(error));
    output.show(true);
    await vscode.window.showErrorMessage(`${context}. Check the UTU output channel for details.`);
}
function revealExecution(output, title, logs, result) {
    output.appendLine(`[utu] ${title}`);
    for (const line of logs) {
        output.appendLine(line);
    }
    if (result !== undefined) {
        output.appendLine(String(result));
    }
    output.show(true);
}
async function hasRunnableMain(languageService, document) {
    const index = await languageService.getDocumentIndex(document);
    return indexHasRunnableMain(index);
}
async function resolveDocument(target) {
    if (target instanceof vscode.Uri) {
        return vscode.workspace.openTextDocument(target);
    }
    if (hasTextDocumentShape(target)) {
        return target;
    }
    return vscode.window.activeTextEditor?.document;
}
function hasTextDocumentShape(value) {
    return typeof value === 'object'
        && value !== null
        && 'languageId' in value
        && 'getText' in value
        && 'uri' in value;
}
