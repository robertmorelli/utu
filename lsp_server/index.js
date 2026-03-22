import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UtuParserService, UtuSourceDocument } from '../parser.js';
import { UtuLanguageService, UtuWorkspaceSymbolIndex } from '../lsp_core/languageService.js';
import { getDocumentUri } from '../lsp_core/types.js';
import data from '../jsondata/server.data.json' with { type: 'json' };
const DEFAULT_SERVER_CAPABILITIES = data.defaultServerCapabilities;
const SKIPPED_WORKSPACE_DIRECTORIES = new Set(data.skippedWorkspaceDirectories);
const DOCUMENT_REQUESTS = [['getDiagnostics', 'getDiagnostics', []], ['getHover', 'getHover', undefined], ['getDefinition', 'getDefinition', undefined], ['getReferences', 'getReferences', []], ['getDocumentHighlights', 'getDocumentHighlights', []], ['getCompletionItems', 'getCompletionItems', []], ['getDocumentSemanticTokens', 'getDocumentSemanticTokens', []], ['getDocumentSymbols', 'getDocumentSymbols', []]];
export const getDefaultServerCapabilities = () => ({ ...DEFAULT_SERVER_CAPABILITIES });
export class UtuServerTextDocument extends UtuSourceDocument {
    constructor(uri, version, text) { super(text, { uri, version }); }
    setText(text, version) {
        this.replaceText(text);
        this.version = version;
    }
    applyChanges(changes, version) {
        for (const { range, text } of changes) {
            if (!range) this.replaceText(text);
            else {
                const start = this.offsetAt(range.start);
                const end = this.offsetAt(range.end);
                this.replaceText(`${this.text.slice(0, start)}${text}${this.text.slice(end)}`);
            }
        }
        this.version = version;
    }
    replaceText(text) {
        this.text = text;
        this.lineOffsets = undefined;
    }
}
export class UtuServerDocumentManager {
    constructor(workspaceFolders = []) {
        this.openDocuments = new Map();
        this.workspaceFolders = new Set();
        this.setWorkspaceFolders(workspaceFolders);
    }
    get(uri) {
        return this.openDocuments.get(uri);
    }
    open(params) {
        const document = new UtuServerTextDocument(params.uri, params.version, params.text);
        this.openDocuments.set(document.uri, document);
        return document;
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
        for (const folder of normalizeFolders(folders)) this.workspaceFolders.add(folder);
    }
    removeWorkspaceFolders(folders) {
        for (const folder of normalizeFolders(folders)) this.workspaceFolders.delete(folder);
    }
    async resolve(uri) {
        return this.get(uri) ?? loadFileDocument(uri);
    }
    async listWorkspaceDocuments() {
        const documents = new Map(this.openDocuments);
        const workspaceFiles = (await Promise.all([...this.workspaceFolders].map(async (folderUri) => {
            const folderPath = tryFileUriToPath(folderUri);
            return folderPath ? collectWorkspaceFiles(folderPath) : [];
        }))).flat();
        const missingUris = new Set(workspaceFiles.map((filePath) => pathToFileURL(filePath).toString()));
        for (const uri of documents.keys()) missingUris.delete(uri);
        for (const document of await Promise.all([...missingUris].map(loadFileDocument))) {
            if (document) documents.set(getDocumentUri(document), document);
        }
        return [...documents.values()];
    }
}
export class UtuLanguageServerCore {
    constructor(options) {
        this.documents = new UtuServerDocumentManager(options.workspaceFolders ?? []);
        this.parserService = new UtuParserService({
            grammarWasmPath: options.grammarWasmPath,
            runtimeWasmPath: options.runtimeWasmPath,
        });
        this.languageService = new UtuLanguageService(this.parserService);
        this.workspaceSymbols = new UtuWorkspaceSymbolIndex(this.languageService);
        this.workspaceSymbolsReady = false;
    }
    dispose() {
        this.clearDocuments();
        this.languageService.dispose();
        this.parserService.dispose();
    }
    setWorkspaceFolders(folders) {
        this.updateWorkspaceFolders('setWorkspaceFolders', folders);
    }
    addWorkspaceFolders(folders) {
        this.updateWorkspaceFolders('addWorkspaceFolders', folders);
    }
    removeWorkspaceFolders(folders) {
        this.updateWorkspaceFolders('removeWorkspaceFolders', folders);
    }
    updateWorkspaceFolders(method, folders) {
        this.documents[method](folders);
        this.resetWorkspaceSymbols();
    }
    invalidateDocument(uri) {
        this.languageService.invalidate(uri);
        this.workspaceSymbols.deleteDocument(uri);
    }
    clearDocuments() {
        this.documents.clear();
        this.languageService.clear();
        this.resetWorkspaceSymbols();
    }
    async openDocument(params) {
        return this.getFreshDiagnostics(this.documents.open(params));
    }
    async updateDocument(params) {
        return this.getFreshDiagnostics(this.documents.update(params));
    }
    async closeDocument(uri) {
        this.documents.close(uri);
        this.invalidateDocument(uri);
        const document = await this.documents.resolve(uri);
        if (!document) return this.workspaceSymbols.deleteDocument(uri);
        await this.workspaceSymbols.updateDocument(document);
        this.workspaceSymbolsReady = true;
    }
    async saveDocument(params) {
        const document = this.documents.get(params.uri);
        if (!document || params.text === undefined) return this.getDiagnostics(params.uri);
        document.setText(params.text, params.version ?? document.version);
        return this.getFreshDiagnostics(document);
    }
    async getWorkspaceSymbols(query) {
        await this.ensureWorkspaceSymbols();
        return this.workspaceSymbols.getWorkspaceSymbols(query);
    }
    async getFreshDiagnostics(document) {
        this.invalidateDocument(document.uri);
        const diagnostics = await this.languageService.getDiagnostics(document);
        await this.workspaceSymbols.updateDocument(document);
        this.workspaceSymbolsReady = true;
        return diagnostics;
    }
    async withDocument(uri, fallback, action) {
        const document = await this.documents.resolve(uri);
        return document ? action(document) : fallback;
    }
    resetWorkspaceSymbols() {
        this.workspaceSymbolSyncPromise = undefined;
        this.workspaceSymbolsReady = false;
        this.workspaceSymbols.clear();
    }
    async ensureWorkspaceSymbols() {
        if (this.workspaceSymbolsReady) return;
        await (this.workspaceSymbolSyncPromise ??= this.syncWorkspaceSymbols());
    }
    async syncWorkspaceSymbols() {
        try {
            await this.workspaceSymbols.syncDocuments(await this.documents.listWorkspaceDocuments(), { replace: true });
            this.workspaceSymbolsReady = true;
        } finally {
            this.workspaceSymbolSyncPromise = undefined;
        }
    }
}
for (const [name, serviceMethod, fallback] of DOCUMENT_REQUESTS) {
    UtuLanguageServerCore.prototype[name] = async function (uri, ...args) {
        return this.withDocument(uri, fallback, (document) => this.languageService[serviceMethod](document, ...args));
    };
}
export class UtuLanguageServer extends UtuLanguageServerCore {}
async function loadFileDocument(uri) {
    const filePath = tryFileUriToPath(uri);
    if (!filePath) return undefined;
    try {
        const [text, metadata] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);
        return new UtuServerTextDocument(uri, Math.trunc(metadata.mtimeMs), text);
    } catch {
        return undefined;
    }
}
async function collectWorkspaceFiles(directory) {
    const files = [];
    const pending = [directory];
    while (pending.length) {
        const currentDirectory = pending.pop();
        if (!currentDirectory) continue;
        let entries;
        try {
            entries = await readdir(currentDirectory, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const entryPath = resolvePath(currentDirectory, entry.name);
            if (entry.isDirectory()) {
                if (!SKIPPED_WORKSPACE_DIRECTORIES.has(entry.name)) pending.push(entryPath);
            } else if (entry.isFile() && entry.name.endsWith('.utu')) {
                files.push(entryPath);
            }
        }
    }
    return files;
}
const normalizeFolders = (folders) => folders.map((folder) => folder.trim()).filter(Boolean);
function tryFileUriToPath(uri) {
    if (!uri.startsWith('file://')) return undefined;
    try {
        return fileURLToPath(uri);
    } catch {
        return undefined;
    }
}
