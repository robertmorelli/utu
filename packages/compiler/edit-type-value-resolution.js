import { cloneStageTree } from "./stage1.js";

// e2.6.1 Type/Value Resolution Layer:
// reserve a dedicated expression-resolution pass boundary ahead of later syntax pruning.
export async function runE261TypeValueResolution(context) {
    return {
        tree: cloneStageTree(context.tree),
    };
}
