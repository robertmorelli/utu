export async function getDocumentSemanticTokens(languageService, document) {
    return languageService.getDocumentSemanticTokens(document);
}
