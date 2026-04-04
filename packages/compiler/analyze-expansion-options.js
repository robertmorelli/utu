import {
    needsStage2Expansion,
    normalizeStage2ExpandOptions,
} from "./analyze-expansion-plan.js";

export async function runA26PrepareDeclarationExpansion(context) {
    const expansionPlan = context.analyses["plan-expansion"] ?? null;
    const treeOrNode = context.artifacts.parse?.legacyTree ?? context.legacyTree ?? context.tree ?? null;
    const options = normalizeStage2ExpandOptions(expansionPlan ?? context.options ?? {});
    const hasModuleFeatures = needsStage2Expansion(treeOrNode);
    return {
        ...options,
        hasModuleFeatures,
        shouldExpand: hasModuleFeatures,
    };
}
