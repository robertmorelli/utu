import { collectNodeCounts } from "./header-reference-utils.js";

const REWRITE_TARGETS = {
    "normalize-post-expansion": ["comment"],
    "prune-construct-declarations": ["construct_decl"],
    "prune-file-imports": ["file_import_decl"],
    "prune-module-declarations": ["module_decl"],
    "normalize-expansion-residuals": ["promoted_module_call_expr", "namespace_call_expr", "pipe_expr", "type_member_expr"],
    "finalize-expansion-tree": ["comment"],
};

// build a cheap pass activation plan from expanded-tree syntax counts.
export async function runPlanExpansionRewrites(context) {
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
