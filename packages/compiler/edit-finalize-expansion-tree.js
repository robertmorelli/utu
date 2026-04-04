import { runStage2CommentStripRewrite } from "./expansion-rewrite-pass.js";

// e2.12 Finalize Expansion Tree:
// enforce a final comment-free expanded tree contract for stage 3.
export async function runE212FinalizeExpansionTree(context) {
    return runStage2CommentStripRewrite("e2.12", context);
}
