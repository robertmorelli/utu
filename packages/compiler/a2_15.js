import { collectStage2TopLevelDeclarations } from "./stage2/top-level-facts.js";

// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over a2.14 pipeline state.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

// a2.15 Collect Top-Level Decls:
// seed module templates plus type/protocol declaration facts before namespace construction.
export async function runA215CollectTopLevelDecls(context) {
    const pipeline = context.analyses["a2.14"]?.pipeline ?? null;
    const collected = await collectStage2TopLevelDeclarations(pipeline);
    return {
        pipeline,
        ...collected,
    };
}
