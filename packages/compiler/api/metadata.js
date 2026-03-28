import { get_metadata as legacyGetMetadata } from '../core/index.js';

/**
 * @typedef {Object} DocumentMetadata
 * @property {boolean} hasMain
 * @property {Array<string>} tests
 * @property {Array<string>} benches
 */

/**
 * Extracts execution metadata from a header snapshot or directly from source text.
 *
 * Phase 1 shim:
 * - header snapshots are normalized directly
 * - source-text options forward to the current root compiler metadata helper
 *
 * @param {Object} headerSnapshotOrOptions
 * @returns {Promise<DocumentMetadata>}
 */
export async function getDocumentMetadata(headerSnapshotOrOptions) {
    if (looksLikeSourceOptions(headerSnapshotOrOptions)) {
        const { sourceText, wasmUrl, runtimeWasmUrl } = headerSnapshotOrOptions;
        return normalizeLegacyMetadata(await legacyGetMetadata(sourceText, { wasmUrl, runtimeWasmUrl }));
    }
    return normalizeHeaderMetadata(headerSnapshotOrOptions ?? {});
}

function looksLikeSourceOptions(value) {
    return typeof value?.sourceText === 'string';
}

function normalizeLegacyMetadata(metadata) {
    return {
        hasMain: Boolean(metadata?.hasMain),
        tests: normalizeNameList(metadata?.tests),
        benches: normalizeNameList(metadata?.benches),
    };
}

function normalizeHeaderMetadata(headerSnapshot) {
    return {
        hasMain: Boolean(headerSnapshot.hasMain),
        tests: normalizeNameList(headerSnapshot.tests),
        benches: normalizeNameList(headerSnapshot.benches),
    };
}

function normalizeNameList(values) {
    return Array.isArray(values)
        ? values.map((value) => typeof value === 'string' ? value : value?.name).filter(Boolean)
        : [];
}
