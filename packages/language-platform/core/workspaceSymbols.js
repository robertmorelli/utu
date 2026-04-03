import { getDocumentUri } from './types.js';
import { collectWorkspaceSymbols } from './symbols.js';
import { CachedWorkspaceSymbolIndex } from './workspaceSymbolsBase.js';

export class UtuWorkspaceSymbolIndex extends CachedWorkspaceSymbolIndex {
    constructor(languageService) {
        super();
        this.languageService = languageService;
    }
    getDocumentUri(document) {
        return getDocumentUri(document);
    }
    async loadSymbols(document) {
        const index = await this.languageService.getDocumentIndex(document);
        return collectWorkspaceSymbols(index.topLevelSymbols);
    }
}
