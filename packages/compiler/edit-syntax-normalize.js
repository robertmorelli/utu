function clonePoint(point) {
    return point
        ? { row: point.row, column: point.column }
        : null;
}

function normalizeStageNode(node) {
    return {
        type: node.type,
        text: node.text,
        isNamed: Boolean(node.isNamed),
        startIndex: node.startIndex ?? null,
        endIndex: node.endIndex ?? null,
        startPosition: clonePoint(node.startPosition),
        endPosition: clonePoint(node.endPosition),
        children: Array.from(node.children ?? [], normalizeStageNode).filter((child) => child.type !== "comment"),
    };
}

function normalizeStageTree(tree) {
    return tree ? normalizeStageNode(tree) : null;
}

// e1.3 Syntax Normalize:
// clean up raw parse output into a stable compiler-owned syntax tree shape.
export async function runE13SyntaxNormalize(context) {
    return normalizeStageTree(context.tree);
}
