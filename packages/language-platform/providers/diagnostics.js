export async function getDocumentDiagnostics(languageService, document) {
    return languageService.getDiagnostics(document);
}
