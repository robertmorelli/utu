import { cloneStageTree } from "./compiler-stage-runtime.js";

export async function runDuplicateRewritePass(_passName, context) {
    return cloneStageTree(context.tree);
}

export function rewriteStageTree(tree, visit) {
    function walk(node) {
        const rewrittenChildren = Array.from(node.children ?? [], walk).filter(Boolean);
        const cloned = {
            ...node,
            children: rewrittenChildren,
            namedChildren: rewrittenChildren.filter((child) => child?.isNamed),
        };
        const replacement = visit?.(cloned);
        return replacement ?? cloned;
    }
    return tree ? walk(tree) : null;
}

export async function runTreeWalkRewritePass(_passName, context, visit) {
    return rewriteStageTree(context.tree, visit);
}
