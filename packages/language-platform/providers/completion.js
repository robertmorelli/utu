export async function getDocumentCompletionItems(languageService, document, position) {
    return languageService.getCompletionItems(document, position);
}
