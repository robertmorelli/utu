import { collectParseDiagnostics } from "../document/index.js";
import { parseTree } from "../document/tree-sitter.js";
import { cloneLegacyNode } from "./e1_2.js";
import { cloneStageTree } from "./stage1.js";

export async function runDuplicateRewritePass(_passName, context) {
    return cloneStageTree(context.tree);
}

export function rewriteStageTree(tree, visit) {
    function walk(node) {
        const rewrittenChildren = Array.from(node.children ?? [], walk).filter(Boolean);
        const cloned = { ...node, children: rewrittenChildren };
        const replacement = visit?.(cloned);
        return replacement ?? cloned;
    }
    return tree ? walk(tree) : null;
}

export async function runTreeWalkRewritePass(_passName, context, visit) {
    return rewriteStageTree(context.tree, visit);
}

// e2.5 Expand Declarations:
// rewrite module-owned declarations into canonical top-level declaration forms.
export async function runE25ExpandDeclarations(context) {
    const expansion = context.analyses["a2.14"] ?? context.analyses["a2.6"] ?? null;
    if (!expansion) {
        throw new Error("e2.5 requires declaration expansion analysis (a2.14 or legacy a2.6). Run Stage 2 analysis passes before rewrites.");
    }
    // Full-tree rewrite contract: always parse and rewrite the entire tree from output source.
    const rewrittenSource = expansion.source;
    const parsed = parseTree(context.parser, rewrittenSource, "Tree-sitter returned no syntax tree for the rewritten document.");
    const diagnostics = collectParseDiagnostics(parsed.tree.rootNode, rewrittenSource);
    const expandedStageTree = rewriteStageTree(
        cloneLegacyNode(parsed.tree.rootNode),
        (node) => (node.type === "comment" ? null : node),
    );
    return {
        source: rewrittenSource,
        tree: expandedStageTree,
        legacyTree: parsed.tree,
        disposeLegacyTree: parsed.dispose,
        artifacts: {
            expansion: {
                ...expansion,
                diagnostics: [...(expansion.diagnostics ?? []), ...diagnostics],
            },
            expand: {
                changed: expansion.changed,
                source: rewrittenSource,
                legacyTree: parsed.tree,
            },
        },
    };
}
