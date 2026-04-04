import { runTreeWalkAnalysisPass } from "./a1_1.js";

const EMPTY = [];

// TODO(architecture): SCARY: this pass fans out into one tree walk per header item instead of owning one walk.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

export function namedChildren(node) {
    return Array.from(node?.children ?? EMPTY).filter((child) => child?.isNamed !== false && child.type !== "comment");
}

export function childOfType(node, type) {
    return namedChildren(node).find((child) => child.type === type) ?? null;
}

export function walkStageTree(root, visit) {
    if (!root) return;
    visit(root);
    for (const child of root.children ?? EMPTY) {
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

const SKIP_HEADER_WALK_NODE_TYPES = new Set([
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

export function headerItemKey(node) {
    return `${node?.type ?? "unknown"}:${node?.startIndex ?? -1}:${node?.endIndex ?? -1}`;
}

function collectNamespaceReference(node) {
    if (!node) return null;
    if (node.type === "module_ref") {
        return collectNamespaceReference(namedChildren(node)[0] ?? node);
    }
    if (node.type === "qualified_type_ref" || node.type === "inline_module_type_path") {
        return collectNamespaceReference(namedChildren(node)[0] ?? node);
    }
    if (node.type === "instantiated_module_ref") {
        return collectNamespaceReference(namedChildren(node)[0] ?? node);
    }
    return node.text ?? null;
}

function collectHeaderTypeReferences(item) {
    return runTreeWalkAnalysisPass("a2.0", { tree: item }, {
        root: item,
        initialState: () => ({ references: new Set() }),
        childrenOf: namedChildren,
        shouldDescend: (node) => !SKIP_HEADER_WALK_NODE_TYPES.has(node.type),
        visit: (node, { state }) => {
            if (node.type === "type_ident") {
                state.references.add(node.text);
                return;
            }
            if (HEADER_REFERENCE_NODE_TYPES.has(node.type)) {
                state.references.add(collectNamespaceReference(node));
            }
        },
        finalize: ({ references }) => [...references].filter(Boolean),
    });
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

// a2.0 Collect Header References:
// tree-walk the Stage-2 input tree and cache header reference facts per item.
export async function runA20CollectHeaderReferences(context) {
    const referencesByItemKey = {};
    for (const item of namedChildren(context.tree)) {
        walkHeaderItems(item, (headerItem) => {
            referencesByItemKey[headerItemKey(headerItem)] = collectHeaderTypeReferences(headerItem);
        });
    }
    return {
        referencesByItemKey,
    };
}
