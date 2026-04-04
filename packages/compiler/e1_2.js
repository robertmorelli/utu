import { parseTree } from "../document/tree-sitter.js";

function clonePoint(point) {
    return point
        ? { row: point.row, column: point.column }
        : null;
}

export function cloneLegacyNode(node) {
    return {
        type: node.type,
        text: node.text,
        isNamed: Boolean(node.isNamed),
        startIndex: node.startIndex ?? null,
        endIndex: node.endIndex ?? null,
        startPosition: clonePoint(node.startPosition),
        endPosition: clonePoint(node.endPosition),
        children: Array.from(node.children ?? [], cloneLegacyNode),
    };
}

// e1.2 Parse:
export async function runE12Parse(context) {
    const load = context.analyses["a1.1"] ?? {};
    const parsed = parseTree(context.parser, load.source ?? context.source, "Tree-sitter returned no syntax tree for the document.");
    const document = load.document ?? null;
    return {
        source: load.source ?? context.source,
        uri: load.uri ?? context.uri ?? 'memory://utu',
        version: load.version ?? context.version ?? 0,
        document,
        disposeLegacyTree: parsed.dispose,
        tree: cloneLegacyNode(parsed.tree.rootNode),
    };
}
