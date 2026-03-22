import * as vscode from 'vscode';
import { collectRunnableEntries } from '../lsp_core/languageService.js';
import { toVscodeCompletionItem, toVscodeDocumentHighlight, toVscodeDocumentSymbol, toVscodeHover, toVscodeLocation, toVscodeRange, toVscodeWorkspaceSymbol } from './adapters/core.js';
import data from '../jsondata/extension.data.json' with { type: 'json' };
const DOCUMENT_SELECTOR = data.documentSelector, SEMANTIC_TOKEN_LEGEND = new vscode.SemanticTokensLegend(data.semanticTokenLegend.types, data.semanticTokenLegend.modifiers);
const profileLensData = new Map(), lensEmitter = new vscode.EventEmitter();
export function registerLanguageProviders(context, languageService, workspaceSymbols) {
    context.subscriptions.push(vscode.languages.registerHoverProvider(DOCUMENT_SELECTOR, {
        async provideHover(document, position) { const hover = await languageService.getHover(document, position); return hover ? toVscodeHover(hover) : null; },
    }), vscode.languages.registerDefinitionProvider(DOCUMENT_SELECTOR, {
        async provideDefinition(document, position) { const location = await languageService.getDefinition(document, position); return location ? toVscodeLocation(location) : null; },
    }), vscode.languages.registerReferenceProvider(DOCUMENT_SELECTOR, {
        async provideReferences(document, position, context) { return (await languageService.getReferences(document, position, context.includeDeclaration)).map(toVscodeLocation); },
    }), vscode.languages.registerDocumentHighlightProvider(DOCUMENT_SELECTOR, {
        async provideDocumentHighlights(document, position) { return (await languageService.getDocumentHighlights(document, position)).map(toVscodeDocumentHighlight); },
    }), vscode.languages.registerCompletionItemProvider(DOCUMENT_SELECTOR, {
        async provideCompletionItems(document, position) { return (await languageService.getCompletionItems(document, position)).map(toVscodeCompletionItem); },
    }, '.'), vscode.languages.registerDocumentSemanticTokensProvider(DOCUMENT_SELECTOR, {
        async provideDocumentSemanticTokens(document) {
            const builder = new vscode.SemanticTokensBuilder(SEMANTIC_TOKEN_LEGEND);
            for (const token of await languageService.getDocumentSemanticTokens(document)) {
                builder.push(toVscodeRange(token.range), token.type, token.modifiers);
            }
            return builder.build();
        },
    }, SEMANTIC_TOKEN_LEGEND), vscode.languages.registerDocumentSymbolProvider(DOCUMENT_SELECTOR, {
        async provideDocumentSymbols(document) { return (await languageService.getDocumentSymbols(document)).map(toVscodeDocumentSymbol); },
    }), vscode.languages.registerCodeLensProvider(DOCUMENT_SELECTOR, { onDidChangeCodeLenses: lensEmitter.event, async provideCodeLenses(document) {
        const index = await languageService.getDocumentIndex(document), profile = profileLensData.get(document.uri.toString()), functionLenses = profile?.version === document.version ? index.topLevelSymbols.flatMap((symbol, ordinal) => symbol.kind !== 'function' ? [] : ((title) => title ? [createCodeLens(symbol.range, title)] : [])(formatProfileLensTitle(profile.benches, ordinal))) : [];
        return [...functionLenses, ...collectRunnableEntries(index).map((entry) => createCodeLens(entry.symbol.range, entry.kind === 'main' ? 'Run Main' : entry.kind === 'test' ? 'Run Test' : 'Run Benchmark', entry.kind === 'main' ? 'utu.runMain' : entry.kind === 'test' ? 'utu.runTestAt' : 'utu.runBenchmarkAt', document.uri, ...(entry.kind === 'main' ? [] : [entry.ordinal])))];
    } }), vscode.languages.registerWorkspaceSymbolProvider({
        async provideWorkspaceSymbols(query) { return (await workspaceSymbols.getWorkspaceSymbols(query)).map(toVscodeWorkspaceSymbol); },
    }));
}
export function recordBenchmarkProfile(document, benchName, counts) { const key = document.uri.toString(), current = profileLensData.get(key); profileLensData.set(key, { version: document.version, benches: { ...(current?.version === document.version ? current.benches : {}), [benchName]: counts } }); lensEmitter.fire(); }
const createCodeLens = (range, title, command = 'utu.noop', ...args) => new vscode.CodeLens(toVscodeRange(range), { command, title, arguments: args });
const formatProfileLensTitle = (benches, ordinal) => Object.entries(benches).flatMap(([benchName, counts]) => { const total = counts.reduce((sum, value) => sum + value, 0), value = counts[ordinal] ?? 0; return total > 0 && value > 0 ? [`${benchName}: ${Math.round((value * 100) / total)}%`] : []; }).join(' | ');
