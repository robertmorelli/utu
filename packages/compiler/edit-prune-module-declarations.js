import { runExpansionDropNodeTypesRewrite } from "./expansion-rewrite-pass.js";

// remove module declaration containers from canonical expanded trees.
export async function runPruneModuleDeclarations(context) {
    return runExpansionDropNodeTypesRewrite("prune-module-declarations", context, ["module_decl"], {
        useRewritePlan: true,
    });
}
