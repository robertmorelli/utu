import { analyzeSourceLayout } from "./source-layout.js";
import { childOfType, namedChildren, rootNode } from "./stage-tree.js";

function describeTopLevelSymbol(node) {
    if (node.type === "fn_decl") {
        const assocNode = childOfType(node, "associated_fn_name");
        if (assocNode) {
            const [ownerNode, memberNode] = namedChildren(assocNode);
            if (!ownerNode || !memberNode) return null;
            return {
                name: `${ownerNode.text}.${memberNode.text}`,
                kind: "function",
                exported: false,
            };
        }
        const nameNode = childOfType(node, "identifier");
        if (!nameNode) return null;
        return {
            name: nameNode.text,
            kind: "function",
            exported: nameNode.text === "main",
        };
    }
    if (node.type === "global_decl") {
        const nameNode = childOfType(node, "identifier");
        return nameNode ? { name: nameNode.text, kind: "global", exported: false } : null;
    }
    if (node.type === "jsgen_decl") {
        const nameNode = childOfType(node, "identifier");
        return nameNode ? { name: nameNode.text, kind: "import", exported: false } : null;
    }
    if (node.type === "struct_decl") {
        const nameNode = childOfType(node, "type_ident");
        return nameNode ? { name: nameNode.text, kind: "struct", exported: false } : null;
    }
    if (node.type === "type_decl") {
        const nameNode = childOfType(node, "type_ident");
        return nameNode ? { name: nameNode.text, kind: "sumType", exported: false } : null;
    }
    if (node.type === "proto_decl") {
        const nameNode = childOfType(node, "type_ident");
        return nameNode ? { name: nameNode.text, kind: "protocol", exported: false } : null;
    }
    return null;
}

function collectTopLevelSymbol(node, symbols, symbolsByName) {
    if (!node || typeof node !== "object") return;
    const symbol = describeTopLevelSymbol(node);
    if (!symbol) return;
    symbols.push(symbol);
    symbolsByName[symbol.name] = symbol;
}

export function runAnalyzeIndexSymbolsAndDeclarations(context) {
    const root = rootNode(context?.tree ?? null);
    const layout = analyzeSourceLayout(root);
    const symbols = [];
    const symbolsByName = {};

    for (const item of namedChildren(root)) {
        if (item.type === "library_decl") {
            for (const child of namedChildren(item)) {
                collectTopLevelSymbol(child, symbols, symbolsByName);
            }
            continue;
        }
        collectTopLevelSymbol(item, symbols, symbolsByName);
    }

    return {
        layout,
        symbols,
        symbolsByName,
    };
}
