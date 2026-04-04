import { childOfType, flattenTopLevelItems } from "./header-reference-utils.js";

const DECL_KIND_BY_NODE = {
    fn_decl: "function",
    global_decl: "global",
    jsgen_decl: "jsgen",
    struct_decl: "struct",
    type_decl: "type",
    proto_decl: "protocol",
};

function functionName(node) {
    const assocNode = childOfType(node, "associated_fn_name");
    if (assocNode) {
        const owner = childOfType(assocNode, "type_ident") ?? childOfType(assocNode, "identifier");
        const children = assocNode.children ?? [];
        const member = children.find((child) => child?.isNamed && child !== owner) ?? null;
        if (!owner || !member) return null;
        return `${owner.text}.${member.text}`;
    }
    return childOfType(node, "identifier")?.text ?? null;
}

function declarationName(node) {
    if (node.type === "fn_decl") return functionName(node);
    if (node.type === "jsgen_decl" || node.type === "global_decl") {
        return childOfType(node, "identifier")?.text ?? null;
    }
    if (node.type === "struct_decl" || node.type === "type_decl" || node.type === "proto_decl") {
        return childOfType(node, "type_ident")?.text ?? null;
    }
    return null;
}

// gather declaration names from the expanded tree for downstream collision checks.
export async function runIndexExpandedDeclarations(context) {
    const entries = [];
    const countsByKind = {};
    const names = new Map();

    for (const item of flattenTopLevelItems(context.tree)) {
        const kind = DECL_KIND_BY_NODE[item.type] ?? null;
        if (!kind) continue;
        const name = declarationName(item);
        if (!name) continue;
        entries.push({ kind, name, nodeType: item.type });
        countsByKind[kind] = (countsByKind[kind] ?? 0) + 1;
        names.set(name, (names.get(name) ?? 0) + 1);
    }

    const duplicates = [...names.entries()]
        .filter(([, count]) => count > 1)
        .map(([name, count]) => ({ name, count }));

    return {
        declarations: entries,
        declarationCount: entries.length,
        countsByKind,
        duplicates,
    };
}
