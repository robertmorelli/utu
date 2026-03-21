export function displayNameForDocument(document) {
    return fileNameFromPath(document.fileName, 'UTU file');
}

export function displayNameForUri(uri) {
    return fileNameFromPath(uri.path, uri.toString());
}

export function baseNameForGeneratedDocument(sourceUri) {
    const fileName = displayNameForUri(sourceUri) || 'utu';
    const extensionIndex = fileName.lastIndexOf('.');
    return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
}

function fileNameFromPath(pathValue, fallback) {
    return pathValue.split(/[\\/]/).filter(Boolean).at(-1) ?? fallback;
}
