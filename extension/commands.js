import * as vscode from 'vscode';
import { displayNameForDocument } from './generatedDocuments.js';
import { hasRunnableMain as indexHasRunnableMain } from '../lsp_core/languageService.js';
import { getBenchmarkOptionsFromConfig } from './testing.js';
import { appendOutputBlock, logOutputError } from './shared.js';

export function registerCommands(context, d) {
    const withUtuDocument = async (target) => (target = target instanceof vscode.Uri ? await vscode.workspace.openTextDocument(target) : target ?? vscode.window.activeTextEditor?.document, target?.languageId === 'utu' ? target : (await vscode.window.showWarningMessage('Open a .utu file to use UTU commands.'), undefined));
    const register = (name, run) => context.subscriptions.push(vscode.commands.registerCommand(name, (...args) => fail(d.output, () => run(...args))));
    const revealGenerated = async (kind, sourceUri, content) => { const uri = d.generatedDocuments.upsert(kind, sourceUri, content), document = await vscode.workspace.openTextDocument(uri), language = d.generatedDocuments.languageIdFor(kind); if (document.languageId !== language) await vscode.languages.setTextDocumentLanguage(document, language); await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside }); };
    const showGenerated = (name, kind, load) => register(name, async (document) => {
        document = await withUtuDocument(document);
        return document && revealGenerated(kind, document.uri, await load(document));
    });
    register('utu.noop', () => { });
    register('utu.compileCurrentFile', async (document) => {
        document = await withUtuDocument(document);
        return document && vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Compiling ${displayNameForDocument(document)}` }, async () => {
        const result = await d.compilerHost.compile(document.getText(), {}), label = displayNameForDocument(document);
        d.output.appendLine(`[utu] Compiled ${document.uri.fsPath || document.uri.toString()} (${result.shim.length} JS chars, ${result.wasm.byteLength} wasm bytes)`);
        vscode.window.setStatusBarMessage(`UTU compiled ${label}`, 3000);
        });
    });
    showGenerated('utu.showGeneratedJavaScript', 'js', (document) => d.compilerHost.compile(document.getText(), {}));
    showGenerated('utu.showGeneratedWat', 'wat', async (document) => (await d.compilerHost.compile(document.getText(), { wat: true })).wat ?? '; compiler did not return WAT output');
    showGenerated('utu.showSyntaxTree', 'tree', (document) => d.parserService.getTreeString(document.getText()));
    register('utu.runMain', async (target, document) => {
        document = await withUtuDocument(document ?? target);
        if (!document) return;
        if (!indexHasRunnableMain(await d.languageService.getDocumentIndex(document))) return void await vscode.window.showWarningMessage('UTU Run Main requires `export fun main()` in the active file.');
        const execution = await d.runtimeHost.runMain(document.getText()), label = displayNameForDocument(document);
        show(d.output, `Ran ${label}`, execution.logs, execution.result); vscode.window.setStatusBarMessage(`UTU ran ${label}`, 3000);
    });
    for (const [name, runner, title, status, pick] of [['utu.runTestAt', (source, ordinal) => d.runtimeHost.runTest(source, ordinal), (result) => `${result.passed ? 'Passed' : 'Failed'} test "${result.name}"`, (result) => result.passed ? `UTU passed ${result.name}` : `UTU failed ${result.name}`, (result) => result.error], ['utu.runBenchmarkAt', (source, ordinal) => d.runtimeHost.runBenchmark(source, ordinal, getBenchmarkOptionsFromConfig()), (result) => `Benchmarked "${result.name}"`, (result) => `UTU benchmarked ${result.name}`, (result) => result.summary]]) register(name, async (target, ordinal, document) => {
        document = await withUtuDocument(document ?? target);
        if (!document) return;
        const result = await runner(document.getText(), Number(ordinal));
        show(d.output, title(result), result.logs, pick(result)); vscode.window.setStatusBarMessage(status(result), 3000);
    });
}

async function fail(output, run) { try { return await run(); } catch (error) { logOutputError(output, '[utu] Command failed', error); await vscode.window.showErrorMessage('UTU command failed. Check the UTU output channel for details.'); } }

function show(output, title, logs, result) { appendOutputBlock(output, `[utu] ${title}`, logs, result); }
