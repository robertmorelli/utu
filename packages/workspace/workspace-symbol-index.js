import data from '../../jsondata/languageService.data.json' with { type: 'json' };

const SYMBOL_METADATA = data.symbolMetadata;

export class UtuWorkspaceSymbolIndex {
    constructor(analysisCache) {
        this.analysisCache = analysisCache;
        this.entries = new Map();
    }
    clear() {
        this.entries.clear();
    }
    deleteDocument(uri) {
        this.entries.delete(uri);
    }
    async updateDocument(document) {
        const uri = document.uri;
        const cached = this.entries.get(uri);
        if (cached?.version === document.version)
            return cached.symbols;
        const header = await this.analysisCache.getHeaderSnapshot(document);
        const symbols = collectWorkspaceSymbols(header, uri);
        this.entries.set(uri, { version: document.version, symbols });
        return symbols;
    }
    async syncDocuments(documents, { replace = false } = {}) {
        const seen = new Set();
        for (const document of documents) {
            seen.add(document.uri);
            await this.updateDocument(document);
        }
        if (!replace)
            return;
        for (const uri of this.entries.keys()) {
            if (!seen.has(uri))
                this.entries.delete(uri);
        }
    }
    getWorkspaceSymbols(query = '') {
        const loweredQuery = query.trim().toLowerCase();
        return [...this.entries.values()].flatMap(({ symbols }) => symbols
            .filter((symbol) => !loweredQuery || symbol.name.toLowerCase().includes(loweredQuery))
            .map(cloneWorkspaceSymbol));
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

function cloneWorkspaceSymbol(symbol) {
    return {
        ...symbol,
        location: {
            uri: symbol.location.uri,
            range: copyRange(symbol.location.range),
        },
    };
}

function copyRange(range) {
    return {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
    };
}
