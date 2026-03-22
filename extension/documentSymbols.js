import { toVscodeDocumentSymbol } from './adapters/core.js';
export class UtuDocumentSymbolProvider {
    languageService;
    constructor(languageService) {
        this.languageService = languageService;
    }
    async provideDocumentSymbols(document) {
        const symbols = await this.languageService.getDocumentSymbols(document);
        return symbols.map(toVscodeDocumentSymbol);
    }
}
