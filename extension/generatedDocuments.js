import * as vscode from 'vscode';
import { baseNameForGeneratedDocument } from './documentNames.js';
import data from '../jsondata/extension.data.json' with { type: 'json' };
const GENERATED_SCHEME = 'utu-generated';
const GENERATED_FILE_EXTENSIONS = data.generatedFileExtensions;
const GENERATED_LANGUAGE_IDS = data.generatedLanguageIds;
export class GeneratedDocumentStore {
    emitter = new vscode.EventEmitter();
    contents = new Map();
    onDidChange = this.emitter.event;
    upsert(kind, sourceUri, content) {
        const query = new URLSearchParams({
            kind,
            source: sourceUri.toString(),
        }).toString();
        const uri = vscode.Uri.from({
            scheme: GENERATED_SCHEME,
            path: `/${baseNameForGeneratedDocument(sourceUri)}.${GENERATED_FILE_EXTENSIONS[kind]}`,
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
