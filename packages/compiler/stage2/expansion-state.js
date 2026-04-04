import { createStage2Expander } from "../stage2-expansion-engine.js";
import {
    containsModuleFeature,
    rootNode,
} from "../stage2-expansion-shared.js";

export function createStage2ExpansionDiagnostic(error) {
    return {
        message: error?.message || String(error),
        severity: "error",
        source: "utu",
        phase: "expand",
    };
}

export function createStage2ExpansionState({
    treeOrNode,
    source,
    uri = null,
    loadImport = null,
    parseSource = null,
    expandOptions = {},
} = {}) {
    const root = rootNode(treeOrNode);
    const hasModuleFeatures = containsModuleFeature(root);
    const shouldExpand = expandOptions.shouldExpand ?? hasModuleFeatures;
    return {
        root,
        source,
        uri,
        loadImport,
        parseSource,
        mode: expandOptions.mode ?? null,
        recover: Boolean(expandOptions.recover),
        hasModuleFeatures,
        shouldExpand,
        recovered: false,
        error: null,
        diagnostics: [],
        expander: shouldExpand ? createStage2Expander(root, source, { uri, loadImport, parseSource }) : null,
        typeDeclarationUnits: [],
        functionRuntimeDeclarationUnits: [],
        materializedSource: source,
    };
}

export function summarizeStage2ExpansionState(expansion) {
    const materializedSource = expansion?.materializedSource ?? expansion?.source ?? "";
    return {
        mode: expansion?.mode ?? null,
        hasModuleFeatures: Boolean(expansion?.hasModuleFeatures),
        shouldExpand: Boolean(expansion?.shouldExpand),
        recovered: Boolean(expansion?.recovered),
        error: expansion?.error ?? null,
        diagnostics: [...(expansion?.diagnostics ?? [])],
        changed: materializedSource !== (expansion?.source ?? materializedSource),
    };
}

export async function runStage2ExpansionStep(expansion, fn) {
    if (!expansion?.shouldExpand || !expansion?.expander || expansion.recovered) return null;
    try {
        return await fn(expansion.expander, expansion);
    } catch (error) {
        if (!expansion.recover) throw error;
        expansion.recovered = true;
        expansion.error = error;
        expansion.diagnostics.push(createStage2ExpansionDiagnostic(error));
        return null;
    }
}

export function disposeStage2ExpansionState(expansion) {
    for (const dispose of expansion?.expander?.loadedFileDisposers?.splice?.(0) ?? []) {
        try {
            dispose?.();
        } catch {}
    }
}
