import { runExpansionCommentStripRewrite } from "./expansion-rewrite-pass.js";

// enforce a final comment-free expanded tree contract for the semantic stages.
export async function runFinalizeExpansionTree(context) {
    return runExpansionCommentStripRewrite("finalize-expansion-tree", context);
}
