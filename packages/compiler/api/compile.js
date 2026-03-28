import { compile as compileCore } from '../core/index.js';

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
 * Public compile entrypoint:
 * optionally respects a precomputed analysis result when the caller already
 * has one, so compile mode can gate backend work on shared diagnostics.
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
    const artifact = await compileCore(sourceText, compileOptions);
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
