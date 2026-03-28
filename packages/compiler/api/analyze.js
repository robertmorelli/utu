import bundledGrammarWasm from '../../../tree-sitter-utu.wasm';
import bundledRuntimeWasm from 'web-tree-sitter/web-tree-sitter.wasm';
import { UtuLanguageService, hasRunnableMain } from '../../language-platform/index.js';
import { UtuParserService, collectParseDiagnostics, createSourceDocument, spanFromNode } from '../../document/index.js';
import { childOfType, namedChildren } from '../frontend/tree.js';

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
 * Analyzes a UTU source document.
 *
 * Transitional shared analysis shim:
 * - all modes use the tolerant parser and legacy language service
 * - `editor` mode keeps backend validation off the hot path
 * - `compile` mode enables backend validation through the legacy path
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
        parserService: providedParserService,
        languageService: providedLanguageService,
        validateWat = null,
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
        const shallowHeader = collectShallowHeaderSnapshot(rootNode, document);
        const result = {
            mode,
            uri,
            sourceText,
            syntax: {
                kind: 'syntax',
                tree: null,
                rootType: rootNode.type,
                treeString: rootNode.toString(),
                diagnostics: syntaxDiagnostics,
            },
            header: shallowHeader,
            body: null,
            diagnostics: syntaxDiagnostics,
        };
        const ownsLanguageService = !providedLanguageService;
        const languageService = providedLanguageService ?? new UtuLanguageService(parserService, {
            validateWat: mode === 'compile' ? validateWat : null,
        });
        try {
            const index = await languageService.getDocumentIndex(document);
            result.header = hydrateHeaderSnapshot(shallowHeader, index);
            result.body = {
                kind: 'body',
                legacyIndex: index,
                symbols: index.symbols.map(cloneSymbol),
                topLevelSymbols: index.topLevelSymbols.map(cloneSymbol),
                occurrences: index.occurrences.map(cloneOccurrence),
            };
            result.diagnostics = index.diagnostics.map(cloneDiagnostic);
            return result;
        } finally {
            if (ownsLanguageService) languageService.dispose();
        }
    } finally {
        parsedTree?.dispose();
        if (ownsParserService) parserService.dispose();
    }
}

function hydrateHeaderSnapshot(shallowHeader, index) {
    const symbols = index.topLevelSymbols.map(cloneSymbol);
    return {
        ...shallowHeader,
        kind: 'header',
        imports: symbols
            .filter((symbol) => symbol.kind === 'importFunction' || symbol.kind === 'importValue')
            .map(({ name, kind, signature, typeText }) => ({ name, kind, signature, typeText })),
        exports: symbols
            .filter((symbol) => symbol.exported)
            .map(({ name, kind, signature }) => ({ name, kind, signature })),
        symbols,
        modules: shallowHeader.modules,
        constructs: shallowHeader.constructs,
        references: shallowHeader.references,
        tests: symbols.filter((symbol) => symbol.kind === 'test').map(({ name }) => ({ name })),
        benches: symbols.filter((symbol) => symbol.kind === 'bench').map(({ name }) => ({ name })),
        hasMain: hasRunnableMain(index),
    };
}

function collectShallowHeaderSnapshot(rootNode, document) {
    const header = {
        kind: 'header',
        imports: [],
        exports: [],
        symbols: [],
        modules: [],
        constructs: [],
        references: [],
        tests: [],
        benches: [],
        hasMain: false,
    };
    for (const item of namedChildren(rootNode)) {
        if (item.type === 'export_decl') {
            const nameNode = childOfType(childOfType(item, 'fn_decl'), 'identifier');
            if (!nameNode)
                continue;
            header.exports.push({ name: nameNode.text, kind: 'function' });
            header.symbols.push({
                name: nameNode.text,
                kind: 'function',
                exported: true,
                uri: document.uri,
                ...spanFromNode(document, nameNode),
            });
            header.hasMain ||= nameNode.text === 'main';
            continue;
        }
        if (item.type === 'test_decl' || item.type === 'bench_decl') {
            const name = namedChildren(item)[0]?.text.slice(1, -1);
            if (!name)
                continue;
            const kind = item.type === 'test_decl' ? 'test' : 'bench';
            header[kind === 'test' ? 'tests' : 'benches'].push({ name });
            header.symbols.push({
                name,
                kind,
                exported: false,
                uri: document.uri,
                ...spanFromNode(document, namedChildren(item)[0] ?? item),
            });
            continue;
        }
        if (item.type === 'module_decl') {
            const moduleNode = childOfType(item, 'identifier') ?? childOfType(item, 'type_ident');
            if (moduleNode)
                header.modules.push({ name: moduleNode.text });
            header.references.push(...collectHeaderTypeReferences(item).filter((name) => name !== moduleNode?.text));
            continue;
        }
        if (item.type === 'construct_decl') {
            const construct = collectConstructDeclaration(item);
            if (construct)
                header.constructs.push(construct);
            continue;
        }
        const symbol = collectTopLevelSymbol(item, document);
        if (symbol) {
            header.symbols.push(symbol);
            if (symbol.kind === 'importFunction' || symbol.kind === 'importValue') {
                header.imports.push({ name: symbol.name, kind: symbol.kind });
            }
        }
        header.references.push(...collectHeaderTypeReferences(item));
    }
    header.references = [...new Set(header.references.filter(Boolean))];
    return header;
}

function collectTopLevelSymbol(item, document) {
    if (item.type === 'fn_decl') {
        const nameNode = childOfType(item, 'identifier');
        return nameNode ? { name: nameNode.text, kind: 'function', exported: false, uri: document.uri, ...spanFromNode(document, nameNode) } : null;
    }
    if (item.type === 'global_decl') {
        const nameNode = childOfType(item, 'identifier');
        return nameNode ? { name: nameNode.text, kind: 'global', exported: false, uri: document.uri, ...spanFromNode(document, nameNode) } : null;
    }
    if (item.type === 'import_decl') {
        const nameNode = childOfType(item, 'identifier');
        const typeNode = item.namedChildren.at(-1);
        if (!nameNode) return null;
        return {
            name: nameNode.text,
            kind: typeNode?.type === 'func_type' ? 'importFunction' : 'importValue',
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
