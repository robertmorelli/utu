import { DEFAULT_GRAMMAR_WASM, DEFAULT_RUNTIME_WASM } from '../../document/default-wasm.js';
import {
    UtuParserService,
    createSourceDocument,
} from '../../document/index.js';
import { runCompilerNewStage1 } from '../stage1.js';
import { createStage1SyntaxSnapshot } from '../stage1.js';
import { collectHeaderSnapshot as collectHeaderSnapshotFromPipeline } from '../a1_4.js';
import { hydrateHeaderSnapshot } from './analyze-header.js';
import {
    cloneDiagnostic,
    cloneOccurrence,
    cloneSymbol,
} from './analyze-clone.js';

const bundledGrammarWasm = DEFAULT_GRAMMAR_WASM;
const bundledRuntimeWasm = DEFAULT_RUNTIME_WASM;

/**
 * @typedef {'editor' | 'validation' | 'compile'} AnalyzeMode
 */

/**
 * @typedef {Object} AnalyzeOptions
 * @property {AnalyzeMode} [mode]
 * @property {string} [uri]
 * @property {string} sourceText
 * @property {number} [version]
 * @property {UtuParserService} [parserService]
 * @property {UtuLanguageService} [languageService]
 * @property {Function | null} [compileDocument]
 * @property {string | URL | Uint8Array | ArrayBuffer} [grammarWasmPath]
 * @property {string | URL | Uint8Array | ArrayBuffer} [runtimeWasmPath]
 */

/**
 * @typedef {Object} AnalyzeResult
 * @property {AnalyzeMode} mode
 * @property {string} uri
 * @property {string} sourceText
 * @property {Object} syntax
 * @property {Object} header
 * @property {Object | null} body
 * @property {Array<Object>} diagnostics
 */

/**
 * Parses a UTU source document and returns syntax/header snapshots without
 * requiring the shared semantic language service.
 *
 * @param {AnalyzeOptions} options
 * @returns {Promise<Pick<AnalyzeResult, 'mode' | 'uri' | 'sourceText' | 'syntax' | 'header' | 'body' | 'diagnostics'>>}
 */
export async function analyzeSyntaxAndHeader(options) {
    const {
        mode = 'editor',
        uri = 'memory://utu',
        sourceText,
        version = 0,
        parserService: providedParserService,
        grammarWasmPath = bundledGrammarWasm,
        runtimeWasmPath = bundledRuntimeWasm,
    } = options;
    const ownsParserService = !providedParserService;
    const parserService = providedParserService ?? new UtuParserService({
        grammarWasmPath,
        runtimeWasmPath,
    });
    try {
        const stage1 = await runCompilerNewStage1({
            source: sourceText,
            parser: await parserService.getParser(),
            uri,
            version,
            loadImport: null,
            options: {
                intent: "analyze",
                mode,
            },
        });
        try {
            const syntax = createStage1SyntaxSnapshot(stage1);
            return {
                mode,
                uri,
                sourceText,
                syntax,
                header: stage1.analyses["a1.4"] ?? collectHeaderSnapshotFromPipeline(
                    stage1.artifacts.parse?.legacyTree?.rootNode ?? null,
                    stage1.artifacts.parse?.document ?? null,
                ),
                body: null,
                diagnostics: (syntax.diagnostics ?? []).map(cloneDiagnostic),
            };
        } finally {
            stage1.dispose();
        }
    } finally {
        if (ownsParserService) parserService.dispose();
    }
}

/**
 * Analyzes a UTU source document.
 *
 * Shared analysis entrypoint:
 * - all modes use the tolerant parser/document pipeline
 * - `editor` mode keeps backend validation off the hot path
 * - `compile` mode is the strict consumer-facing mode layered on the same snapshots
 *
 * @param {AnalyzeOptions} options
 * @returns {Promise<AnalyzeResult>}
 */
export async function analyzeDocument(options) {
    const {
        mode = 'editor',
        uri = 'memory://utu',
        sourceText,
        version = 0,
        parserService,
        languageService,
        compileDocument: _compileDocument = null,
        grammarWasmPath = bundledGrammarWasm,
        runtimeWasmPath = bundledRuntimeWasm,
    } = options;
    const result = await analyzeSyntaxAndHeader({
        mode,
        uri,
        sourceText,
        version,
        parserService,
        grammarWasmPath,
        runtimeWasmPath,
    });
    if (!languageService) {
        return result;
    }
    const document = createSourceDocument(sourceText, { uri, version });
    const index = await languageService.getDocumentIndex(document, { mode });
    result.header = hydrateHeaderSnapshot(result.header, index);
    result.body = {
        kind: 'body',
        documentIndex: index,
        symbols: index.symbols.map(cloneSymbol),
        topLevelSymbols: index.topLevelSymbols.map(cloneSymbol),
        occurrences: index.occurrences.map(cloneOccurrence),
    };
    result.diagnostics = index.diagnostics.map(cloneDiagnostic);
    return result;
}

export const collectHeaderSnapshot = collectHeaderSnapshotFromPipeline;
