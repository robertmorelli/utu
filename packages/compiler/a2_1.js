import { spanFromNode } from "../document/index.js";
import { childOfType, namedChildren } from "./a1_4.js";
import { analyzeSourceLayout } from "./a1_5.js";
import { headerItemKey } from "./a2_0.js";

// TODO(architecture): SCARY: this analysis pass stacks a2.0/a1.5 facts and still does its own header walks.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

// a2.1 Discover Declarations:
// inventory modules, imports, constructs, and other expansion-relevant declarations.
export async function runA21DiscoverDeclarations(context) {
    const parsed = context.artifacts.parse ?? null;
    const root = parsed?.legacyTree?.rootNode ?? context.legacyTree?.rootNode ?? context.tree ?? null;
    const document = parsed?.document ?? context.analyses["a1.1"]?.document ?? null;
    const syntaxDiagnostics = (parsed?.diagnostics ?? []).map(cloneDiagnostic);
    const headerReferences = context.analyses["a2.0"] ?? null;
    const sourceLayout = context.analyses["a1.5"] ?? analyzeSourceLayout(root);
    return {
        header: collectHeaderSnapshot(root, document, headerReferences, sourceLayout),
        syntaxDiagnostics,
    };
}

export function collectHeaderSnapshot(rootNode, document, headerReferences = null, sourceLayout = null) {
    if (!rootNode || !document) {
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
    const layout = sourceLayout ?? analyzeSourceLayout(rootNode);
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
    for (const item of namedChildren(rootNode)) {
        collectHeaderItem(item, document, header, layout, headerReferences);
    }
    header.references = [...new Set(header.references.filter(Boolean))];
    return header;
}

function collectHeaderItem(item, document, header, layout, headerReferences) {
    if (item.type === "library_decl") {
        for (const child of namedChildren(item)) {
            collectHeaderItem(child, document, header, layout, headerReferences);
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
        const references = collectHeaderTypeReferences(item, headerReferences);
        header.references.push(...references.filter((name) => name !== moduleNode?.text));
        return;
    }
    if (item.type === "construct_decl") {
        const construct = collectConstructDeclaration(item);
        if (construct) {
            header.constructs.push(construct);
        }
        return;
    }
    if (item.type === "file_import_decl") {
        const fileImport = collectFileImportDeclaration(item);
        if (fileImport) {
            header.fileImports.push(fileImport);
        }
        return;
    }
    const symbol = collectTopLevelSymbol(item, document, {
        exported: item.type === "fn_decl" && layout.exports.some(({ exportName }) => exportName === functionExportName(item)),
    });
    if (symbol) {
        header.symbols.push(symbol);
        if (symbol.kind === "importFunction" || symbol.kind === "importValue") {
            header.imports.push({ name: symbol.name, kind: symbol.kind });
        }
    }
    header.references.push(...collectHeaderTypeReferences(item, headerReferences));
}

function collectTopLevelSymbol(item, document, { exported = false } = {}) {
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

function functionExportName(node) {
    const assocNode = childOfType(node, "associated_fn_name");
    if (assocNode) {
        const [ownerNode, memberNode] = namedChildren(assocNode);
        return ownerNode && memberNode ? `${ownerNode.text}.${memberNode.text}` : null;
    }
    return childOfType(node, "identifier")?.text ?? null;
}

function collectConstructDeclaration(item) {
    const nodes = namedChildren(item);
    if (nodes.length === 0) return null;
    const aliasNode = nodes.length > 1 ? nodes[0] : null;
    const targetNode = nodes.at(-1);
    const target = collectNamespaceReference(targetNode);
    if (!target) return null;
    return {
        alias: aliasNode?.type === "identifier" ? aliasNode.text : null,
        target,
    };
}

function collectFileImportDeclaration(item) {
    const sourceNode = childOfType(item, "imported_module_name");
    const captureNode = childOfType(item, "captured_module_name");
    const specifierNode = childOfType(item, "string_lit");
    const sourceModuleName = collectNamespaceReference(childOfType(sourceNode, "module_name") ?? sourceNode);
    const capturedModuleName = collectNamespaceReference(childOfType(captureNode, "module_name") ?? captureNode);
    if (!sourceModuleName || !specifierNode) return null;
    return {
        sourceModuleName,
        localName: capturedModuleName ?? sourceModuleName,
        capturedModuleName: capturedModuleName ?? null,
        specifier: specifierNode.text.slice(1, -1),
    };
}

function collectHeaderTypeReferences(item, headerReferences) {
    const cachedReferences = headerReferences?.referencesByItemKey?.[headerItemKey(item)];
    if (Array.isArray(cachedReferences)) {
        return cachedReferences;
    }

    const references = new Set();
    walkHeaderNodes(item, (node) => {
        if (node.type === "type_ident") {
            references.add(node.text);
        } else if (node.type === "qualified_type_ref" || node.type === "instantiated_module_ref" || node.type === "inline_module_type_path" || node.type === "module_ref") {
            references.add(collectNamespaceReference(node));
        }
    });
    return [...references].filter(Boolean);
}

function walkHeaderNodes(node, visit) {
    visit(node);
    for (const child of namedChildren(node)) {
        if (child.type === "block" || child.type === "setup_decl" || child.type === "measure_decl") {
            continue;
        }
        walkHeaderNodes(child, visit);
    }
}

function collectNamespaceReference(node) {
    if (!node) return null;
    if (node.type === "module_ref") return collectNamespaceReference(namedChildren(node)[0] ?? node);
    if (node.type === "qualified_type_ref" || node.type === "inline_module_type_path") return collectNamespaceReference(namedChildren(node)[0] ?? node);
    if (node.type === "instantiated_module_ref") return collectNamespaceReference(namedChildren(node)[0] ?? node);
    return node.text ?? null;
}

function cloneDiagnostic(diagnostic) {
    return {
        ...diagnostic,
        range: copyRange(diagnostic.range),
        offsetRange: diagnostic.offsetRange ? { ...diagnostic.offsetRange } : undefined,
    };
}

function copyRange(range) {
    return range ? {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
    } : range;
}
