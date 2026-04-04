import { runEmptyAnalysisPass } from "./analysis-pass-utils.js";
import { readCompilerStageBundle } from "./compiler-stage-runtime.js";

function walkTree(node, visit) {
    if (!node) return;
    visit(node);
    for (const child of node.children ?? []) {
        walkTree(child, visit);
    }
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

export async function runAnalyzeCollectLoweringMetadata(context) {
    runEmptyAnalysisPass("collect-lowering-metadata", context);
    const semanticsStage = readCompilerStageBundle(context, "semantics");
    const compilePlan = semanticsStage?.compilePlan ?? context.analyses["plan-compile"] ?? {};
    const intent = compilePlan.intent ?? context.options?.intent ?? "compile";
    const target = compilePlan.target ?? context.options?.mode ?? "program";
    return {
        shouldLower: intent === "compile",
        backendOptions: {
            mode: target,
            profile: context.options?.profile ?? null,
            targetName: context.options?.targetName ?? null,
            plan: compilePlan.plan ?? null,
        },
        stageTreeMetrics: collectTreeMetrics(context.tree ?? null),
    };
}
