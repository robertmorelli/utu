import { runTreeWalkAnalysisPass } from "./analysis-pass-utils.js";
import { namedChildren } from "./header-reference-utils.js";
import { analyzeSourceLayout } from "./source-layout.js";

// TODO(architecture): SCARY: this pass tree-walks for symbols and then runs a second layout analysis walk.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

function childOfType(node, type) {
    return namedChildren(node).find((child) => child.type === type) ?? null;
}

function functionExportName(node) {
    const assocNode = childOfType(node, "associated_fn_name");
    if (assocNode) {
        const [ownerNode, memberNode] = namedChildren(assocNode);
        return ownerNode && memberNode ? `${ownerNode.text}.${memberNode.text}` : null;
    }
    return childOfType(node, "identifier")?.text ?? null;
}

function collectTopLevelSymbol(item) {
    if (item.type === "fn_decl") {
        const name = functionExportName(item);
        return name ? { kind: "function", name, nodeType: item.type } : null;
    }
    if (item.type === "global_decl") {
        const name = childOfType(item, "identifier")?.text ?? null;
        return name ? { kind: "global", name, nodeType: item.type } : null;
    }
    if (item.type === "jsgen_decl") {
        const name = childOfType(item, "identifier")?.text ?? null;
        if (!name) return null;
        return {
            kind: childOfType(item, "return_type") ? "importFunction" : "importValue",
            name,
            nodeType: item.type,
        };
    }
    if (item.type === "struct_decl" || item.type === "type_decl" || item.type === "proto_decl") {
        const name = childOfType(item, "type_ident")?.text ?? null;
        return name ? { kind: item.type.replace("_decl", ""), name, nodeType: item.type } : null;
    }
    return null;
}

function collectLayoutFromItem(item, state) {
    const symbol = collectTopLevelSymbol(item);
    if (symbol) {
        state.symbols.push(symbol);
    }
}

function finalizeLayout(state, tree) {
    const layout = {
        ...analyzeSourceLayout(tree),
        symbols: state.symbols,
    };
    return {
        layout,
        symbols: layout.symbols,
        symbolsByName: new Map(layout.symbols.map((symbol) => [symbol.name, symbol])),
    };
}

// a2.13 Index Post-Expansion Layout:
// tree-walk finalized stage-2 syntax and cache declaration/layout facts for semantics.
export async function runA213IndexPostExpansionLayout(context) {
    return runTreeWalkAnalysisPass("a2.13", context, {
        initialState: () => ({
            symbols: [],
        }),
        childrenOf: namedChildren,
        root: context?.tree ?? null,
        visit: (node, { state, parent }) => {
            if (parent !== null) return;
            for (const item of namedChildren(node)) {
                if (item.type === "library_decl") {
                    for (const child of namedChildren(item)) {
                        collectLayoutFromItem(child, state);
                    }
                    continue;
                }
                collectLayoutFromItem(item, state);
            }
        },
        shouldDescend: () => false,
        finalize: (state) => finalizeLayout(state, context?.tree ?? null),
    });
}
