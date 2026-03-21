import * as vscode from 'vscode';
import { collectRunnableEntries } from '../../lsp/src/core/languageService.js';
import { toVscodeRange } from './adapters/core.js';
const DOCUMENT_SELECTOR = [{ language: 'utu' }];
export function registerRunCodeLensProvider(context, languageService) {
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(DOCUMENT_SELECTOR, {
        async provideCodeLenses(document) {
            const index = await languageService.getDocumentIndex(document);
            return collectRunnableEntries(index).map((entry) => {
                if (entry.kind === 'main') {
                    return createCodeLens(entry.symbol.range, 'Run Main', 'utu.runMain', document.uri);
                }
                return createCodeLens(entry.symbol.range, entry.kind === 'test' ? 'Run Test' : 'Run Benchmark', entry.kind === 'test' ? 'utu.runTestAt' : 'utu.runBenchmarkAt', document.uri, entry.ordinal);
            });
        },
    }));
}
function createCodeLens(range, title, command, ...args) {
    return new vscode.CodeLens(toVscodeRange(range), { command, title, arguments: args });
}
