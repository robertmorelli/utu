export async function getDocumentHover(
    languageService,
    document,
    position,
) {
    // Provider shims keep the service contract explicit at the package edge.
    return languageService.getHover(document, position);
}
