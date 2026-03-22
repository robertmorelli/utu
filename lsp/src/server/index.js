import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UtuParserService } from '../../../compiler/parser.js';
import { UtuLanguageService, UtuWorkspaceSymbolIndex } from '../core/languageService.js';
import { clamp, getDocumentUri, } from '../core/types.js';
const DEFAULT_SERVER_CAPABILITIES = {
    hover: true,
    definition: true,
    references: true,
    completion: true,
    documentHighlights: true,
    documentSymbols: true,
    workspaceSymbols: true,
    semanticTokens: true,
    diagnostics: true,
};
const SKIPPED_WORKSPACE_DIRECTORIES = new Set([
    '.git',
    '.hg',
    '.svn',
    'node_modules',
]);
export function getDefaultServerCapabilities() {
    return { ...DEFAULT_SERVER_CAPABILITIES };
}
export class UtuServerTextDocument {
    uri;
    version;
    text;
    lineOffsets;
    constructor(uri, version, text) {
        this.uri = uri;
        this.version = version;
        this.text = text;
    }
    getText() {
        return this.text;
    }
    get lineCount() {
        return this.getLineOffsets().length;
    }
    lineAt(line) {
        const offsets = this.getLineOffsets();
        const [start, end] = this.getLineBounds(line, offsets);
        return { text: this.text.slice(start, end) };
    }
    positionAt(offset) {
        const offsets = this.getLineOffsets();
        const clampedOffset = clamp(offset, 0, this.text.length);
        const line = this.findLineForOffset(clampedOffset, offsets);
        return {
            line,
            character: clampedOffset - (offsets[line] ?? 0),
        };
    }
    offsetAt(position) {
        const offsets = this.getLineOffsets();
        const [lineStart, lineEnd] = this.getLineBounds(position.line, offsets);
        return clamp(lineStart + position.character, lineStart, lineEnd);
    }
    setText(text, version) {
        this.replaceText(text);
        this.version = version;
    }
    applyChanges(changes, version) {
        for (const change of changes) {
            if (!change.range) {
                this.replaceText(change.text);
                continue;
            }
            const start = this.offsetAt(change.range.start);
            const end = this.offsetAt(change.range.end);
            this.replaceText(`${this.text.slice(0, start)}${change.text}${this.text.slice(end)}`);
        }
        this.version = version;
    }
    replaceText(text) {
        this.text = text;
        this.lineOffsets = undefined;
    }
    getLineOffsets() {
        if (this.lineOffsets) {
            return this.lineOffsets;
        }
        const offsets = [0];
        for (let index = 0; index < this.text.length; index += 1) {
            const code = this.text.charCodeAt(index);
            if (code === 13) {
                if (this.text.charCodeAt(index + 1) === 10) {
                    index += 1;
                }
                offsets.push(index + 1);
                continue;
            }
            if (code === 10) {
                offsets.push(index + 1);
            }
        }
        this.lineOffsets = offsets;
        return offsets;
    }
    getSafeLine(line, offsets) {
        return clamp(line, 0, Math.max(offsets.length - 1, 0));
    }
    getLineBounds(line, offsets) {
        const safeLine = this.getSafeLine(line, offsets);
        const start = offsets[safeLine] ?? 0;
        const nextOffset = offsets[safeLine + 1] ?? this.text.length;
        return [start, trimLineEnding(this.text, start, nextOffset)];
    }
    findLineForOffset(offset, offsets) {
        let low = 0;
        let high = offsets.length;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if ((offsets[mid] ?? 0) > offset) {
                high = mid;
            }
            else {
                low = mid + 1;
            }
        }
        return Math.max(low - 1, 0);
    }
}
export class UtuServerDocumentManager {
    openDocuments = new Map();
    workspaceFolders = new Set();
    constructor(workspaceFolders = []) {
        this.setWorkspaceFolders(workspaceFolders);
    }
    all() {
        return [...this.openDocuments.values()];
    }
    get(uri) {
        return this.openDocuments.get(uri);
    }
    open(params) {
        return this.store(new UtuServerTextDocument(params.uri, params.version, params.text));
    }
    update(params) {
        const document = this.openDocuments.get(params.uri);
        if (!document) {
            throw new Error(`Cannot apply changes to unopened document: ${params.uri}`);
        }
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
        for (const folder of normalizeFolders(folders)) {
            this.workspaceFolders.add(folder);
        }
    }
    removeWorkspaceFolders(folders) {
        for (const folder of normalizeFolders(folders)) {
            this.workspaceFolders.delete(folder);
        }
    }
    async resolve(uri) {
        return this.openDocuments.get(uri) ?? loadFileDocument(uri);
    }
    async listWorkspaceDocuments() {
        const documents = new Map(this.openDocuments);
        const workspaceFiles = (await Promise.all([...this.workspaceFolders].map(listWorkspaceFilesForFolder))).flat();
        const missingUris = [
            ...new Set(workspaceFiles.map((filePath) => pathToFileURL(filePath).toString())),
        ].filter((uri) => !documents.has(uri));
        const loadedDocuments = await Promise.all(missingUris.map(loadFileDocument));
        for (const document of loadedDocuments) {
            if (document) {
                documents.set(getDocumentUri(document), document);
            }
        }
        return [...documents.values()];
    }
    store(document) {
        this.openDocuments.set(document.uri, document);
        return document;
    }
}
export class UtuLanguageServerCore {
    documents;
    parserService;
    languageService;
    workspaceSymbols;
    workspaceSymbolSyncPromise;
    workspaceSymbolsReady = false;
    constructor(options) {
        this.documents = new UtuServerDocumentManager(options.workspaceFolders ?? []);
        this.parserService = new UtuParserService({
            grammarWasmPath: options.grammarWasmPath,
            runtimeWasmPath: options.runtimeWasmPath,
        });
        this.languageService = new UtuLanguageService(this.parserService);
        this.workspaceSymbols = new UtuWorkspaceSymbolIndex(this.languageService);
    }
    dispose() {
        this.clearDocuments();
        this.languageService.dispose();
        this.parserService.dispose();
    }
    setWorkspaceFolders(folders) {
        this.documents.setWorkspaceFolders(folders);
        this.resetWorkspaceSymbols();
    }
    addWorkspaceFolders(folders) {
        this.documents.addWorkspaceFolders(folders);
        this.resetWorkspaceSymbols();
    }
    removeWorkspaceFolders(folders) {
        this.documents.removeWorkspaceFolders(folders);
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
        if (document) {
            await this.workspaceSymbols.updateDocument(document);
            this.workspaceSymbolsReady = true;
            return;
        }
        this.workspaceSymbols.deleteDocument(uri);
    }
    async saveDocument(params) {
        const document = this.documents.get(params.uri);
        if (document && params.text !== undefined) {
            document.setText(params.text, params.version ?? document.version);
            return this.getFreshDiagnostics(document);
        }
        return this.getDiagnostics(params.uri);
    }
    async getDiagnostics(uri) {
        return this.withDocument(uri, [], (document) => this.languageService.getDiagnostics(document));
    }
    async getHover(uri, position) {
        return this.withDocument(uri, undefined, (document) => this.languageService.getHover(document, position));
    }
    async getDefinition(uri, position) {
        return this.withDocument(uri, undefined, (document) => this.languageService.getDefinition(document, position));
    }
    async getReferences(uri, position, includeDeclaration) {
        return this.withDocument(uri, [], (document) => this.languageService.getReferences(document, position, includeDeclaration));
    }
    async getDocumentHighlights(uri, position) {
        return this.withDocument(uri, [], (document) => this.languageService.getDocumentHighlights(document, position));
    }
    async getCompletionItems(uri, position) {
        return this.withDocument(uri, [], (document) => this.languageService.getCompletionItems(document, position));
    }
    async getDocumentSemanticTokens(uri) {
        return this.withDocument(uri, [], (document) => this.languageService.getDocumentSemanticTokens(document));
    }
    async getDocumentSymbols(uri) {
        return this.withDocument(uri, [], (document) => this.languageService.getDocumentSymbols(document));
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
        if (this.workspaceSymbolsReady) {
            return;
        }
        this.workspaceSymbolSyncPromise ??= this.syncWorkspaceSymbols();
        await this.workspaceSymbolSyncPromise;
    }
    async syncWorkspaceSymbols() {
        try {
            const documents = await this.documents.listWorkspaceDocuments();
            await this.workspaceSymbols.syncDocuments(documents, { replace: true });
            this.workspaceSymbolsReady = true;
        }
        finally {
            this.workspaceSymbolSyncPromise = undefined;
        }
    }
}
export class UtuLanguageServer extends UtuLanguageServerCore {
}
async function loadFileDocument(uri) {
    const filePath = tryFileUriToPath(uri);
    if (!filePath) {
        return undefined;
    }
    try {
        const [text, metadata] = await Promise.all([
            readFile(filePath, 'utf8'),
            stat(filePath),
        ]);
        return new UtuServerTextDocument(uri, Math.trunc(metadata.mtimeMs), text);
    }
    catch {
        return undefined;
    }
}
async function listWorkspaceFilesForFolder(folderUri) {
    const folderPath = tryFileUriToPath(folderUri);
    return folderPath ? collectWorkspaceFiles(folderPath) : [];
}
async function collectWorkspaceFiles(directory) {
    const files = [];
    const pending = [directory];
    while (pending.length > 0) {
        const currentDirectory = pending.pop();
        if (!currentDirectory) {
            continue;
        }
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
                if (!SKIPPED_WORKSPACE_DIRECTORIES.has(entry.name)) {
                    pending.push(entryPath);
                }
                continue;
            }
            if (entry.isFile() && entry.name.endsWith('.utu')) {
                files.push(entryPath);
            }
        }
    }
    return files;
}
function normalizeFolders(folders) {
    return folders.map((folder) => folder.trim()).filter(isNonEmptyString);
}
function tryFileUriToPath(uri) {
    if (!uri.startsWith('file://')) {
        return undefined;
    }
    try {
        return fileURLToPath(uri);
    }
    catch {
        return undefined;
    }
}
function trimLineEnding(text, start, end) {
    let trimmedEnd = end;
    while (trimmedEnd > start) {
        const code = text.charCodeAt(trimmedEnd - 1);
        if (code !== 10 && code !== 13) {
            break;
        }
        trimmedEnd -= 1;
    }
    return trimmedEnd;
}
function isNonEmptyString(value) {
    return value.length > 0;
}
