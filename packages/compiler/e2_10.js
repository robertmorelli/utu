import { runStage2DropNodeTypesRewrite } from "./e2_6.js";

// e2.10 Prune Module Declarations:
// remove module declaration containers from canonical expanded trees.
export async function runE210PruneModuleDeclarations(context) {
    return runStage2DropNodeTypesRewrite("e2.10", context, ["module_decl"], {
        useRewritePlan: true,
    });
}
