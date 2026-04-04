import { createExpansionExpander } from "./expansion-engine.js";
import { emitExpansionItem } from "./expansion-materialize-items.js";
import { namedChildren, rootNode } from "./expansion-shared.js";
import {
    needsExpansion,
    normalizeExpansionOptions,
} from "./analyze-expansion-plan.js";

function snapshotExpansionTopLevelDeclarations(state) {
    return {
        moduleNames: [...state.expander.moduleTemplates.keys()].sort(),
        typeNames: [...state.expander.topLevelTypeNames].sort(),
        valueNames: [...state.expander.topLevelValueNames].sort(),
        protocolNames: [...state.expander.topLevelProtocolNames].sort(),
    };
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
    return {
        root,
        source,
        uri,
        loadImport,
        parseSource,
        ...options,
        hasModuleFeatures: shouldExpand,
        shouldExpand,
        diagnostics: [],
        recovered: false,
        error: null,
        importsLoaded: false,
        topLevelCollected: false,
        namespacesPrimed: false,
        topLevelDeclarations: null,
        namespaceModel: null,
        symbolFacts: null,
        typeDeclarations: null,
        functionDeclarations: null,
        materialized: null,
        expander: createExpansionExpander(root, source, {
            uri,
            loadImport,
            parseSource,
        }),
        __disposed: false,
        dispose() {
            disposeExpansionSession(this);
        },
    };
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
    if (!state || state.importsLoaded || !state.shouldExpand) return state;
    await state.expander.loadRootFileImports();
    state.importsLoaded = true;
    return state;
}

export async function ensureExpansionTopLevelDeclarations(state) {
    if (!state || !state.shouldExpand) return state;
    if (state.topLevelCollected || state.topLevelDeclarations) return state;
    if (state.expander.moduleTemplates.size > 0 || state.expander.topLevelTypeNames.size > 0 || state.expander.topLevelValueNames.size > 0) {
        state.topLevelCollected = true;
        state.topLevelDeclarations = snapshotExpansionTopLevelDeclarations(state);
        return state;
    }

    await ensureExpansionImports(state);
    const ctx = state.expander.createRootContext();
    state.expander.collectTopLevelSymbols(ctx);
    state.topLevelCollected = true;
    state.topLevelDeclarations = snapshotExpansionTopLevelDeclarations(state);
    return state;
}

export async function ensureExpansionNamespaceDiscovery(state) {
    if (!state || !state.shouldExpand) return state;
    await ensureExpansionTopLevelDeclarations(state);
    let previousNamespaceCount = -1;
    while (previousNamespaceCount !== state.expander.namespaceOrder.length) {
        previousNamespaceCount = state.expander.namespaceOrder.length;
        const discoveryCtx = state.expander.createRootContext();
        for (const item of namedChildren(state.root)) {
            void emitExpansionItem(state.expander, item, discoveryCtx, false);
        }
        for (let index = 0; index < state.expander.namespaceOrder.length; index += 1) {
            const namespace = state.expander.namespaceOrder[index];
            const namespaceCtx = state.expander.cloneContext(
                state.expander.createRootContext(),
                {
                    namespace,
                    typeParams: new Map(namespace.typeParams),
                    moduleBindings: namespace.template.moduleBindings ?? new Map(),
                    localValueScopes: [],
                },
            );
            for (const item of namespace.template.items) {
                void emitExpansionItem(state.expander, item, namespaceCtx, true);
            }
        }
    }
    state.namespacesPrimed = true;
    return state;
}

export const createStage2ExpansionState = createExpansionSession;
export const disposeStage2ExpansionState = disposeExpansionSession;
export const ensureStage2Imports = ensureExpansionImports;
export const ensureStage2TopLevelDeclarations = ensureExpansionTopLevelDeclarations;
export const ensureStage2NamespaceDiscovery = ensureExpansionNamespaceDiscovery;
