import { runStage2DropNodeTypesRewrite } from "./e2_6.js";

// e2.9 Prune File Imports:
// remove file import declarations once expansion has materialized imported declarations.
export async function runE29PruneFileImports(context) {
    return runStage2DropNodeTypesRewrite("e2.9", context, ["file_import_decl"], {
        useRewritePlan: true,
    });
}
