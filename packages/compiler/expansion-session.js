import { createExpansionExpander } from "./expansion-engine.js";
import { runExpansionFixedPoint } from "./expansion-fixed-point.js";
import { namedChildren, rootNode } from "./expansion-shared.js";
import {
    needsExpansion,
    normalizeExpansionOptions,
} from "./analyze-expansion-plan.js";

function initializeRootImportWork(rootItems) {
    const pendingImportKeys = new Set();
    const importWorkItems = new Map();
    rootItems.forEach((item, index) => {
        if (item.type !== "file_import_decl") return;
        const key = `${index}:${item.text}`;
        pendingImportKeys.add(key);
        importWorkItems.set(key, { key, node: item });
    });
    return { pendingImportKeys, importWorkItems };
}

export function createExpansionSession({
    treeOrNode,
    source,
    uri = null,
    loadImport = null,
    parseSource = null,
    expandOptions = {},
} = {}) {
    const root = rootNode(treeOrNode);
    const options = normalizeExpansionOptions(expandOptions);
    const shouldExpand = expandOptions?.shouldExpand ?? needsExpansion(root);
    const rootItems = [...namedChildren(root)];
    const { pendingImportKeys, importWorkItems } = initializeRootImportWork(rootItems);
    const state = {
        root,
        rootItems,
        rootLinearItems: null,
        rootItemContexts: [],
        rootContext: null,
        source,
        uri,
        loadImport,
        parseSource,
        ...options,
        maxIterations: Number.isFinite(expandOptions?.maxIterations)
            ? Math.max(0, Math.trunc(expandOptions.maxIterations))
            : 64,
        hasModuleFeatures: shouldExpand,
        shouldExpand,
        diagnostics: [],
        recovered: false,
        error: null,
        pendingImportKeys,
        processedImportKeys: new Set(),
        importWorkItems,
        pendingNamespaceKeys: new Set(),
        processedNamespaceKeys: new Set(),
        pendingNestedNamespaceKeys: new Set(),
        processedNestedNamespaceKeys: new Set(),
        knownRootConstructs: new Set(),
        knownRootModuleRefs: new Set(),
        iteration: 0,
        changedSinceLastIteration: false,
        importsLoaded: false,
        topLevelCollected: false,
        namespacesPrimed: false,
        rootDefinitionsCollected: false,
        rootConstructsDiscovered: false,
        rootNamespaceInstantiationsDiscovered: false,
        expansionFactsFinalized: false,
        fixedPoint: null,
        fixedPointPassRuns: [],
        topLevelDeclarations: null,
        namespaceModel: null,
        symbolFacts: null,
        emissionPreparation: null,
        typeDeclarations: null,
        functionDeclarations: null,
        materialized: null,
        expander: null,
        __disposed: false,
        dispose() {
            disposeExpansionSession(this);
        },
    };
    state.expander = createExpansionExpander(root, source, {
        uri,
        loadImport,
        parseSource,
        session: state,
    });
    return state;
}

export function disposeExpansionSession(state) {
    if (!state || state.__disposed) return;
    state.__disposed = true;
    for (const dispose of state.expander?.loadedFileDisposers ?? []) {
        try {
            dispose?.();
        } catch {}
    }
}

export async function ensureExpansionImports(state) {
    if (!state || !state.shouldExpand) return state;
    await runExpansionFixedPoint(state);
    return state;
}

export async function ensureExpansionTopLevelDeclarations(state) {
    if (!state || !state.shouldExpand) return state;
    await runExpansionFixedPoint(state);
    return state;
}

export async function ensureExpansionNamespaceDiscovery(state) {
    if (!state || !state.shouldExpand) return state;
    await runExpansionFixedPoint(state);
    return state;
}

export const createStage2ExpansionState = createExpansionSession;
export const disposeStage2ExpansionState = disposeExpansionSession;
export const ensureStage2Imports = ensureExpansionImports;
export const ensureStage2TopLevelDeclarations = ensureExpansionTopLevelDeclarations;
export const ensureStage2NamespaceDiscovery = ensureExpansionNamespaceDiscovery;
