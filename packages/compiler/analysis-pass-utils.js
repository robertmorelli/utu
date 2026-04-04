import { createSourceDocument } from "../document/index.js";

// establish the initial source/document/load-context artifact for the pipeline.
export async function runLoadSource(context) {
    return {
        source: context.source,
        uri: context.uri ?? 'memory://utu',
        version: context.version ?? 0,
        document: createSourceDocument(context.source, {
            uri: context.uri ?? 'memory://utu',
            version: context.version ?? 0,
        }),
        hasImportLoader: typeof context.loadImport === 'function',
    };
}

export async function runEmptyAnalysisPass(_passName, _context) {
    return {};
}

const EMPTY = [];

export function runTreeWalkAnalysisPass(_passName, context, {
    root = context?.tree ?? null,
    initialState = () => ({}),
    visit = null,
    shouldDescend = null,
    childrenOf = (node) => node?.children ?? EMPTY,
    finalize = (state) => state,
} = {}) {
    const state = typeof initialState === "function" ? initialState() : initialState;
    const walk = (node, parent = null) => {
        if (!node || typeof node !== "object") return;
        visit?.(node, { state, parent });
        if (typeof shouldDescend === "function" && !shouldDescend(node, { state, parent })) {
            return;
        }
        for (const child of childrenOf(node) ?? EMPTY) {
            walk(child, node);
        }
    };
    walk(root);
    return finalize(state);
}
