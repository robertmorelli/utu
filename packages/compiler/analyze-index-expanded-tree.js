import { collectNodeCounts } from "./header-reference-utils.js";

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

// inventory post-expansion syntax nodes and detect residual module declarations.
export async function runIndexExpandedTree(context) {
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
