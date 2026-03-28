export async function getDocumentReferences(
    languageService,
    document,
    position,
    includeDeclaration = false,
) {
    // Provider shims keep the service contract explicit at the package edge.
    return languageService.getReferences(document, position, includeDeclaration);
}
