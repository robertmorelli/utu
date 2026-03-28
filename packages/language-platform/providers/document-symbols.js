export async function getDocumentSymbols(languageService, document) {
    return languageService.getDocumentSymbols(document);
}
