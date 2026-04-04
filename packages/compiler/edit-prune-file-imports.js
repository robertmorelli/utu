import { runExpansionDropNodeTypesRewrite } from "./expansion-rewrite-pass.js";

// remove file import declarations once expansion has materialized imported declarations.
export async function runPruneFileImports(context) {
    return runExpansionDropNodeTypesRewrite("prune-file-imports", context, ["file_import_decl"], {
        useRewritePlan: true,
    });
}
