import * as vscode from 'vscode';
import { collectRunnableEntries } from '../lsp_core/languageService.js';
import { toVscodeRange } from './adapters/core.js';
import data from '../jsondata/extension.data.json' with { type: 'json' };
const DOCUMENT_SELECTOR = data.documentSelector;
const profileLensData = new Map();
const lensEmitter = new vscode.EventEmitter();

export function registerRunCodeLensProvider(context, languageService) {
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(DOCUMENT_SELECTOR, {
        onDidChangeCodeLenses: lensEmitter.event,
        async provideCodeLenses(document) {
            const index = await languageService.getDocumentIndex(document);
            const profile = profileLensData.get(document.uri.toString());
            const functionLenses = profile?.version === document.version
                ? index.topLevelSymbols
                    .filter((symbol) => symbol.kind === 'function')
                    .flatMap((symbol, ordinal) => {
                        const title = formatProfileLensTitle(profile.benches, ordinal);
                        return title ? [createCodeLens(symbol.range, title)] : [];
                    })
                : [];
            return [...functionLenses, ...collectRunnableEntries(index).map((entry) => {
                if (entry.kind === 'main') {
                    return createCodeLens(entry.symbol.range, 'Run Main', 'utu.runMain', document.uri);
                }
                return createCodeLens(entry.symbol.range, entry.kind === 'test' ? 'Run Test' : 'Run Benchmark', entry.kind === 'test' ? 'utu.runTestAt' : 'utu.runBenchmarkAt', document.uri, entry.ordinal);
            })];
        },
    }));
}

export function recordBenchmarkProfile(document, benchName, counts) {
    const key = document.uri.toString();
    const current = profileLensData.get(key);
    const benches = current?.version === document.version ? current.benches : {};
    profileLensData.set(key, { version: document.version, benches: { ...benches, [benchName]: counts } });
    lensEmitter.fire();
}

function formatProfileLensTitle(benches, ordinal) {
    const parts = Object.entries(benches).flatMap(([benchName, counts]) => {
        const total = counts.reduce((sum, value) => sum + value, 0);
        const value = counts[ordinal] ?? 0;
        return total > 0 && value > 0 ? [`${benchName}: ${Math.round((value * 100) / total)}%`] : [];
    });
    return parts.join(' | ');
}

function createCodeLens(range, title, command = 'utu.noop', ...args) {
    return new vscode.CodeLens(toVscodeRange(range), { command, title, arguments: args });
}
