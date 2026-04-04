import { runEmptyAnalysisPass } from "./a1_1.js";

// TODO(architecture): SCARY: this analysis pass depends on a3.4 and still performs another tree walk for metrics.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

// a4.1 Collect Lowering Metadata:
// gather tree-walked lowering metadata and backend input options for e4.1.
export async function runA41CollectLoweringMetadata(context) {
    runEmptyAnalysisPass("a4.1", context);
    const check = context.analyses["a3.4"] ?? {};
    const intent = check.intent ?? context.options?.intent ?? "compile";
    const target = check.target ?? context.options?.mode ?? "program";
    const stageTree = context.tree ?? null;
    return {
        shouldLower: intent === "compile",
        backendOptions: {
            mode: target,
            profile: context.options?.profile ?? null,
            targetName: context.options?.targetName ?? null,
            plan: check.plan ?? null,
        },
        stageTreeMetrics: collectTreeMetrics(stageTree),
    };
}

function collectTreeMetrics(tree) {
    const byType = new Map();
    let totalNodes = 0;
    walkTree(tree, (node) => {
        totalNodes += 1;
        const count = byType.get(node.type) ?? 0;
        byType.set(node.type, count + 1);
    });
    return {
        totalNodes,
        distinctTypes: byType.size,
    };
}

function walkTree(node, visit) {
    if (!node) return;
    visit(node);
    for (const child of node.children ?? []) {
        walkTree(child, visit);
    }
}
