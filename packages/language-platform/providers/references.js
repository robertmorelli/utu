export async function getDocumentReferences(languageService, document, position, includeDeclaration = false) {
    return languageService.getReferences(document, position, includeDeclaration);
}
