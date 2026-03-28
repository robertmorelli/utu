import { UtuParserService } from '../document/index.js';
import { UtuLanguageService } from '../language-platform/index.js';
import { UtuAnalysisCache } from './analysis-cache.js';
import { UtuDependencyGraph } from './dependency-graph.js';
import { UtuDocumentStore, UtuWorkspaceTextDocument } from './document-store.js';
import { UtuWorkspaceSymbolIndex } from './workspace-symbol-index.js';

const DEFAULT_DOCUMENT_REQUESTS = [
    ['getHover', 'getHover', undefined],
    ['getDefinition', 'getDefinition', undefined],
    ['getReferences', 'getReferences', []],
    ['getDocumentHighlights', 'getDocumentHighlights', []],
    ['getCompletionItems', 'getCompletionItems', []],
    ['getDocumentSemanticTokens', 'getDocumentSemanticTokens', []],
    ['getDocumentSymbols', 'getDocumentSymbols', []],
];

export class UtuWorkspaceSession {
    constructor({
        workspaceFolders = [],
        grammarWasmPath,
        runtimeWasmPath,
        parserService = null,
        languageService = null,
        analysisCache = null,
        workspaceSymbols = null,
        dependencies = null,
        documents = null,
        documentClass = UtuWorkspaceTextDocument,
        skippedWorkspaceDirectories = [],
        validateWat: validateWatOverride = null,
    } = {}) {
        this.documents = documents ?? new UtuDocumentStore({
            workspaceFolders,
            documentClass,
            skippedWorkspaceDirectories,
        });
        this.parserService = parserService ?? new UtuParserService({
            grammarWasmPath,
            runtimeWasmPath,
        });
        this.languageService = languageService ?? new UtuLanguageService(this.parserService, { validateWat: validateWatOverride });
        this.analysisCache = analysisCache ?? new UtuAnalysisCache({
            parserService: this.parserService,
            languageService: this.languageService,
            validateWat: validateWatOverride,
            grammarWasmPath,
            runtimeWasmPath,
        });
        this.workspaceSymbols = workspaceSymbols ?? new UtuWorkspaceSymbolIndex(this.analysisCache);
        this.dependencies = dependencies ?? new UtuDependencyGraph();
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
        this.analysisCache.invalidate(uri);
        this.languageService.invalidate(uri);
        this.workspaceSymbols.deleteDocument(uri);
        for (const dependentUri of this.dependencies.getDependents(uri)) {
            this.analysisCache.invalidate(dependentUri);
            this.languageService.invalidate(dependentUri);
            this.workspaceSymbols.deleteDocument(dependentUri);
        }
    }
    clearDocuments() {
        this.documents.clear();
        this.analysisCache.clear();
        this.languageService.clear();
        this.dependencies.clear();
        this.resetWorkspaceSymbols();
    }
    async openDocument(params) {
        return this.getFreshDiagnostics(this.documents.open(params), { mode: 'editor' });
    }
    async updateDocument(params) {
        return this.getFreshDiagnostics(this.documents.update(params), { mode: 'editor' });
    }
    async closeDocument(uri) {
        this.documents.close(uri);
        this.dependencies.deleteDocument(uri);
        this.invalidateDocument(uri);
        const document = await this.documents.resolve(uri);
        if (!document)
            return this.workspaceSymbols.deleteDocument(uri);
        await this.workspaceSymbols.updateDocument(document);
        this.workspaceSymbolsReady = true;
    }
    async saveDocument(params) {
        const document = this.documents.get(params.uri);
        if (!document || params.text === undefined)
            return this.getDiagnostics(params.uri, { mode: 'validation' });
        document.setText(params.text, params.version ?? document.version);
        return this.getFreshDiagnostics(document, { mode: 'validation' });
    }
    async syncDocumentText(params) {
        return this.documents.upsertText(params);
    }
    async getDocumentAnalysis(uri, options = {}) {
        return this.withDocument(uri, null, (document) => this.analysisCache.analyze(document, options));
    }
    async getDocumentIndex(uri) {
        const analysis = await this.getDocumentAnalysis(uri, { mode: 'validation' });
        return analysis?.body?.legacyIndex ?? null;
    }
    async getDiagnostics(uri, { mode = 'validation' } = {}) {
        const analysis = await this.getDocumentAnalysis(uri, { mode });
        return analysis?.diagnostics?.map(cloneDiagnostic) ?? [];
    }
    async getWorkspaceSymbols(query) {
        await this.ensureWorkspaceSymbols();
        return this.workspaceSymbols.getWorkspaceSymbols(query);
    }
    async getFreshDiagnostics(document, { mode = 'validation' } = {}) {
        this.invalidateDocument(document.uri);
        const analysis = await this.analysisCache.analyze(document, { mode });
        this.dependencies.updateDocument(document, analysis.header);
        await this.workspaceSymbols.updateDocument(document);
        this.workspaceSymbolsReady = true;
        return analysis.diagnostics.map(cloneDiagnostic);
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
        if (this.workspaceSymbolsReady)
            return;
        await (this.workspaceSymbolSyncPromise ??= this.syncWorkspaceSymbols());
    }
    async syncWorkspaceSymbols() {
        try {
            await this.workspaceSymbols.syncDocuments(await this.documents.listWorkspaceDocuments(), { replace: true });
            this.workspaceSymbolsReady = true;
        }
        finally {
            this.workspaceSymbolSyncPromise = undefined;
        }
    }
}

for (const [name, serviceMethod, fallback] of DEFAULT_DOCUMENT_REQUESTS) {
    UtuWorkspaceSession.prototype[name] = async function (uri, ...args) {
        return this.withDocument(uri, fallback, (document) => this.languageService[serviceMethod](document, ...args));
    };
}

function cloneDiagnostic(diagnostic) {
    return {
        ...diagnostic,
        range: diagnostic.range ? {
            start: { line: diagnostic.range.start.line, character: diagnostic.range.start.character },
            end: { line: diagnostic.range.end.line, character: diagnostic.range.end.character },
        } : diagnostic.range,
        offsetRange: diagnostic.offsetRange ? { ...diagnostic.offsetRange } : undefined,
    };
}
