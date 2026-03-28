export async function getDocumentSemanticTokens(
    languageService,
    document,
) {
    // Provider shims keep the service contract explicit at the package edge.
    return languageService.getDocumentSemanticTokens(document);
}
