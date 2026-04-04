import { collectParseDiagnostics } from "../document/index.js";
import { parseTree } from "../document/tree-sitter.js";
import { cloneLegacyNode } from "./legacy-parse.js";
import { rewriteStageTree } from "./rewrite-pass.js";

export async function runParseExpandedSource(context) {
    const materialized = context.analyses["expand"]?.materializedSource
        ?? context.artifacts.expansionMaterializedSource
        ?? null;
    const rewrittenSource = materialized?.source ?? context.source;
    const parsed = parseTree(context.parser, rewrittenSource, "Tree-sitter returned no syntax tree for the rewritten document.");
    const diagnostics = collectParseDiagnostics(parsed.tree.rootNode, rewrittenSource);
    const expandedStageTree = rewriteStageTree(
        cloneLegacyNode(parsed.tree.rootNode),
        (node) => (node.type === "comment" ? null : node),
    );
    return {
        source: rewrittenSource,
        legacyTree: parsed.tree,
        tree: expandedStageTree,
        disposeLegacyTree: parsed.dispose,
        artifacts: {
            expansionMaterializedSource: materialized,
            expansion: {
                ...(materialized ?? {}),
                diagnostics: [...(materialized?.diagnostics ?? []), ...diagnostics],
            },
            expand: {
                changed: Boolean(materialized?.changed),
                source: rewrittenSource,
            },
        },
    };
}
