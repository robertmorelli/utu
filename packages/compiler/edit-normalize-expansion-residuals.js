import { runStage2DropNodeTypesRewrite } from "./expansion-rewrite-pass.js";

// e2.11 Normalize Expansion Residuals:
// prune known residual syntax forms using the stage-2 rewrite walk plan.
export async function runE211NormalizeExpansionResiduals(context) {
    return runStage2DropNodeTypesRewrite("e2.11", context, [], {
        useRewritePlan: true,
    });
}
