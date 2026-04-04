import { childOfType, namedChildren } from "./stage-tree.js";

const STAGE2_SKIP_HEADER_WALK_NODE_TYPES = new Set([
    "block",
    "setup_decl",
    "measure_decl",
]);

const STAGE2_HEADER_REFERENCE_NODE_TYPES = new Set([
    "qualified_type_ref",
    "instantiated_module_ref",
    "inline_module_type_path",
    "module_ref",
]);

function stage2HeaderItemKey(node) {
    return `${node?.type ?? "unknown"}:${node?.startIndex ?? -1}:${node?.endIndex ?? -1}`;
}

function walkStage2HeaderItems(node, visit) {
    if (!node) return;
    if (node.type === "library_decl") {
        for (const child of namedChildren(node)) {
            walkStage2HeaderItems(child, visit);
        }
        return;
    }
    visit(node);
}

function walkStage2HeaderNodes(node, visit) {
    if (!node) return;
    visit(node);
    for (const child of namedChildren(node)) {
        if (STAGE2_SKIP_HEADER_WALK_NODE_TYPES.has(child.type)) continue;
        walkStage2HeaderNodes(child, visit);
    }
}

function collectStage2NamespaceReference(node) {
    if (!node) return null;
    if (node.type === "module_ref") return collectStage2NamespaceReference(namedChildren(node)[0] ?? node);
    if (node.type === "qualified_type_ref" || node.type === "inline_module_type_path") {
        return collectStage2NamespaceReference(namedChildren(node)[0] ?? node);
    }
    if (node.type === "instantiated_module_ref") return collectStage2NamespaceReference(namedChildren(node)[0] ?? node);
    return node.text ?? null;
}

function collectStage2HeaderTypeReferences(item) {
    const references = new Set();
    walkStage2HeaderNodes(item, (node) => {
        if (node.type === "type_ident") {
            references.add(node.text);
            return;
        }
        if (STAGE2_HEADER_REFERENCE_NODE_TYPES.has(node.type)) {
            references.add(collectStage2NamespaceReference(node));
        }
    });
    return [...references].filter(Boolean);
}

export async function runA20CollectHeaderReferences(context) {
    const referencesByItemKey = {};
    for (const item of namedChildren(context.tree ?? null)) {
        walkStage2HeaderItems(item, (headerItem) => {
            referencesByItemKey[stage2HeaderItemKey(headerItem)] = collectStage2HeaderTypeReferences(headerItem);
        });
    }
    return {
        referencesByItemKey,
    };
}
