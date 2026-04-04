import { cloneStageTree } from "./stage1.js";

// e2.6.3 Core and Control Rewriting:
// preserve a final expression-rewrite boundary before the cleanup/prune passes.
export async function runE263CoreControlRewriting(context) {
    return {
        tree: cloneStageTree(context.tree),
    };
}
