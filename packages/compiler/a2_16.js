import { buildStage2NamespaceModel } from "./a2_6.js";

// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over a2.15/a2.14 pipeline state.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

// a2.16 Build Namespace Model:
// preview construct-instantiated namespaces and capture stable namespace/name-mangle facts.
export async function runA216BuildNamespaceModel(context) {
    const expansionState = context.artifacts.stage2Expansion ?? null;
    return buildStage2NamespaceModel(expansionState);
}
