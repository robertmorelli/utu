import { childOfType, namedChildren } from "./stage-tree.js";

const HEADER_WALK_SKIP_NODE_TYPES = new Set([
    "block",
    "setup_decl",
    "measure_decl",
]);

const HEADER_REFERENCE_NODE_TYPES = new Set([
    "qualified_type_ref",
    "instantiated_module_ref",
    "inline_module_type_path",
    "module_ref",
]);

function headerItemKey(node) {
    return `${node?.type ?? "unknown"}:${node?.startIndex ?? -1}:${node?.endIndex ?? -1}`;
}

function walkHeaderItems(node, visit) {
    if (!node) return;
    if (node.type === "library_decl") {
        for (const child of namedChildren(node)) {
            walkHeaderItems(child, visit);
        }
        return;
    }
    visit(node);
}

function walkHeaderNodes(node, visit) {
    if (!node) return;
    visit(node);
    for (const child of namedChildren(node)) {
        if (HEADER_WALK_SKIP_NODE_TYPES.has(child.type)) continue;
        walkHeaderNodes(child, visit);
    }
}

function collectNamespaceReference(node) {
    if (!node) return null;
    if (node.type === "module_ref") return collectNamespaceReference(namedChildren(node)[0] ?? node);
    if (node.type === "qualified_type_ref" || node.type === "inline_module_type_path") {
        return collectNamespaceReference(namedChildren(node)[0] ?? node);
    }
    if (node.type === "instantiated_module_ref") return collectNamespaceReference(namedChildren(node)[0] ?? node);
    return node.text ?? null;
}

function collectHeaderTypeReferences(item) {
    const references = new Set();
    walkHeaderNodes(item, (node) => {
        if (node.type === "type_ident") {
            references.add(node.text);
            return;
        }
        if (HEADER_REFERENCE_NODE_TYPES.has(node.type)) {
            references.add(collectNamespaceReference(node));
        }
    });
    return [...references].filter(Boolean);
}

export async function runCollectHeaderReferences(context) {
    const referencesByItemKey = {};
    for (const item of namedChildren(context.tree ?? null)) {
        walkHeaderItems(item, (headerItem) => {
            referencesByItemKey[headerItemKey(headerItem)] = collectHeaderTypeReferences(headerItem);
        });
    }
    return {
        referencesByItemKey,
    };
}
