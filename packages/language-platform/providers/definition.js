export async function getDocumentDefinition(
    languageService,
    document,
    position,
) {
    // Provider shims keep the service contract explicit at the package edge.
    return languageService.getDefinition(document, position);
}
