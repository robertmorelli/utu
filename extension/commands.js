import * as vscode from 'vscode';
import { getBenchmarkOptionsFromConfig } from './benchmarking.js';
import { displayNameForDocument } from './documentNames.js';
import { hasRunnableMain as indexHasRunnableMain } from '../compiler/lsp_core/languageService.js';

export function registerCommands(context, dependencies) {
    const generated = {
        'utu.showGeneratedJavaScript': { kind: 'js', load: (document) => compileDocument(dependencies, document) },
        'utu.showGeneratedWat': { kind: 'wat', load: (document) => compileDocument(dependencies, document, { wat: true }) },
        'utu.showSyntaxTree': { kind: 'tree', load: (document) => dependencies.parserService.getTreeString(document.getText()) },
    };

    const activeDocumentCommands = {
        'utu.compileCurrentFile': async (document) => {
            const label = displayNameForDocument(document);
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Compiling ${label}`,
            }, async () => {
                const result = await compileDocument(dependencies, document);
                dependencies.output.appendLine(`[utu] Compiled ${document.uri.fsPath || document.uri.toString()} (${result.shim.length} JS chars, ${result.wasm.byteLength} wasm bytes)`);
                vscode.window.setStatusBarMessage(`UTU compiled ${label}`, 3000);
            });
        },
        ...Object.fromEntries(Object.entries(generated).map(([command, { kind, load }]) => [
            command,
            async (document) => {
                const content = await load(document);
                await revealGeneratedDocument(dependencies.generatedDocuments, kind, document.uri, kind === 'tree' ? content : generatedContent(kind, content));
            },
        ])),
    };

    const targetDocumentCommands = {
        'utu.runMain': async (document) => {
            if (!(await hasRunnableMain(dependencies.languageService, document))) {
                await vscode.window.showWarningMessage('UTU Run Main requires `export fun main()` in the active file.');
                return;
            }
            const execution = await dependencies.runtimeHost.runMain(document.getText());
            revealExecution(dependencies.output, `Ran ${displayNameForDocument(document)}`, execution.logs, execution.result);
            vscode.window.setStatusBarMessage(`UTU ran ${displayNameForDocument(document)}`, 3000);
        },
    };

    const ordinalCommands = {
        'utu.runTestAt': {
            run: (source, ordinal) => dependencies.runtimeHost.runTest(source, ordinal),
            title: (result) => `${result.passed ? 'Passed' : 'Failed'} test "${result.name}"`,
            status: (result) => result.passed ? `UTU passed ${result.name}` : `UTU failed ${result.name}`,
            result: (result) => result.error,
        },
        'utu.runBenchmarkAt': {
            run: (source, ordinal) => dependencies.runtimeHost.runBenchmark(source, ordinal, getBenchmarkOptionsFromConfig()),
            title: (result) => `Benchmarked "${result.name}"`,
            status: (result) => `UTU benchmarked ${result.name}`,
            result: (result) => result.summary,
        },
    };

    registerCommand(context, 'utu.noop', () => { });
    for (const [command, run] of Object.entries(activeDocumentCommands)) {
        registerCommand(context, command, () => withActiveUtuDocument((document) => runCommand(dependencies.output, () => run(document))));
    }
    for (const [command, run] of Object.entries(targetDocumentCommands)) {
        registerCommand(context, command, (target) => withUtuDocument(target, (document) => runCommand(dependencies.output, () => run(document))));
    }
    for (const [command, config] of Object.entries(ordinalCommands)) {
        registerCommand(context, command, (target, ordinal) => withUtuDocument(target, async (document) => {
            const result = await config.run(document.getText(), Number(ordinal));
            revealExecution(dependencies.output, config.title(result), result.logs, config.result(result));
            vscode.window.setStatusBarMessage(config.status(result), 3000);
        }));
    }
}

function registerCommand(context, command, callback) {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));
}

async function withActiveUtuDocument(callback) {
    return withUtuDocument(vscode.window.activeTextEditor?.document, callback);
}

async function withUtuDocument(target, callback) {
    const document = target instanceof vscode.Uri
        ? await vscode.workspace.openTextDocument(target)
        : target ?? vscode.window.activeTextEditor?.document;
    if (document?.languageId !== 'utu') {
        await vscode.window.showWarningMessage('Open a .utu file to use UTU commands.');
        return;
    }
    return callback(document);
}

function compileDocument(dependencies, document, options = {}) {
    return dependencies.compilerHost.compile(document.getText(), options);
}

function generatedContent(kind, result) {
    return kind === 'wat' ? (result.wat ?? '; compiler did not return WAT output') : result.shim;
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

async function runCommand(output, run) {
    try {
        return await run();
    }
    catch (error) {
        await revealError(output, error);
    }
}

async function revealError(output, error) {
    output.appendLine(`[utu] ${JSON.stringify(error)}`);
    output.show(true);
    await vscode.window.showErrorMessage('UTU command failed. Check the UTU output channel for details.');
}

function revealExecution(output, title, logs, result) {
    output.appendLine(`[utu] ${title}`);
    for (const line of logs) output.appendLine(line);
    if (result !== undefined) output.appendLine(String(result));
    output.show(true);
}

async function hasRunnableMain(languageService, document) {
    return indexHasRunnableMain(await languageService.getDocumentIndex(document));
}
