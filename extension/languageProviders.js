import * as vscode from 'vscode';
import { toVscodeCompletionItem, toVscodeDocumentHighlight, toVscodeHover, toVscodeLocation, toVscodeWorkspaceSymbol, toVscodeRange, } from './adapters/core.js';
import data from '../jsondata/extension.data.json' with { type: 'json' };
const DOCUMENT_SELECTOR = data.documentSelector;
const SEMANTIC_TOKEN_LEGEND = new vscode.SemanticTokensLegend(data.semanticTokenLegend.types, data.semanticTokenLegend.modifiers);
export function registerLanguageProviders(context, languageService, workspaceSymbols) {
    context.subscriptions.push(vscode.languages.registerHoverProvider(DOCUMENT_SELECTOR, {
        async provideHover(document, position) {
            const hover = await languageService.getHover(document, position);
            return hover ? toVscodeHover(hover) : null;
        },
    }), vscode.languages.registerDefinitionProvider(DOCUMENT_SELECTOR, {
        async provideDefinition(document, position) {
            const location = await languageService.getDefinition(document, position);
            return location ? toVscodeLocation(location) : null;
        },
    }), vscode.languages.registerReferenceProvider(DOCUMENT_SELECTOR, {
        async provideReferences(document, position, context) {
            const locations = await languageService.getReferences(document, position, context.includeDeclaration);
            return locations.map(toVscodeLocation);
        },
    }), vscode.languages.registerDocumentHighlightProvider(DOCUMENT_SELECTOR, {
        async provideDocumentHighlights(document, position) {
            const highlights = await languageService.getDocumentHighlights(document, position);
            return highlights.map(toVscodeDocumentHighlight);
        },
    }), vscode.languages.registerCompletionItemProvider(DOCUMENT_SELECTOR, {
        async provideCompletionItems(document, position) {
            const items = await languageService.getCompletionItems(document, position);
            return items.map(toVscodeCompletionItem);
        },
    }, '.'), vscode.languages.registerDocumentSemanticTokensProvider(DOCUMENT_SELECTOR, {
        async provideDocumentSemanticTokens(document) {
            const builder = new vscode.SemanticTokensBuilder(SEMANTIC_TOKEN_LEGEND);
            for (const token of await languageService.getDocumentSemanticTokens(document)) {
                builder.push(toVscodeRange(token.range), token.type, token.modifiers);
            }
            return builder.build();
        },
    }, SEMANTIC_TOKEN_LEGEND), vscode.languages.registerWorkspaceSymbolProvider({
        async provideWorkspaceSymbols(query) {
            const symbols = await workspaceSymbols.getWorkspaceSymbols(query);
            return symbols.map(toVscodeWorkspaceSymbol);
        },
    }));
}
