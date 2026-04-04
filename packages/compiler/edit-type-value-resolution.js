import { cloneStageTree } from "./compiler-stage-runtime.js";

// reserve a dedicated expression-resolution pass boundary ahead of later syntax pruning.
export async function runRewriteTypeValues(context) {
    return {
        tree: cloneStageTree(context.tree),
    };
}
