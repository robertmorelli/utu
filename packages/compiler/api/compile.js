import { compile as legacyCompile } from '../core/index.js';

/**
 * @typedef {Object} CompileOptions
 * @property {string} [uri]
 * @property {string} [sourceText]
 * @property {Object} [analyzeResult]
 * @property {Object} [compileOptions]
 */

/**
 * Lowers a UTU document into target artifacts.
 *
 * Phase 1 shim:
 * wraps the current root compiler entrypoint and optionally respects a
 * precomputed analysis result when the caller already has one.
 *
 * @param {CompileOptions} options
 * @returns {Promise<Object>}
 */
export async function compileDocument(options) {
    const {
        analyzeResult = null,
        sourceText = analyzeResult?.sourceText,
        compileOptions = {},
    } = options;
    if (analyzeResult && hasBlockingErrors(analyzeResult.diagnostics)) {
        return {
            wat: null,
            wasm: null,
            js: null,
            shim: null,
            metadata: null,
            backendDiagnostics: [{ message: 'Compilation aborted due to frontend errors.' }],
        };
    }
    if (typeof sourceText !== 'string') {
        throw new TypeError('compileDocument requires sourceText or an analyzeResult with sourceText.');
    }
    const artifact = await legacyCompile(sourceText, compileOptions);
    return {
        ...artifact,
        wat: artifact.wat ?? null,
        wasm: artifact.wasm ?? null,
        js: artifact.js ?? artifact.shim ?? null,
        backendDiagnostics: [],
    };
}

function hasBlockingErrors(diagnostics = []) {
    return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
