import { runStage2DropNodeTypesRewrite } from "./stage2-rewrite-pass.js";

// e2.8 Prune Construct Declarations:
// remove construct declarations after declaration expansion materialization.
export async function runE28PruneConstructDeclarations(context) {
    return runStage2DropNodeTypesRewrite("e2.8", context, ["construct_decl"], {
        useRewritePlan: true,
    });
}
