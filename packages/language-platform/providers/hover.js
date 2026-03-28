export async function getDocumentHover(languageService, document, position) {
    return languageService.getHover(document, position);
}
