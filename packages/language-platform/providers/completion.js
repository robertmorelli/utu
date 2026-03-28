export async function getDocumentCompletionItems(
    languageService,
    document,
    position,
) {
    // Provider shims keep the service contract explicit at the package edge.
    return languageService.getCompletionItems(document, position);
}
