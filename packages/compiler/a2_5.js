import { normalizeExpandOptions, needsExpansion } from "./a2_6.js";

// a2.5 Plan Declaration Expansion:
// decide expansion mode/recovery policy and whether declaration expansion work is required.
export async function runA25PlanDeclarationExpansion(context) {
    const options = normalizeExpandOptions(context.options ?? {});
    const hasModuleFeatures = needsExpansion(parseRoot);
    return {
        ...options,
        hasModuleFeatures,
        shouldExpand: hasModuleFeatures,
    };
}
