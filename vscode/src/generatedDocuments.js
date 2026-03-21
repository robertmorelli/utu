import * as vscode from 'vscode';
const GENERATED_SCHEME = 'utu-generated';
const GENERATED_FILE_EXTENSIONS = {
    js: 'js',
    wat: 'wat',
    tree: 'txt',
};
const GENERATED_LANGUAGE_IDS = {
    js: 'javascript',
    wat: 'wat',
    tree: 'plaintext',
};
export class GeneratedDocumentStore {
    emitter = new vscode.EventEmitter();
    contents = new Map();
    onDidChange = this.emitter.event;
    upsert(kind, sourceUri, content) {
        const fileName = sourceUri.path.split('/').filter(Boolean).at(-1) ?? 'utu';
        const extensionIndex = fileName.lastIndexOf('.');
        const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
        const query = new URLSearchParams({
            kind,
            source: sourceUri.toString(),
        }).toString();
        const uri = vscode.Uri.from({
            scheme: GENERATED_SCHEME,
            path: `/${baseName}.${GENERATED_FILE_EXTENSIONS[kind]}`,
            query,
        });
        this.contents.set(uri.toString(), content);
        this.emitter.fire(uri);
        return uri;
    }
    languageIdFor(kind) {
        return GENERATED_LANGUAGE_IDS[kind];
    }
    provideTextDocumentContent(uri) {
        return this.contents.get(uri.toString()) ?? '';
    }
    dispose() {
        this.contents.clear();
        this.emitter.dispose();
    }
}
