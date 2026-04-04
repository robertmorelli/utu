import {
    needsExpansion,
    normalizeExpansionOptions,
} from "./analyze-expansion-plan.js";

export async function runPrepareExpansionOptions(context) {
    const expansionPlan = context.analyses["plan-expansion"] ?? null;
    const treeOrNode = context.artifacts.parse?.legacyTree ?? context.legacyTree ?? context.tree ?? null;
    const options = normalizeExpansionOptions(expansionPlan ?? context.options ?? {});
    const hasModuleFeatures = needsExpansion(treeOrNode);
    return {
        ...options,
        hasModuleFeatures,
        shouldExpand: hasModuleFeatures,
    };
}
