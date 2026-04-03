import { SYMBOL_METADATA } from '../language-spec/index.js';
import { cloneWorkspaceSymbol } from '../language-platform/core/symbols.js';
import { CachedWorkspaceSymbolIndex } from '../language-platform/core/workspaceSymbolsBase.js';

export class UtuWorkspaceSymbolIndex extends CachedWorkspaceSymbolIndex {
    constructor(analysisCache) {
        super();
        this.analysisCache = analysisCache;
    }
    getDocumentUri(document) {
        return document.uri;
    }
    async loadSymbols(document, uri) {
        const header = await this.analysisCache.getHeaderSnapshot(document);
        return collectWorkspaceSymbols(header, uri);
    }
}

function collectWorkspaceSymbols(header, defaultUri) {
    return (header.symbols ?? []).flatMap((symbol) => {
        const metadata = SYMBOL_METADATA[symbol.kind];
        if (!metadata?.documentSymbolKind || !symbol.range)
            return [];
        return [{
                name: symbol.name,
                detail: symbol.signature ?? '',
                kind: metadata.documentSymbolKind,
                location: {
                    uri: symbol.uri ?? defaultUri,
                    range: copyRange(symbol.range),
                },
            }];
    });
}

function copyRange(range) {
    return {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
    };
}
