import { collectNodeCounts } from "./header-reference-utils.js";

const REWRITE_TARGETS = {
    "e2.7": ["comment"],
    "e2.8": ["construct_decl"],
    "e2.9": ["file_import_decl"],
    "e2.10": ["module_decl"],
    "e2.11": ["promoted_module_call_expr", "namespace_call_expr", "pipe_expr", "type_member_expr"],
    "e2.12": ["comment"],
};

// a2.10 Plan Rewrite Walks:
// build a cheap pass activation plan from expanded-tree syntax counts.
export async function runA210PlanRewriteWalks(context) {
    const allTargets = new Set(Object.values(REWRITE_TARGETS).flat());
    const counts = collectNodeCounts(context.tree, allTargets).byType;

    const rewritePlan = Object.entries(REWRITE_TARGETS).map(([pass, nodeTypes]) => ({
        pass,
        nodeTypes,
        nodeCount: nodeTypes.reduce((sum, type) => sum + (counts[type] ?? 0), 0),
    })).map((entry) => ({
        ...entry,
        active: entry.nodeCount > 0,
    }));

    return {
        targetCounts: counts,
        rewritePlan,
    };
}
