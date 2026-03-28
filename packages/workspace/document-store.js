import { MutableSourceDocument } from '../document/index.js';

export class UtuWorkspaceTextDocument extends MutableSourceDocument {}

export class UtuDocumentStore {
    constructor({
        workspaceFolders = [],
        documentClass = UtuWorkspaceTextDocument,
        skippedWorkspaceDirectories = [],
    } = {}) {
        this.openDocuments = new Map();
        this.workspaceFolders = new Set();
        this.documentClass = documentClass;
        this.skippedWorkspaceDirectories = new Set(skippedWorkspaceDirectories);
        this.setWorkspaceFolders(workspaceFolders);
    }
    get(uri) {
        return this.openDocuments.get(uri);
    }
    open(params) {
        const document = new this.documentClass(params.uri, params.version, params.text);
        this.openDocuments.set(document.uri, document);
        return document;
    }
    upsertText(params) {
        const existing = this.get(params.uri);
        if (!existing) {
            return this.open({ uri: params.uri, version: params.version, text: params.text });
        }
        existing.setText(params.text, params.version ?? existing.version);
        return existing;
    }
    update(params) {
        const document = this.get(params.uri);
        if (!document) throw new Error(`Cannot apply changes to unopened document: ${params.uri}`);
        document.applyChanges(params.changes, params.version);
        return document;
    }
    close(uri) {
        this.openDocuments.delete(uri);
    }
    clear() {
        this.openDocuments.clear();
    }
    setWorkspaceFolders(folders) {
        this.workspaceFolders = new Set(normalizeFolders(folders));
    }
    addWorkspaceFolders(folders) {
        for (const folder of normalizeFolders(folders))
            this.workspaceFolders.add(folder);
    }
    removeWorkspaceFolders(folders) {
        for (const folder of normalizeFolders(folders))
            this.workspaceFolders.delete(folder);
    }
    async resolve(uri) {
        return this.get(uri) ?? this.loadFileDocument(uri);
    }
    async listWorkspaceDocuments() {
        const documents = new Map(this.openDocuments);
        const workspaceFiles = (await Promise.all([...this.workspaceFolders].map(async (folderUri) => {
            const folderPath = tryFileUriToPath(folderUri);
            return folderPath ? this.collectWorkspaceFiles(folderPath) : [];
        }))).flat();
        const missingUris = new Set(workspaceFiles.map(filePathToUri));
        for (const uri of documents.keys())
            missingUris.delete(uri);
        for (const document of await Promise.all([...missingUris].map((uri) => this.loadFileDocument(uri)))) {
            if (document)
                documents.set(document.uri, document);
        }
        return [...documents.values()];
    }
    async loadFileDocument(uri) {
        const filePath = tryFileUriToPath(uri);
        if (!filePath)
            return undefined;
        try {
            const [{ readFile, stat }] = await Promise.all([loadNodeBuiltin('node:fs/promises')]);
            const [text, metadata] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);
            return new this.documentClass(uri, Math.trunc(metadata.mtimeMs), text);
        }
        catch {
            return undefined;
        }
    }
    async collectWorkspaceFiles(directory) {
        const [{ readdir }, { resolve: resolvePath }] = await Promise.all([
            loadNodeBuiltin('node:fs/promises'),
            loadNodeBuiltin('node:path'),
        ]);
        const files = [];
        const pending = [directory];
        while (pending.length) {
            const currentDirectory = pending.pop();
            if (!currentDirectory)
                continue;
            let entries;
            try {
                entries = await readdir(currentDirectory, { withFileTypes: true });
            }
            catch {
                continue;
            }
            for (const entry of entries) {
                const entryPath = resolvePath(currentDirectory, entry.name);
                if (entry.isDirectory()) {
                    if (!this.skippedWorkspaceDirectories.has(entry.name))
                        pending.push(entryPath);
                }
                else if (entry.isFile() && entry.name.endsWith('.utu')) {
                    files.push(entryPath);
                }
            }
        }
        return files;
    }
}

export const normalizeFolders = (folders) => folders.map((folder) => folder.trim()).filter(Boolean);

export function tryFileUriToPath(uri) {
    if (!uri.startsWith('file://'))
        return undefined;
    try {
        return fileURLToPath(uri);
    }
    catch {
        return undefined;
    }
}

function filePathToUri(filePath) {
    return new URL(encodeURI(filePath), 'file://').toString();
}

function fileURLToPath(uri) {
    return decodeURIComponent(new URL(uri).pathname);
}

function loadNodeBuiltin(specifier) {
    return Function('specifier', 'return import(specifier);')(specifier);
}
