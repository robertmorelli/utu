export async function getDocumentDefinition(languageService, document, position) {
    return languageService.getDefinition(document, position);
}
