import { get_metadata as getCoreMetadata } from '../core.js';

/**
 * @typedef {Object} DocumentMetadata
 * @property {'program' | 'library' | 'module_only'} [sourceKind]
 * @property {boolean} hasMain
 * @property {boolean} [hasLibrary]
 * @property {Array<string>} [exports]
 * @property {Array<string>} tests
 * @property {Array<string>} benches
 */

/**
 * Extracts execution metadata from a header snapshot or directly from source text.
 *
 * Public metadata entrypoint:
 * - header snapshots are normalized directly
 * - source-text options forward to the compiler metadata helper
 *
 * @param {Object} headerSnapshotOrOptions
 * @returns {Promise<DocumentMetadata>}
 */
export async function getDocumentMetadata(headerSnapshotOrOptions) {
    if (looksLikeSourceOptions(headerSnapshotOrOptions)) {
        const { sourceText, wasmUrl, runtimeWasmUrl, uri, loadImport } = headerSnapshotOrOptions;
        return normalizeSourceMetadata(await getCoreMetadata(sourceText, { wasmUrl, runtimeWasmUrl, uri, loadImport }));
    }
    return normalizeHeaderMetadata(headerSnapshotOrOptions ?? {});
}

function looksLikeSourceOptions(value) {
    return typeof value?.sourceText === 'string';
}

function normalizeSourceMetadata(metadata) {
    return {
        sourceKind: metadata?.sourceKind ?? undefined,
        hasMain: Boolean(metadata?.hasMain),
        hasLibrary: Boolean(metadata?.hasLibrary),
        exports: normalizeNameList(metadata?.exports),
        tests: normalizeNameList(metadata?.tests),
        benches: normalizeNameList(metadata?.benches),
    };
}

function normalizeHeaderMetadata(headerSnapshot) {
    return {
        sourceKind: headerSnapshot.sourceKind ?? undefined,
        hasMain: Boolean(headerSnapshot.hasMain),
        hasLibrary: Boolean(headerSnapshot.hasLibrary),
        exports: normalizeNameList(headerSnapshot.exports),
        tests: normalizeNameList(headerSnapshot.tests),
        benches: normalizeNameList(headerSnapshot.benches),
    };
}

function normalizeNameList(values) {
    return Array.isArray(values)
        ? values.map((value) => typeof value === 'string' ? value : value?.name).filter(Boolean)
        : [];
}
