import {
    createStage2ExpansionState,
    disposeStage2ExpansionState,
} from "./expansion-session.js";
import { materializeStage2ExpandedSource } from "./edit-materialize-expanded-source.js";
import {
    needsStage2Expansion,
    normalizeStage2ExpandOptions,
} from "./analyze-expansion-plan.js";

function createApiState(treeOrNode, source, options = {}) {
    const shouldExpand = needsStage2Expansion(treeOrNode);
    return createStage2ExpansionState({
        treeOrNode,
        source,
        uri: options.uri ?? null,
        loadImport: options.loadImport ?? null,
        parseSource: options.parseSource ?? null,
        expandOptions: {
            ...normalizeStage2ExpandOptions(options),
            shouldExpand,
            hasModuleFeatures: shouldExpand,
        },
    });
}

export async function expandSource(treeOrNode, source, options = {}) {
    const state = createApiState(treeOrNode, source, options);
    try {
        return (await materializeStage2ExpandedSource(state)).source;
    } finally {
        disposeStage2ExpansionState(state);
    }
}

export async function expandSourceWithDiagnostics(treeOrNode, source, options = {}) {
    const state = createApiState(treeOrNode, source, options);
    try {
        return await materializeStage2ExpandedSource(state);
    } catch (error) {
        return {
            changed: false,
            recovered: true,
            diagnostics: [{
                severity: "error",
                source: "utu",
                message: error?.message ?? String(error),
            }],
            source,
        };
    } finally {
        disposeStage2ExpansionState(state);
    }
}
