import { analyzeDocument } from '../compiler/api/analyze.js';
import { toSourceDocument } from '../document/index.js';

const MODE_PRIORITY = { editor: 0, validation: 1, compile: 2 };

export class UtuAnalysisCache {
    constructor({
        parserService = null,
        languageService = null,
        validateWat = null,
        grammarWasmPath,
        runtimeWasmPath,
    } = {}) {
        this.entries = new Map();
        this.parserService = parserService;
        this.languageService = languageService;
        this.validateWat = validateWat;
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
        const mode = options.mode ?? 'editor';
        const cacheKey = document.uri;
        const existing = this.entries.get(cacheKey);
        const entry = existing?.version === document.version
            ? existing
            : { version: document.version, results: new Map() };
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
            validateWat: options.validateWat ?? this.validateWat,
            grammarWasmPath: options.grammarWasmPath ?? this.grammarWasmPath,
            runtimeWasmPath: options.runtimeWasmPath ?? this.runtimeWasmPath,
        });
        entry.results.set(mode, result);
        this.entries.set(cacheKey, entry);
        return result;
    }
    async getSyntaxSnapshot(documentOrSource, options = {}) {
        return (await this.analyze(documentOrSource, { ...options, mode: 'editor' })).syntax;
    }
    async getHeaderSnapshot(documentOrSource, options = {}) {
        return (await this.analyze(documentOrSource, { ...options, mode: options.mode ?? 'editor' })).header;
    }
    async getBodySnapshot(documentOrSource, options = {}) {
        return (await this.analyze(documentOrSource, { ...options, mode: options.mode ?? 'validation' })).body;
    }
    async getCompileSnapshot(documentOrSource, options = {}) {
        return this.analyze(documentOrSource, { ...options, mode: 'compile' });
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
