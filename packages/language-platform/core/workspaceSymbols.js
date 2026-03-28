import { getDocumentUri } from './types.js';
import { cloneWorkspaceSymbol, collectWorkspaceSymbols } from './symbols.js';

export class UtuWorkspaceSymbolIndex {
    constructor(languageService) {
        this.languageService = languageService;
        this.entries = new Map();
    }
    clear() {
        this.entries.clear();
    }
    deleteDocument(uri) {
        this.entries.delete(uri);
    }
    async updateDocument(document) {
        const uri = getDocumentUri(document);
        const cached = this.entries.get(uri);
        if (cached?.version === document.version)
            return cached.symbols;
        const index = await this.languageService.getDocumentIndex(document);
        const symbols = collectWorkspaceSymbols(index.topLevelSymbols);
        this.entries.set(uri, { version: document.version, symbols });
        return symbols;
    }
    async syncDocuments(documents, { replace = false } = {}) {
        const seen = new Set();
        for (const document of documents) {
            const uri = getDocumentUri(document);
            seen.add(uri);
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
