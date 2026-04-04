import { collectNodeCounts } from "./a2_0.js";

const EXPANSION_SYNTAX_NODES = new Set([
    "module_decl",
    "construct_decl",
    "file_import_decl",
    "promoted_module_call_expr",
    "namespace_call_expr",
    "pipe_expr",
    "type_member_expr",
]);

const RESIDUAL_MODULE_DECLARATION_NODES = [
    "module_decl",
    "construct_decl",
    "file_import_decl",
];

// a2.7 Index Expanded Tree:
// inventory post-e2.5 expansion syntax nodes and detect residual module declarations.
export async function runA27IndexExpandedTree(context) {
    const counts = collectNodeCounts(context.tree, EXPANSION_SYNTAX_NODES);
    const residualModuleSyntaxCount = RESIDUAL_MODULE_DECLARATION_NODES
        .reduce((sum, type) => sum + (counts.byType[type] ?? 0), 0);
    return {
        totalNodes: counts.totalNodes,
        syntaxNodeCounts: counts.byType,
        residualModuleSyntaxCount,
        hasResidualModuleSyntax: residualModuleSyntaxCount > 0,
    };
}
