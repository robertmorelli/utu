import { childOfType, namedChildren } from "./stage-tree.js";

export { childOfType, namedChildren };

export function walkStageTree(root, visit) {
    if (!root) return;
    visit(root);
    for (const child of root.children ?? []) {
        walkStageTree(child, visit);
    }
}

export function flattenTopLevelItems(root) {
    const items = namedChildren(root);
    return items.flatMap((item) => item.type === "library_decl" ? namedChildren(item) : [item]);
}

export function collectNodeCounts(root, targetTypes = null) {
    const targets = targetTypes
        ? (targetTypes instanceof Set ? targetTypes : new Set(targetTypes))
        : null;
    const byType = {};
    let totalNodes = 0;

    walkStageTree(root, (node) => {
        totalNodes += 1;
        if (!targets || targets.has(node.type)) {
            byType[node.type] = (byType[node.type] ?? 0) + 1;
        }
    });

    if (targets) {
        for (const type of targets) {
            byType[type] = byType[type] ?? 0;
        }
    }

    return {
        totalNodes,
        byType,
    };
}
