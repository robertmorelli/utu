import {
    createExpansionSession,
    disposeExpansionSession,
} from "./expansion-session.js";
import { materializeExpandedSource } from "./edit-materialize-expanded-source.js";
import {
    needsExpansion,
    normalizeExpansionOptions,
} from "./analyze-expansion-plan.js";

function createApiState(treeOrNode, source, options = {}) {
    const shouldExpand = needsExpansion(treeOrNode);
    return createExpansionSession({
        treeOrNode,
        source,
        uri: options.uri ?? null,
        loadImport: options.loadImport ?? null,
        parseSource: options.parseSource ?? null,
        expandOptions: {
            ...options,
            ...normalizeExpansionOptions(options),
            shouldExpand,
            hasModuleFeatures: shouldExpand,
        },
    });
}

export async function expandSource(treeOrNode, source, options = {}) {
    const state = createApiState(treeOrNode, source, options);
    try {
        return (await materializeExpandedSource(state)).source;
    } finally {
        disposeExpansionSession(state);
    }
}

export async function expandSourceWithDiagnostics(treeOrNode, source, options = {}) {
    const state = createApiState(treeOrNode, source, options);
    try {
        return await materializeExpandedSource(state);
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
        disposeExpansionSession(state);
    }
}
