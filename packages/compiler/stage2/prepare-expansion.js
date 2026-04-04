import { containsModuleFeature, rootNode } from "../stage2-shared.js";

export function normalizeExpandOptions(options = {}) {
    const mode = options.mode ?? "program";
    return {
        mode,
        recover: mode !== "program" && options.intent !== "compile",
    };
}

export function needsExpansion(treeOrNode) {
    return containsModuleFeature(rootNode(treeOrNode));
}

export async function prepareStage2DeclarationExpansion(context) {
    const options = normalizeExpandOptions(context?.options ?? {});
    const parseRoot = context?.tree
        ?? context?.legacyTree?.rootNode
        ?? context?.artifacts?.parse?.legacyTree?.rootNode
        ?? null;
    const hasModuleFeatures = needsExpansion(parseRoot);
    return {
        ...options,
        hasModuleFeatures,
        shouldExpand: hasModuleFeatures,
    };
}
