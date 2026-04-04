import { runTreeWalkAnalysisPass } from "./a1_1.js";
import { analyzeSourceLayout } from "./a1_5.js";
import { childOfType, namedChildren, rootNode } from "./a1_4.js";

// TODO(architecture): SCARY: this pass computes layout and symbols in separate walks from one file.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

export function runStage3IndexPass(context) {
    const root = rootNode(context?.tree ?? null);
    const layout = analyzeSourceLayout(root);
    const symbols = [];
    const symbolsByName = {};

    runTreeWalkAnalysisPass("a3.1", { tree: root }, {
        shouldDescend: () => false,
        visit: (node) => {
            if (node?.type === "library_decl") {
                for (const child of namedChildren(node)) {
                    collectStage3Symbol(child, symbols, symbolsByName);
                }
                return;
            }
            collectStage3Symbol(node, symbols, symbolsByName);
        },
    });

    return {
        layout,
        symbols,
        symbolsByName,
    };
}

// a3.1 Index:
// collect top-level symbol declarations and source layout facts for semantic passes.
export async function runA31Index(context) {
    return runStage3IndexPass(context);
}

function collectStage3Symbol(node, symbols, symbolsByName) {
    if (!node || typeof node !== "object") return;
    const symbol = describeStage3Symbol(node);
    if (!symbol) return;
    symbols.push(symbol);
    symbolsByName[symbol.name] = symbol;
}

function describeStage3Symbol(node) {
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
