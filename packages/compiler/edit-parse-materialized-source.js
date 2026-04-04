import { collectParseDiagnostics } from "../document/index.js";
import { parseTree } from "../document/tree-sitter.js";
import { cloneLegacyNode } from "./legacy-parse.js";
import { rewriteStageTree } from "./rewrite-pass.js";

// TODO(architecture): SCARY: this rewrite pass reparses, re-diagnoses, and rewrites in one file.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

// parse the materialized expansion source back into the compiler tree format.
export async function runParseMaterializedSource(context) {
    const materialized = context.artifacts.expansionMaterializedSource ?? null;
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
