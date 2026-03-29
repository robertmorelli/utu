import { DEFAULT_GRAMMAR_WASM, DEFAULT_RUNTIME_WASM } from '../../document/default-wasm.js';
import { analyzeSourceLayout } from '../shared/compile-plan.js';
import {
    UtuParserService,
    collectParseDiagnostics,
    createSourceDocument,
    spanFromNode,
} from '../../document/index.js';
import { childOfType, namedChildren } from '../frontend/tree.js';

const bundledGrammarWasm = DEFAULT_GRAMMAR_WASM;
const bundledRuntimeWasm = DEFAULT_RUNTIME_WASM;

/**
 * @typedef {'editor' | 'validation' | 'compile'} AnalyzeMode
 */

/**
 * @typedef {Object} AnalyzeOptions
 * @property {AnalyzeMode} [mode]
 * @property {string} [uri]
 * @property {string} sourceText
 * @property {number} [version]
 * @property {UtuParserService} [parserService]
 * @property {UtuLanguageService} [languageService]
 * @property {Function | null} [validateWat]
 * @property {string | URL | Uint8Array | ArrayBuffer} [grammarWasmPath]
 * @property {string | URL | Uint8Array | ArrayBuffer} [runtimeWasmPath]
 */

/**
 * @typedef {Object} AnalyzeResult
 * @property {AnalyzeMode} mode
 * @property {string} uri
 * @property {string} sourceText
 * @property {Object} syntax
 * @property {Object} header
 * @property {Object | null} body
 * @property {Array<Object>} diagnostics
 */

/**
 * Parses a UTU source document and returns syntax/header snapshots without
 * requiring the shared semantic language service.
 *
 * @param {AnalyzeOptions} options
 * @returns {Promise<Pick<AnalyzeResult, 'mode' | 'uri' | 'sourceText' | 'syntax' | 'header' | 'body' | 'diagnostics'>>}
 */
export async function analyzeSyntaxAndHeader(options) {
    const {
        mode = 'editor',
        uri = 'memory://utu',
        sourceText,
        version = 0,
        parserService: providedParserService,
        grammarWasmPath = bundledGrammarWasm,
        runtimeWasmPath = bundledRuntimeWasm,
    } = options;
    const ownsParserService = !providedParserService;
    const parserService = providedParserService ?? new UtuParserService({
        grammarWasmPath,
        runtimeWasmPath,
    });
    const document = createSourceDocument(sourceText, { uri, version });
    let parsedTree;
    try {
        parsedTree = await parserService.parseSource(sourceText);
        const rootNode = parsedTree.tree.rootNode;
        const syntaxDiagnostics = collectParseDiagnostics(rootNode, document).map(cloneDiagnostic);
        return {
            mode,
            uri,
            sourceText,
            syntax: createSyntaxSnapshot(rootNode, syntaxDiagnostics),
            header: collectHeaderSnapshot(rootNode, document),
            body: null,
            diagnostics: syntaxDiagnostics,
        };
    } finally {
        parsedTree?.dispose();
        if (ownsParserService) parserService.dispose();
    }
}

/**
 * Analyzes a UTU source document.
 *
 * Shared analysis entrypoint:
 * - all modes use the tolerant parser/document pipeline
 * - `editor` mode keeps backend validation off the hot path
 * - `compile` mode is the strict consumer-facing mode layered on the same snapshots
 *
 * @param {AnalyzeOptions} options
 * @returns {Promise<AnalyzeResult>}
 */
export async function analyzeDocument(options) {
    const {
        mode = 'editor',
        uri = 'memory://utu',
        sourceText,
        version = 0,
        parserService,
        languageService,
        validateWat: _validateWat = null,
        grammarWasmPath = bundledGrammarWasm,
        runtimeWasmPath = bundledRuntimeWasm,
    } = options;
    const result = await analyzeSyntaxAndHeader({
        mode,
        uri,
        sourceText,
        version,
        parserService,
        grammarWasmPath,
        runtimeWasmPath,
    });
    if (!languageService) {
        return result;
    }
    const document = createSourceDocument(sourceText, { uri, version });
    const index = await languageService.getDocumentIndex(document, { mode });
    result.header = hydrateHeaderSnapshot(result.header, index);
    result.body = {
        kind: 'body',
        documentIndex: index,
        symbols: index.symbols.map(cloneSymbol),
        topLevelSymbols: index.topLevelSymbols.map(cloneSymbol),
        occurrences: index.occurrences.map(cloneOccurrence),
    };
    result.diagnostics = index.diagnostics.map(cloneDiagnostic);
    return result;
}

function hydrateHeaderSnapshot(shallowHeader, index) {
    const symbols = index.topLevelSymbols.map(cloneSymbol);
    return {
        ...shallowHeader,
        kind: 'header',
        imports: symbols
            .filter((symbol) => symbol.kind === 'importFunction' || symbol.kind === 'importValue')
            .map(({ name, kind, signature, typeText }) => ({ name, kind, signature, typeText })),
        fileImports: shallowHeader.fileImports,
        exports: symbols
            .filter((symbol) => symbol.exported)
            .map(({ name, kind, signature }) => ({ name, kind, signature })),
        symbols,
        modules: shallowHeader.modules,
        constructs: shallowHeader.constructs,
        references: shallowHeader.references,
        tests: symbols.filter((symbol) => symbol.kind === 'test').map(({ name }) => ({ name })),
        benches: symbols.filter((symbol) => symbol.kind === 'bench').map(({ name }) => ({ name })),
        hasMain: shallowHeader.hasMain,
        hasLibrary: shallowHeader.hasLibrary,
        sourceKind: shallowHeader.sourceKind,
    };
}

function createSyntaxSnapshot(rootNode, diagnostics) {
    return {
        kind: 'syntax',
        tree: null,
        rootType: rootNode.type,
        treeString: rootNode.toString(),
        diagnostics,
    };
}

export function collectHeaderSnapshot(rootNode, document) {
    const layout = analyzeSourceLayout(rootNode);
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
        collectHeaderItem(item, document, header, layout, false);
    header.references = [...new Set(header.references.filter(Boolean))];
    return header;
}

function collectHeaderItem(item, document, header, layout, inLibrary) {
    if (item.type === 'library_decl') {
        for (const child of namedChildren(item))
            collectHeaderItem(child, document, header, layout, true);
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
    if (item.type === 'import_decl' || item.type === 'jsgen_decl') {
        const nameNode = childOfType(item, 'identifier');
        const returnTypeNode = childOfType(item, 'return_type');
        const typeNode = item.namedChildren.at(-1);
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

function cloneDiagnostic(diagnostic) {
    return {
        ...diagnostic,
        range: copyRange(diagnostic.range),
        offsetRange: diagnostic.offsetRange ? { ...diagnostic.offsetRange } : undefined,
    };
}

function cloneSymbol(symbol) {
    return {
        ...symbol,
        range: copyRange(symbol.range),
        offsetRange: symbol.offsetRange ? { ...symbol.offsetRange } : undefined,
    };
}

function cloneOccurrence(occurrence) {
    return {
        ...occurrence,
        range: copyRange(occurrence.range),
        offsetRange: occurrence.offsetRange ? { ...occurrence.offsetRange } : undefined,
    };
}

function copyRange(range) {
    return range ? {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
    } : range;
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
