import { rewriteStageTree } from "./rewrite-pass.js";
import { snapshotCanonicalizedExpansion } from "./expansion-snapshot.js";

const CANONICALIZE_DROP_NODE_TYPES = new Set([
    "construct_decl",
    "file_import_decl",
    "module_decl",
    "promoted_module_call_expr",
    "namespace_call_expr",
    "pipe_expr",
    "type_member_expr",
]);

export async function runCanonicalizeExpandedTree(context) {
    const expansion = context.artifacts.expansion ?? null;
    const recovered = Boolean(expansion?.recovered);
    const tree = rewriteStageTree(context.tree, (node) => {
        if (node.type === "comment") return null;
        if (!recovered && CANONICALIZE_DROP_NODE_TYPES.has(node.type)) return null;
        return node;
    });
    return {
        tree,
        artifacts: {
            expansionCanonicalization: snapshotCanonicalizedExpansion(tree, { expansion }),
        },
    };
}
