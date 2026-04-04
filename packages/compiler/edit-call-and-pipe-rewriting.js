import { cloneStageTree } from "./compiler-stage-runtime.js";

// keep call/pipe rewriting as an explicit rewrite step even when it is
// currently a no-op.
export async function runRewriteCallsAndPipes(context) {
    return {
        tree: cloneStageTree(context.tree),
    };
}
