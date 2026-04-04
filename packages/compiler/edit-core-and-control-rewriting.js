import { cloneStageTree } from "./compiler-stage-runtime.js";

// preserve a final expression-rewrite boundary before the cleanup/prune passes.
export async function runRewriteCoreControl(context) {
    return {
        tree: cloneStageTree(context.tree),
    };
}
