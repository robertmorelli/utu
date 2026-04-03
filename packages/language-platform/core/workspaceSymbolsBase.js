import { cloneWorkspaceSymbol } from './symbols.js';

export class CachedWorkspaceSymbolIndex {
    constructor() {
        this.entries = new Map();
    }
    clear() {
        this.entries.clear();
    }
    deleteDocument(uri) {
        this.entries.delete(uri);
    }
    async updateDocument(document) {
        const uri = this.getDocumentUri(document);
        const cached = this.entries.get(uri);
        if (cached?.version === document.version)
            return cached.symbols;
        const symbols = await this.loadSymbols(document, uri);
        this.entries.set(uri, { version: document.version, symbols });
        return symbols;
    }
    async syncDocuments(documents, { replace = false } = {}) {
        const seen = new Set();
        for (const document of documents) {
            seen.add(this.getDocumentUri(document));
            await this.updateDocument(document);
        }
        if (!replace)
            return;
        for (const uri of this.entries.keys())
            if (!seen.has(uri))
                this.entries.delete(uri);
    }
    getWorkspaceSymbols(query = '') {
        const loweredQuery = query.trim().toLowerCase();
        return [...this.entries.values()].flatMap(({ symbols }) => symbols
            .filter((symbol) => !loweredQuery || symbol.name.toLowerCase().includes(loweredQuery))
            .map(cloneWorkspaceSymbol));
    }
}
