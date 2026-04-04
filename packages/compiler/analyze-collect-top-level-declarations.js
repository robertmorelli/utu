import { collectStage2TopLevelDeclarations } from "./stage2-top-level-facts.js";

// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over a2.14 pipeline state.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

// a2.15 Collect Top-Level Decls:
// seed module templates plus type/protocol declaration facts before namespace construction.
export async function runA215CollectTopLevelDecls(context) {
    const expansionState = context.artifacts.stage2Expansion ?? null;
    return collectStage2TopLevelDeclarations(expansionState);
}
