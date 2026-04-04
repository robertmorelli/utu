import { analyzeSourceLayout } from "./source-layout.js";
import { spanFromNode } from "../document/index.js";
import {
    rootNode,
    namedChildren,
    childOfType,
    childrenOfType,
    hasAnon,
    walk,
    walkBlock,
    stringLiteralValue,
    findAnonBetween,
    throwOnParseErrors,
} from "./stage-tree.js";

// TODO(architecture): SCARY: this analysis pass reuses analyze-source-layout
// facts and then walks header trees again.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

// gather shallow header facts from the parsed syntax tree.
export async function runCollectHeaderSnapshot(context) {
    const parsed = context.artifacts.parse;
    const root = rootNode(parsed?.legacyTree ?? context.legacyTree ?? context.tree ?? parsed?.tree ?? null);
    const document = parsed?.document ?? context.analyses["load-source"]?.document ?? null;
    if (!root || !document) {
        return collectHeaderSnapshot(null, null);
    }
    return collectHeaderSnapshot(root, document, context.analyses["analyze-source-layout"] ?? analyzeSourceLayout(root));
}

export function collectHeaderSnapshot(rootNode, document, layout = analyzeSourceLayout(rootNode)) {
    if (!rootNode || !document) {
        return {
            kind: 'header',
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
            sourceKind: 'script',
        };
    }
    const header = {
        kind: 'header',
        imports: [],
        exports: layout.exports.map(({ name }) => ({ name, kind: 'function' })),
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
    for (const item of namedChildren(rootNode))
        collectHeaderItem(item, document, header, layout);
    header.references = [...new Set(header.references.filter(Boolean))];
    return header;
}

function collectHeaderItem(item, document, header, layout) {
    if (item.type === 'library_decl') {
        for (const child of namedChildren(item))
            collectHeaderItem(child, document, header, layout);
        return;
    }
    if (item.type === 'test_decl' || item.type === 'bench_decl') {
        const name = namedChildren(item)[0]?.text.slice(1, -1);
        if (!name)
            return;
        const kind = item.type === 'test_decl' ? 'test' : 'bench';
        header[kind === 'test' ? 'tests' : 'benches'].push({ name });
        header.symbols.push({
            name,
            kind,
            exported: false,
            uri: document.uri,
            ...spanFromNode(document, namedChildren(item)[0] ?? item),
        });
        return;
    }
    if (item.type === 'module_decl') {
        const moduleNode = childOfType(item, 'identifier') ?? childOfType(item, 'type_ident');
        if (moduleNode)
            header.modules.push({ name: moduleNode.text });
        header.references.push(...collectHeaderTypeReferences(item).filter((name) => name !== moduleNode?.text));
        return;
    }
    if (item.type === 'construct_decl') {
        const construct = collectConstructDeclaration(item);
        if (construct)
            header.constructs.push(construct);
        return;
    }
    if (item.type === 'file_import_decl') {
        const fileImport = collectFileImportDeclaration(item);
        if (fileImport)
            header.fileImports.push(fileImport);
        return;
    }
    const symbol = collectTopLevelSymbol(item, document, {
        exported: item.type === 'fn_decl' && layout.exports.some(({ exportName }) => exportName === functionExportName(item)),
    });
    if (symbol) {
        header.symbols.push(symbol);
        if (symbol.kind === 'importFunction' || symbol.kind === 'importValue') {
            header.imports.push({ name: symbol.name, kind: symbol.kind });
        }
    }
    header.references.push(...collectHeaderTypeReferences(item));
}

function collectTopLevelSymbol(item, document, { exported = false } = {}) {
    if (item.type === 'fn_decl') {
        const assocNode = childOfType(item, 'associated_fn_name');
        if (assocNode) {
            const [ownerNode, memberNode] = namedChildren(assocNode);
            return ownerNode && memberNode
                ? { name: `${ownerNode.text}.${memberNode.text}`, kind: 'function', exported, uri: document.uri, ...spanFromNode(document, memberNode) }
                : null;
        }
        const nameNode = childOfType(item, 'identifier');
        return nameNode ? { name: nameNode.text, kind: 'function', exported, uri: document.uri, ...spanFromNode(document, nameNode) } : null;
    }
    if (item.type === 'global_decl') {
        const nameNode = childOfType(item, 'identifier');
        return nameNode ? { name: nameNode.text, kind: 'global', exported: false, uri: document.uri, ...spanFromNode(document, nameNode) } : null;
    }
    if (item.type === 'jsgen_decl') {
        const nameNode = childOfType(item, 'identifier');
        const returnTypeNode = childOfType(item, 'return_type');
        if (!nameNode) return null;
        return {
            name: nameNode.text,
            kind: returnTypeNode ? 'importFunction' : 'importValue',
            exported: false,
            uri: document.uri,
            ...spanFromNode(document, nameNode),
        };
    }
    if (item.type === 'struct_decl') {
        const nameNode = childOfType(item, 'type_ident');
        return nameNode ? { name: nameNode.text, kind: 'struct', exported: false, uri: document.uri, ...spanFromNode(document, nameNode) } : null;
    }
    if (item.type === 'type_decl') {
        const nameNode = childOfType(item, 'type_ident');
        return nameNode ? { name: nameNode.text, kind: 'sumType', exported: false, uri: document.uri, ...spanFromNode(document, nameNode) } : null;
    }
    if (item.type === 'proto_decl') {
        const nameNode = childOfType(item, 'type_ident');
        return nameNode ? { name: nameNode.text, kind: 'protocol', exported: false, uri: document.uri, ...spanFromNode(document, nameNode) } : null;
    }
    return null;
}

function functionExportName(node) {
    const assocNode = childOfType(node, 'associated_fn_name');
    if (assocNode) {
        const [ownerNode, memberNode] = namedChildren(assocNode);
        return ownerNode && memberNode ? `${ownerNode.text}.${memberNode.text}` : null;
    }
    return childOfType(node, 'identifier')?.text ?? null;
}

function collectConstructDeclaration(item) {
    const nodes = namedChildren(item);
    if (nodes.length === 0)
        return null;
    const aliasNode = nodes.length > 1 ? nodes[0] : null;
    const targetNode = nodes.at(-1);
    const target = collectNamespaceReference(targetNode);
    if (!target)
        return null;
    return {
        alias: aliasNode?.type === 'identifier' ? aliasNode.text : null,
        target,
    };
}

function collectFileImportDeclaration(item) {
    const sourceNode = childOfType(item, 'imported_module_name');
    const captureNode = childOfType(item, 'captured_module_name');
    const specifierNode = childOfType(item, 'string_lit');
    const sourceModuleName = collectNamespaceReference(childOfType(sourceNode, 'module_name') ?? sourceNode);
    const capturedModuleName = collectNamespaceReference(childOfType(captureNode, 'module_name') ?? captureNode);
    if (!sourceModuleName || !specifierNode)
        return null;
    return {
        sourceModuleName,
        localName: capturedModuleName ?? sourceModuleName,
        capturedModuleName: capturedModuleName ?? null,
        specifier: specifierNode.text.slice(1, -1),
    };
}

function collectHeaderTypeReferences(item) {
    const references = new Set();
    walkHeaderNodes(item, (node) => {
        if (node.type === 'type_ident')
            references.add(node.text);
        else if (node.type === 'qualified_type_ref' || node.type === 'instantiated_module_ref' || node.type === 'inline_module_type_path' || node.type === 'module_ref')
            references.add(collectNamespaceReference(node));
    });
    return [...references].filter(Boolean);
}

function walkHeaderNodes(node, visit) {
    visit(node);
    for (const child of namedChildren(node)) {
        if (child.type === 'block' || child.type === 'setup_decl' || child.type === 'measure_decl')
            continue;
        walkHeaderNodes(child, visit);
    }
}

function collectNamespaceReference(node) {
    if (!node)
        return null;
    if (node.type === 'module_ref')
        return collectNamespaceReference(namedChildren(node)[0] ?? node);
    if (node.type === 'qualified_type_ref' || node.type === 'inline_module_type_path')
        return collectNamespaceReference(namedChildren(node)[0] ?? node);
    if (node.type === 'instantiated_module_ref')
        return collectNamespaceReference(namedChildren(node)[0] ?? node);
    return node.text ?? null;
}

export {
    rootNode,
    namedChildren,
    childOfType,
    childrenOfType,
    hasAnon,
    walk,
    walkBlock,
    stringLiteralValue,
    findAnonBetween,
    throwOnParseErrors,
};
