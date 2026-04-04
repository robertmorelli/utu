import { cloneStageTree } from "./compiler-stage-runtime.js";

// e2.6.2 Call and Pipe Rewriting:
// keep call/pipe rewriting as an explicit Stage-2 pass even when it is currently a no-op.
export async function runE262CallPipeRewriting(context) {
    return {
        tree: cloneStageTree(context.tree),
    };
}
