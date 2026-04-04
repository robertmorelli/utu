import { spanFromNode } from "../document/index.js";
import { analyzeSourceLayout } from "./source-layout.js";
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

function cloneStage2Range(range) {
    return range ? {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
    } : range;
}

function cloneStage2Diagnostic(diagnostic) {
    return {
        ...diagnostic,
        range: cloneStage2Range(diagnostic.range),
        offsetRange: diagnostic.offsetRange ? { ...diagnostic.offsetRange } : undefined,
    };
}

function stage2HeaderItemKey(node) {
    return `${node?.type ?? "unknown"}:${node?.startIndex ?? -1}:${node?.endIndex ?? -1}`;
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

function collectStage2FileImportDeclaration(item) {
    const sourceNode = childOfType(item, "imported_module_name");
    const captureNode = childOfType(item, "captured_module_name");
    const specifierNode = childOfType(item, "string_lit");
    const sourceModuleName = collectStage2NamespaceReference(childOfType(sourceNode, "module_name") ?? sourceNode);
    const capturedModuleName = collectStage2NamespaceReference(childOfType(captureNode, "module_name") ?? captureNode);
    if (!sourceModuleName || !specifierNode) return null;
    return {
        sourceModuleName,
        localName: capturedModuleName ?? sourceModuleName,
        capturedModuleName: capturedModuleName ?? null,
        specifier: specifierNode.text.slice(1, -1),
    };
}

function collectStage2HeaderTypeReferences(item, headerReferences = null) {
    const cachedReferences = headerReferences?.referencesByItemKey?.[stage2HeaderItemKey(item)];
    if (Array.isArray(cachedReferences)) return cachedReferences;

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

function stage2FunctionExportName(node) {
    const assocNode = childOfType(node, "associated_fn_name");
    if (assocNode) {
        const [ownerNode, memberNode] = namedChildren(assocNode);
        return ownerNode && memberNode ? `${ownerNode.text}.${memberNode.text}` : null;
    }
    return childOfType(node, "identifier")?.text ?? null;
}

function collectStage2TopLevelSymbol(item, document, { exported = false } = {}) {
    if (item.type === "fn_decl") {
        const assocNode = childOfType(item, "associated_fn_name");
        if (assocNode) {
            const [ownerNode, memberNode] = namedChildren(assocNode);
            return ownerNode && memberNode
                ? { name: `${ownerNode.text}.${memberNode.text}`, kind: "function", exported, uri: document.uri, ...spanFromNode(document, memberNode) }
                : null;
        }
        const nameNode = childOfType(item, "identifier");
        return nameNode ? { name: nameNode.text, kind: "function", exported, uri: document.uri, ...spanFromNode(document, nameNode) } : null;
    }
    if (item.type === "global_decl") {
        const nameNode = childOfType(item, "identifier");
        return nameNode ? { name: nameNode.text, kind: "global", exported: false, uri: document.uri, ...spanFromNode(document, nameNode) } : null;
    }
    if (item.type === "jsgen_decl") {
        const nameNode = childOfType(item, "identifier");
        const returnTypeNode = childOfType(item, "return_type");
        if (!nameNode) return null;
        return {
            name: nameNode.text,
            kind: returnTypeNode ? "importFunction" : "importValue",
            exported: false,
            uri: document.uri,
            ...spanFromNode(document, nameNode),
        };
    }
    if (item.type === "struct_decl") {
        const nameNode = childOfType(item, "type_ident");
        return nameNode ? { name: nameNode.text, kind: "struct", exported: false, uri: document.uri, ...spanFromNode(document, nameNode) } : null;
    }
    if (item.type === "type_decl") {
        const nameNode = childOfType(item, "type_ident");
        return nameNode ? { name: nameNode.text, kind: "sumType", exported: false, uri: document.uri, ...spanFromNode(document, nameNode) } : null;
    }
    if (item.type === "proto_decl") {
        const nameNode = childOfType(item, "type_ident");
        return nameNode ? { name: nameNode.text, kind: "protocol", exported: false, uri: document.uri, ...spanFromNode(document, nameNode) } : null;
    }
    return null;
}

function collectStage2ConstructDeclaration(item) {
    const nodes = namedChildren(item);
    if (nodes.length === 0) return null;
    const aliasNode = nodes.length > 1 ? nodes[0] : null;
    const targetNode = nodes.at(-1);
    const target = collectStage2NamespaceReference(targetNode);
    if (!target) return null;
    return {
        alias: aliasNode?.type === "identifier" ? aliasNode.text : null,
        target,
    };
}

function collectStage2HeaderItem(item, document, header, layout, headerReferences) {
    if (item.type === "library_decl") {
        for (const child of namedChildren(item)) {
            collectStage2HeaderItem(child, document, header, layout, headerReferences);
        }
        return;
    }
    if (item.type === "test_decl" || item.type === "bench_decl") {
        const name = namedChildren(item)[0]?.text.slice(1, -1);
        if (!name) return;
        const kind = item.type === "test_decl" ? "test" : "bench";
        header[kind === "test" ? "tests" : "benches"].push({ name });
        header.symbols.push({
            name,
            kind,
            exported: false,
            uri: document.uri,
            ...spanFromNode(document, namedChildren(item)[0] ?? item),
        });
        return;
    }
    if (item.type === "module_decl") {
        const moduleNode = childOfType(item, "identifier") ?? childOfType(item, "type_ident");
        if (moduleNode) {
            header.modules.push({ name: moduleNode.text });
        }
        const references = collectStage2HeaderTypeReferences(item, headerReferences);
        header.references.push(...references.filter((name) => name !== moduleNode?.text));
        return;
    }
    if (item.type === "construct_decl") {
        const construct = collectStage2ConstructDeclaration(item);
        if (construct) header.constructs.push(construct);
        return;
    }
    if (item.type === "file_import_decl") {
        const fileImport = collectStage2FileImportDeclaration(item);
        if (fileImport) header.fileImports.push(fileImport);
        return;
    }

    const symbol = collectStage2TopLevelSymbol(item, document, {
        exported: item.type === "fn_decl"
            && layout.exports.some(({ exportName }) => exportName === stage2FunctionExportName(item)),
    });
    if (symbol) {
        header.symbols.push(symbol);
        if (symbol.kind === "importFunction" || symbol.kind === "importValue") {
            header.imports.push({ name: symbol.name, kind: symbol.kind });
        }
    }
    header.references.push(...collectStage2HeaderTypeReferences(item, headerReferences));
}

function emptyStage2Header() {
    return {
        kind: "header",
        imports: [],
        exports: [],
        symbols: [],
        modules: [],
        constructs: [],
        fileImports: [],
        references: [],
        tests: [],
        benches: [],
        hasMain: false,
        hasLibrary: false,
        sourceKind: "script",
    };
}

export async function runA21DiscoverDeclarations(context) {
    const parsed = context.artifacts.parse ?? null;
    const root = parsed?.legacyTree?.rootNode ?? context.legacyTree?.rootNode ?? context.tree ?? null;
    const document = parsed?.document ?? context.analyses["load-source"]?.document ?? null;
    const syntaxDiagnostics = (parsed?.diagnostics ?? []).map(cloneStage2Diagnostic);
    const headerReferences = context.analyses["collect-header-references"] ?? null;

    if (!root || !document) {
        return {
            header: emptyStage2Header(),
            syntaxDiagnostics,
        };
    }

    const layout = context.analyses["analyze-source-layout"] ?? analyzeSourceLayout(root);
    const header = {
        kind: "header",
        imports: [],
        exports: layout.exports.map(({ name }) => ({ name, kind: "function" })),
        symbols: [],
        modules: [],
        constructs: [],
        fileImports: [],
        references: [],
        tests: [],
        benches: [],
        hasMain: layout.hasMain,
        hasLibrary: layout.hasLibrary,
        sourceKind: layout.sourceKind,
    };

    for (const item of namedChildren(root)) {
        collectStage2HeaderItem(item, document, header, layout, headerReferences);
    }
    header.references = [...new Set(header.references.filter(Boolean))];

    return {
        header,
        syntaxDiagnostics,
    };
}
