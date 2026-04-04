import { runExpansionDropNodeTypesRewrite } from "./expansion-rewrite-pass.js";

// remove construct declarations after declaration expansion materialization.
export async function runPruneConstructDeclarations(context) {
    return runExpansionDropNodeTypesRewrite("prune-construct-declarations", context, ["construct_decl"], {
        useRewritePlan: true,
    });
}
