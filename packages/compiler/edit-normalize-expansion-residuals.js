import { runExpansionDropNodeTypesRewrite } from "./expansion-rewrite-pass.js";

// prune known residual syntax forms using the expansion cleanup rewrite plan.
export async function runNormalizeExpansionResiduals(context) {
    return runExpansionDropNodeTypesRewrite("normalize-expansion-residuals", context, [], {
        useRewritePlan: true,
    });
}
