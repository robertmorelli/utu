import { analyzeDocument, analyzeSyntaxAndHeader } from '../../packages/compiler/api/analyze.js';
import { toSourceDocument } from '../document/index.js';

export const ANALYSIS_CACHE_MODES = Object.freeze({
    EDITOR: 'editor',
    VALIDATION: 'validation',
    COMPILE: 'compile',
});

export const ANALYSIS_CACHE_SNAPSHOTS = Object.freeze({
    SYNTAX: 'syntax',
    HEADER: 'header',
    BODY: 'body',
    COMPILE: 'compile',
});

const MODE_PRIORITY = {
    [ANALYSIS_CACHE_MODES.EDITOR]: 0,
    [ANALYSIS_CACHE_MODES.VALIDATION]: 1,
    [ANALYSIS_CACHE_MODES.COMPILE]: 2,
};

export class UtuAnalysisCache {
    constructor({
        parserService = null,
        languageService = null,
        compileDocument = null,
        grammarWasmPath,
        runtimeWasmPath,
    } = {}) {
        this.entries = new Map();
        this.parserService = parserService;
        this.languageService = languageService;
        this.compileDocument = compileDocument;
        this.grammarWasmPath = grammarWasmPath;
        this.runtimeWasmPath = runtimeWasmPath;
    }
    clear() {
        this.entries.clear();
    }
    invalidate(uri) {
        this.entries.delete(uri);
    }
    async analyze(documentOrSource, options = {}) {
        const document = toSourceDocument(documentOrSource, options.documentOptions);
        const mode = normalizeAnalysisCacheMode(options.mode ?? ANALYSIS_CACHE_MODES.EDITOR);
        const cacheKey = document.uri;
        const existing = this.entries.get(cacheKey);
        const entry = existing?.version === document.version
            ? existing
            : { version: document.version, syntax: null, header: null, results: new Map() };
        const cached = getReusableResult(entry, mode);
        if (cached)
            return cached;
        const result = await analyzeDocument({
            mode,
            uri: document.uri,
            sourceText: document.getText(),
            version: document.version,
            parserService: options.parserService ?? this.parserService,
            languageService: options.languageService ?? this.languageService,
            compileDocument: options.compileDocument ?? this.compileDocument,
            grammarWasmPath: options.grammarWasmPath ?? this.grammarWasmPath,
            runtimeWasmPath: options.runtimeWasmPath ?? this.runtimeWasmPath,
        });
        primeSyntaxAndHeader(entry, result);
        entry.results.set(mode, result);
        this.entries.set(cacheKey, entry);
        return result;
    }
    async getSyntaxSnapshot(documentOrSource, options = {}) {
        return this.getCachedSyntaxAndHeader(documentOrSource, options).then(({ syntax }) => syntax);
    }
    async getHeaderSnapshot(documentOrSource, options = {}) {
        return this.getCachedSyntaxAndHeader(documentOrSource, options).then(({ header }) => header);
    }
    async getBodySnapshot(documentOrSource, options = {}) {
        return (await this.analyze(documentOrSource, {
            ...options,
            mode: modeForSnapshot(ANALYSIS_CACHE_SNAPSHOTS.BODY, options.mode),
        })).body;
    }
    async getCompileSnapshot(documentOrSource, options = {}) {
        return this.analyze(documentOrSource, {
            ...options,
            mode: modeForSnapshot(ANALYSIS_CACHE_SNAPSHOTS.COMPILE, options.mode),
        });
    }
    async getCachedSyntaxAndHeader(documentOrSource, options = {}) {
        const document = toSourceDocument(documentOrSource, options.documentOptions);
        const cacheKey = document.uri;
        const existing = this.entries.get(cacheKey);
        const entry = existing?.version === document.version
            ? existing
            : { version: document.version, syntax: null, header: null, results: new Map() };
        if (entry.syntax && entry.header) {
            this.entries.set(cacheKey, entry);
            return { syntax: entry.syntax, header: entry.header };
        }
        const partial = await analyzeSyntaxAndHeader({
            mode: modeForSnapshot(ANALYSIS_CACHE_SNAPSHOTS.HEADER, options.mode),
            uri: document.uri,
            sourceText: document.getText(),
            version: document.version,
            parserService: options.parserService ?? this.parserService,
            grammarWasmPath: options.grammarWasmPath ?? this.grammarWasmPath,
            runtimeWasmPath: options.runtimeWasmPath ?? this.runtimeWasmPath,
        });
        entry.syntax = partial.syntax;
        entry.header = partial.header;
        this.entries.set(cacheKey, entry);
        return { syntax: partial.syntax, header: partial.header };
    }
}

function getReusableResult(entry, requestedMode) {
    let reusable = null;
    let reusablePriority = Infinity;
    for (const [mode, result] of entry.results) {
        const priority = MODE_PRIORITY[mode];
        if (priority === undefined || priority < MODE_PRIORITY[requestedMode] || priority >= reusablePriority)
            continue;
        reusable = result;
        reusablePriority = priority;
    }
    return reusable;
}

function primeSyntaxAndHeader(entry, result) {
    entry.syntax ??= result.syntax;
    entry.header ??= result.header;
}

function normalizeAnalysisCacheMode(mode) {
    switch (mode) {
        case ANALYSIS_CACHE_MODES.EDITOR:
        case ANALYSIS_CACHE_MODES.VALIDATION:
        case ANALYSIS_CACHE_MODES.COMPILE:
            return mode;
        default:
            throw new Error(`Unknown analysis cache mode "${mode}"`);
    }
}

function modeForSnapshot(snapshot, requestedMode) {
    if (requestedMode !== undefined) {
        return normalizeAnalysisCacheMode(requestedMode);
    }
    switch (snapshot) {
        case ANALYSIS_CACHE_SNAPSHOTS.SYNTAX:
        case ANALYSIS_CACHE_SNAPSHOTS.HEADER:
            return ANALYSIS_CACHE_MODES.EDITOR;
        case ANALYSIS_CACHE_SNAPSHOTS.BODY:
            return ANALYSIS_CACHE_MODES.VALIDATION;
        case ANALYSIS_CACHE_SNAPSHOTS.COMPILE:
            return ANALYSIS_CACHE_MODES.COMPILE;
        default:
            throw new Error(`Unknown analysis cache snapshot "${snapshot}"`);
    }
}
