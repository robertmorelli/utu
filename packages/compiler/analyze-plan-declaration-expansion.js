import { normalizeExpandOptions, needsExpansion } from "./stage2-prepare-expansion.js";

// a2.5 Plan Declaration Expansion:
// decide expansion mode/recovery policy and whether declaration expansion work is required.
export async function runA25PlanDeclarationExpansion(context) {
    const options = normalizeExpandOptions(context.options ?? {});
    const parseRoot = context.tree ?? context.legacyTree?.rootNode ?? context.artifacts.parse?.legacyTree?.rootNode ?? null;
    const hasModuleFeatures = needsExpansion(parseRoot);
    return {
        ...options,
        hasModuleFeatures,
        shouldExpand: hasModuleFeatures,
    };
}
