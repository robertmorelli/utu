import { UtuParserService } from '../document/index.js';
import { symbolToMarkup } from '../language-platform/core/document-index/build.js';
import { UtuAnalysisCache } from './analysis-cache.js';
import { resolveCrossFileDefinition, resolveCrossFileSymbol } from './cross-file-definition.js';
import { getWorkspaceDocumentHighlights, getWorkspaceReferences } from './cross-file-references.js';
import { UtuDependencyGraph } from './dependency-graph.js';
import { UtuDocumentStore, UtuWorkspaceTextDocument } from './document-store.js';
import { UtuWorkspaceSymbolIndex } from './workspace-symbol-index.js';

export const WORKSPACE_SESSION_MODES = Object.freeze({
    EDITOR: 'editor',
    VALIDATION: 'validation',
    COMPILE: 'compile',
});

export const WORKSPACE_SESSION_PHASES = Object.freeze({
    OPEN_DOCUMENT: 'open-document',
    UPDATE_DOCUMENT: 'update-document',
    SAVE_DOCUMENT: 'save-document',
    READ_DIAGNOSTICS: 'read-diagnostics',
    READ_DOCUMENT_INDEX: 'read-document-index',
});

const DEFAULT_DOCUMENT_REQUESTS = [
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
        if (!languageService) {
            throw new Error('UtuWorkspaceSession requires a languageService. Hosts should construct the shared language service and pass it in.');
        }
        this.languageService = languageService;
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
        return this.getFreshDiagnostics(this.documents.open(params), { mode: this.modeForPhase(WORKSPACE_SESSION_PHASES.OPEN_DOCUMENT) });
    }
    async updateDocument(params) {
        return this.getFreshDiagnostics(this.documents.update(params), { mode: this.modeForPhase(WORKSPACE_SESSION_PHASES.UPDATE_DOCUMENT) });
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
            return this.getDiagnostics(params.uri, { mode: this.modeForPhase(WORKSPACE_SESSION_PHASES.SAVE_DOCUMENT) });
        document.setText(params.text, params.version ?? document.version);
        return this.getFreshDiagnostics(document, { mode: this.modeForPhase(WORKSPACE_SESSION_PHASES.SAVE_DOCUMENT) });
    }
    async syncDocumentText(params) {
        return this.documents.upsertText(params);
    }
    async getDocumentAnalysis(uri, options = {}) {
        const mode = normalizeWorkspaceSessionMode(options.mode ?? this.modeForPhase(WORKSPACE_SESSION_PHASES.READ_DIAGNOSTICS));
        return this.withDocument(uri, null, (document) => this.analysisCache.analyze(document, { ...options, mode }));
    }
    async getDocumentIndex(uri) {
        const analysis = await this.getDocumentAnalysis(uri, { mode: this.modeForPhase(WORKSPACE_SESSION_PHASES.READ_DOCUMENT_INDEX) });
        return analysis?.body?.documentIndex ?? null;
    }
    async getDiagnostics(uri, { mode = this.modeForPhase(WORKSPACE_SESSION_PHASES.READ_DIAGNOSTICS) } = {}) {
        const analysis = await this.getDocumentAnalysis(uri, { mode });
        return analysis?.diagnostics?.map(cloneDiagnostic) ?? [];
    }
    async getDefinition(uri, position) {
        return this.withDocument(uri, undefined, async (document) => {
            const local = await this.languageService.getDefinition(document, position);
            return local ?? resolveCrossFileDefinition(this, document, position);
        });
    }
    async getHover(uri, position) {
        return this.withDocument(uri, undefined, async (document) => {
            const local = await this.languageService.getHover(document, position);
            if (local)
                return local;
            return formatCrossFileHover(await resolveCrossFileSymbol(this, document, position));
        });
    }
    async getReferences(uri, position, includeDeclaration = false) {
        return this.withDocument(uri, [], (document) => getWorkspaceReferences(this, document, position, includeDeclaration));
    }
    async getDocumentHighlights(uri, position) {
        return this.withDocument(uri, [], (document) => getWorkspaceDocumentHighlights(this, document, position));
    }
    async getWorkspaceSymbols(query) {
        await this.ensureWorkspaceSymbols();
        return this.workspaceSymbols.getWorkspaceSymbols(query);
    }
    async getFreshDiagnostics(document, { mode = this.modeForPhase(WORKSPACE_SESSION_PHASES.READ_DIAGNOSTICS) } = {}) {
        const normalizedMode = normalizeWorkspaceSessionMode(mode);
        this.invalidateDocument(document.uri);
        const analysis = await this.analysisCache.analyze(document, { mode: normalizedMode });
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

    modeForPhase(phase) {
        switch (phase) {
            case WORKSPACE_SESSION_PHASES.OPEN_DOCUMENT:
            case WORKSPACE_SESSION_PHASES.SAVE_DOCUMENT:
            case WORKSPACE_SESSION_PHASES.READ_DIAGNOSTICS:
            case WORKSPACE_SESSION_PHASES.READ_DOCUMENT_INDEX:
                return WORKSPACE_SESSION_MODES.VALIDATION;
            case WORKSPACE_SESSION_PHASES.UPDATE_DOCUMENT:
                return WORKSPACE_SESSION_MODES.EDITOR;
            default:
                throw new Error(`Unknown workspace session phase "${phase}"`);
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

function normalizeWorkspaceSessionMode(mode) {
    switch (mode) {
        case WORKSPACE_SESSION_MODES.EDITOR:
        case WORKSPACE_SESSION_MODES.VALIDATION:
        case WORKSPACE_SESSION_MODES.COMPILE:
            return mode;
        default:
            throw new Error(`Unknown workspace session mode "${mode}"`);
    }
}

function formatCrossFileHover(result) {
    if (!result)
        return undefined;
    if (result.symbol) {
        return {
            contents: symbolToMarkup(result.symbol),
            range: cloneRange(result.sourceRange),
        };
    }
    if (result.kind === 'module') {
        return {
            contents: {
                kind: 'markdown',
                value: `\`\`\`utu\nmod ${result.moduleName}\n\`\`\`\n\nImported from \`${result.binding?.specifier ?? 'unknown'}\``,
            },
            range: cloneRange(result.sourceRange),
        };
    }
    return undefined;
}

function cloneRange(range) {
    return range ? {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
    } : undefined;
}
