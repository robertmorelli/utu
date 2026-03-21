import * as vscode from 'vscode';
import { toVscodeRange } from './adapters/core.js';
const DOCUMENT_SELECTOR = [{ language: 'utu' }];
export function registerRunCodeLensProvider(context, languageService) {
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(DOCUMENT_SELECTOR, {
        async provideCodeLenses(document) {
            const index = await languageService.getDocumentIndex(document);
            const ordinals = new Map([
                ['test', 0],
                ['bench', 0],
            ]);
            return index.topLevelSymbols.flatMap((symbol) => {
                if (symbol.kind === 'function' && symbol.exported && symbol.name === 'main') {
                    return [createCodeLens(symbol.range, 'Run Main', 'utu.runMain', document.uri)];
                }
                if (symbol.kind !== 'test' && symbol.kind !== 'bench') {
                    return [];
                }
                const ordinal = ordinals.get(symbol.kind) ?? 0;
                ordinals.set(symbol.kind, ordinal + 1);
                return [
                    createCodeLens(symbol.range, symbol.kind === 'test' ? 'Run Test' : 'Run Benchmark', symbol.kind === 'test' ? 'utu.runTestAt' : 'utu.runBenchmarkAt', document.uri, ordinal),
                ];
            });
        },
    }));
}
function createCodeLens(range, title, command, ...args) {
    return new vscode.CodeLens(toVscodeRange(range), { command, title, arguments: args });
}
