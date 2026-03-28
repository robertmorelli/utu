export async function getDocumentSymbols(
    languageService,
    document,
) {
    // Provider shims keep the service contract explicit at the package edge.
    return languageService.getDocumentSymbols(document);
}
