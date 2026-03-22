import * as vscode from 'vscode';
import data from '../jsondata/extension.data.json' with { type: 'json' };
const GENERATED_SCHEME = 'utu-generated', GENERATED_FILE_EXTENSIONS = data.generatedFileExtensions, GENERATED_LANGUAGE_IDS = data.generatedLanguageIds;
const displayNameFromPath = (pathValue, fallback) => pathValue.split(/[\\/]/).filter(Boolean).at(-1) ?? fallback;
export class GeneratedDocumentStore {
    emitter = new vscode.EventEmitter();
    contents = new Map();
    onDidChange = this.emitter.event;
    upsert(kind, sourceUri, content) {
        const uri = vscode.Uri.from({
            scheme: GENERATED_SCHEME,
            path: `/${baseNameForGeneratedDocument(sourceUri)}.${GENERATED_FILE_EXTENSIONS[kind]}`, query: new URLSearchParams({ kind, source: sourceUri.toString() }).toString(),
        });
        this.contents.set(uri.toString(), content);
        this.emitter.fire(uri);
        return uri;
    }
    languageIdFor(kind) { return GENERATED_LANGUAGE_IDS[kind]; }
    provideTextDocumentContent(uri) { return this.contents.get(uri.toString()) ?? ''; }
    dispose() { this.contents.clear(); this.emitter.dispose(); }
}
export const displayNameForDocument = (document) => displayNameFromPath(document.fileName, 'UTU file');
export const displayNameForUri = (uri) => displayNameFromPath(uri.path, uri.toString());
function baseNameForGeneratedDocument(sourceUri) { const fileName = displayNameForUri(sourceUri) || 'utu', extensionIndex = fileName.lastIndexOf('.'); return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName; }
