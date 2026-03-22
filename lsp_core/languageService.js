import data from '../jsondata/languageService.data.json' with { type: 'json' };
import { BUILTIN_METHODS, CORE_TYPE_COMPLETIONS, KEYWORD_COMPLETIONS, LITERAL_COMPLETIONS, getBuiltinNamespaceHover, getBuiltinHover, getBuiltinReturnType, getCoreTypeHover, getKeywordHover, getLiteralHover, isBuiltinNamespace, } from './hoverDocs.js';
import { collectParseDiagnostics, findNamedChild, findNamedChildren, getWordAtPosition, spanFromNode, spanFromOffsets, stringLiteralName, walkNamedChildren, } from '../parser.js';
import { comparePositions, copyRange, getDocumentUri, rangeContains, rangeKey, rangeLength, } from './types.js';
const SYMBOL_METADATA = data.symbolMetadata;
const STATIC_COMPLETION_ITEMS = [
    ...createCompletionItems(KEYWORD_COMPLETIONS, 'keyword'),
    ...createCompletionItems(Object.keys(BUILTIN_METHODS), 'module'),
    ...createCompletionItems(CORE_TYPE_COMPLETIONS, 'class'),
    ...createCompletionItems(LITERAL_COMPLETIONS, 'keyword'),
];
function createCompletionItems(labels, kind) { return labels.map((label) => ({ label, kind })); }
const RECURSIVE_EXPRESSION_TYPES = new Set(data.recursiveExpressionTypes);
const LITERAL_TYPE_BY_NODE_TYPE = data.literalTypeByNodeType;
export class UtuLanguageService {
    parserService;
    cache = new Map();
    constructor(parserService) { this.parserService = parserService; }
    dispose() { this.clear(); }
    invalidate(uri) { this.cache.delete(uri); }
    clear() { this.cache.clear(); }
    async getDiagnostics(document) { return (await this.getDocumentIndex(document)).diagnostics.map(cloneDiagnostic); }
    async getDocumentIndex(document) {
        const cacheKey = getDocumentUri(document);
        const cached = this.cache.get(cacheKey);
        if (cached && cached.version === document.version)
            return cached.index;
        const parsedTree = await this.parserService.parseSource(document.getText());
        try {
            const diagnostics = collectParseDiagnostics(parsedTree.tree.rootNode, document);
            const index = buildDocumentIndex(document, parsedTree.tree.rootNode, diagnostics);
            this.cache.set(cacheKey, { version: document.version, index });
            return index;
        }
        finally {
            parsedTree.dispose();
        }
    }
    async getHover(document, position) {
        const index = await this.getDocumentIndex(document);
        const occurrence = findOccurrenceAtPosition(index, position);
        if (occurrence?.builtinKey) {
            const builtinHover = getBuiltinHover(occurrence.builtinKey);
            if (builtinHover)
                return { contents: builtinHover, range: copyRange(occurrence.range) };
        }
        const symbol = occurrence?.symbolKey
            ? index.symbolByKey.get(occurrence.symbolKey)
            : findSymbolAtPosition(index, position);
        if (symbol)
            return { contents: symbolToMarkup(symbol), range: copyRange(occurrence?.range ?? symbol.range) };
        const word = getWordAtPosition(document, position);
        if (!word)
            return undefined;
        const fallbackHover = getFallbackHover(word.text);
        if (!fallbackHover)
            return undefined;
        return { contents: fallbackHover, range: word.range };
    }
    async getDefinition(document, position) { return this.withResolvedSymbol(document, position, undefined, (_index, symbol) => ({ uri: symbol.uri, range: copyRange(symbol.range) })); }
    async getReferences(document, position, includeDeclaration) {
        return this.withResolvedSymbol(document, position, [], (index, symbol) => getOccurrencesForSymbol(index, symbol.key)
            .filter((occurrence) => includeDeclaration || !occurrence.isDefinition)
            .map((occurrence) => ({ uri: index.uri, range: copyRange(occurrence.range) })));
    }
    async getDocumentHighlights(document, position) {
        return this.withResolvedSymbol(document, position, [], (index, symbol) => getOccurrencesForSymbol(index, symbol.key)
            .map((occurrence) => ({ range: copyRange(occurrence.range), kind: occurrence.isDefinition ? 'write' : 'read' })));
    }
    async getCompletionItems(document, position) {
        const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
        const namespaceMatch = linePrefix.match(/\b([a-z0-9_]+)\.$/i);
        if (namespaceMatch) {
            return (BUILTIN_METHODS[namespaceMatch[1]] ?? []).map((method) => ({
                label: method,
                kind: 'method',
                detail: `${namespaceMatch[1]}.${method}`,
            }));
        }
        const index = await this.getDocumentIndex(document);
        return [...STATIC_COMPLETION_ITEMS, ...index.topLevelSymbols
                .filter((symbol) => symbol.kind !== 'test' && symbol.kind !== 'bench')
                .map((symbol) => ({ label: symbol.name, kind: SYMBOL_METADATA[symbol.kind].completionKind, detail: symbol.signature }))];
    }
    async getDocumentSemanticTokens(document) {
        const index = await this.getDocumentIndex(document);
        const seen = new Set();
        const tokens = [];
        for (const occurrence of index.occurrences) {
            if (!occurrence.symbolKey)
                continue;
            const symbol = index.symbolByKey.get(occurrence.symbolKey);
            if (!symbol)
                continue;
            const tokenType = getSemanticTokenType(symbol);
            if (!tokenType)
                continue;
            const key = `${rangeKey(occurrence.range)}:${tokenType}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            tokens.push({ range: copyRange(occurrence.range), type: tokenType, modifiers: occurrence.isDefinition ? ['declaration'] : [] });
        }
        return tokens;
    }
    async getDocumentSymbols(document) {
        const index = await this.getDocumentIndex(document);
        return index.topLevelSymbols.map((symbol) => ({ name: symbol.name, detail: symbol.detail, kind: SYMBOL_METADATA[symbol.kind].documentSymbolKind, range: copyRange(symbol.range), selectionRange: copyRange(symbol.range) }));
    }
    async getWorkspaceSymbols(query, documents) { const workspaceIndex = new UtuWorkspaceSymbolIndex(this); await workspaceIndex.syncDocuments(documents, { replace: true }); return workspaceIndex.getWorkspaceSymbols(query); }
    async withResolvedSymbol(document, position, fallback, action) { const index = await this.getDocumentIndex(document), symbol = resolveSymbol(index, position); return symbol ? action(index, symbol) : fallback; }
}
export class UtuWorkspaceSymbolIndex {
    languageService;
    entries = new Map();
    constructor(languageService) { this.languageService = languageService; }
    clear() { this.entries.clear(); }
    deleteDocument(uri) { this.entries.delete(uri); }
    async updateDocument(document) {
        const uri = getDocumentUri(document);
        const cached = this.entries.get(uri);
        if (cached?.version === document.version)
            return cached.symbols;
        const index = await this.languageService.getDocumentIndex(document);
        const symbols = collectWorkspaceSymbols(index.topLevelSymbols);
        this.entries.set(uri, { version: document.version, symbols });
        return symbols;
    }
    async syncDocuments(documents, { replace = false } = {}) {
        const seen = new Set();
        for (const document of documents) {
            const uri = getDocumentUri(document);
            seen.add(uri);
            await this.updateDocument(document);
        }
        if (!replace)
            return;
        for (const uri of this.entries.keys())
            if (!seen.has(uri))
                this.entries.delete(uri);
    }
    getWorkspaceSymbols(query = '') {
        const loweredQuery = query.trim().toLowerCase();
        return [...this.entries.values()].flatMap(({ symbols }) => symbols
            .filter((symbol) => !loweredQuery || symbol.name.toLowerCase().includes(loweredQuery))
            .map(cloneWorkspaceSymbol));
    }
}
export function findOccurrenceAtPosition(index, position) { return findBestRangeMatch(index.occurrences, position); }
export function findSymbolAtPosition(index, position) {
    const occurrence = findOccurrenceAtPosition(index, position);
    return occurrence?.symbolKey ? index.symbolByKey.get(occurrence.symbolKey) : findBestRangeMatch(index.symbols, position);
}
export function getSemanticTokenType(symbol) { return SYMBOL_METADATA[symbol.kind].semanticTokenType; }
export function isRunnableMainSymbol(symbol) { return symbol.kind === 'function' && symbol.exported && symbol.name === 'main'; }
export function hasRunnableMain(index) { return index.topLevelSymbols.some(isRunnableMainSymbol); }
export function isRunnableSymbol(symbol) { return symbol.kind === 'test' || symbol.kind === 'bench'; }
export function collectRunnableEntries(index) {
    const ordinals = new Map([['test', 0], ['bench', 0]]);
    return index.topLevelSymbols.flatMap((symbol) => {
        if (isRunnableMainSymbol(symbol))
            return [{ kind: 'main', symbol }];
        if (!isRunnableSymbol(symbol))
            return [];
        const ordinal = ordinals.get(symbol.kind) ?? 0;
        ordinals.set(symbol.kind, ordinal + 1);
        return [{ kind: symbol.kind, ordinal, symbol }];
    });
}
function collectWorkspaceSymbols(symbols) {
    return symbols.map((symbol) => ({ name: symbol.name, detail: symbol.detail, kind: SYMBOL_METADATA[symbol.kind].documentSymbolKind, location: { uri: symbol.uri, range: copyRange(symbol.range) } }));
}
function cloneWorkspaceSymbol(symbol) { return { ...symbol, location: { uri: symbol.location.uri, range: copyRange(symbol.location.range) } }; }
function buildDocumentIndex(document, rootNode, diagnostics) {
    const uri = getDocumentUri(document);
    const symbols = [];
    const symbolByKey = new Map();
    const occurrences = [];
    const topLevelSymbols = [];
    const topLevelValueKeys = new Map();
    const topLevelTypeKeys = new Map();
    const fieldsByOwner = new Map();
    const localScopes = [];
    let symbolCounter = 0;
    const rememberSymbolKey = (symbolsByName, { name, key }) => void (!symbolsByName.has(name) && symbolsByName.set(name, key));
    const registerField = (ownerName, fieldSymbol) => {
        const ownerFields = fieldsByOwner.get(ownerName) ?? fieldsByOwner.set(ownerName, new Map()).get(ownerName);
        if (!ownerFields.has(fieldSymbol.name)) {
            ownerFields.set(fieldSymbol.name, fieldSymbol.key);
        }
    };
    const createSymbol = (nameNode, kind, options) => {
        const span = spanFromNode(document, nameNode);
        const symbol = {
            key: `${uri}#${symbolCounter}`,
            name: options.name ?? nameNode.text,
            kind,
            uri,
            range: span.range,
            offsetRange: span.offsetRange,
            detail: options.detail,
            signature: options.signature,
            typeText: options.typeText,
            returnTypeText: options.returnTypeText,
            containerName: options.containerName,
            exported: options.exported,
            topLevel: options.topLevel ?? false,
        };
        symbolCounter += 1;
        symbols.push(symbol);
        symbolByKey.set(symbol.key, symbol);
        if (symbol.topLevel) {
            topLevelSymbols.push(symbol);
        }
        addOccurrence({
            name: symbol.name,
            range: symbol.range,
            role: SYMBOL_METADATA[symbol.kind].role,
            symbolKey: symbol.key,
            isDefinition: true,
        });
        return symbol;
    };
    const addOccurrence = (occurrence) => void occurrences.push(occurrence);
    const addResolvedOccurrence = (nameNode, role, symbolKey) => {
        const span = spanFromNode(document, nameNode);
        addOccurrence({ name: nameNode.text, range: span.range, offsetRange: span.offsetRange, role, symbolKey, isDefinition: false });
    };
    const addBuiltinOccurrence = (span, key, label) => addOccurrence({ name: label ?? key, range: span.range, offsetRange: span.offsetRange, role: 'builtin', builtinKey: key, isDefinition: false });
    const lookupSymbol = (key) => (key ? symbolByKey.get(key) : undefined);
    const declareLocalSymbol = (nameNode, kind, detail, typeNode, signature = typeNode ? `${nameNode.text}: ${typeNode.text}` : nameNode.text) => {
        if (typeNode)
            walkTypeAnnotation(typeNode);
        const symbol = createSymbol(nameNode, kind, { detail, signature, typeText: typeNode?.text });
        declareLocal(symbol);
        return symbol;
    };
    const topLevelHandlers = {
        struct_decl: { collect: collectStructDeclaration, walk: walkStruct },
        type_decl: { collect: collectTypeDeclaration, walk: walkTypeDeclaration },
        fn_decl: { collect: (item) => collectFunctionDeclaration(item, false), walk: walkFunction },
        global_decl: { collect: collectGlobalDeclaration, walk: walkGlobal },
        import_decl: { collect: collectImportDeclaration, walk: walkImport },
        test_decl: { collect: collectTestDeclaration, walk: walkTest },
        bench_decl: { collect: collectBenchDeclaration, walk: walkBench },
    };
    const WALK_EXPRESSION_HANDLERS = {
        identifier: (node) => addResolvedOccurrence(node, 'value', resolveValueKey(node.text)),
        struct_init: walkStructInit,
        field_expr: walkFieldExpression,
        call_expr: walkCallExpression,
        namespace_call_expr: (node) => addBuiltinOccurrence(rangeForBuiltinNode(document, node), builtinKeyFromNamespaceCall(node), node.text),
        array_init: walkArrayInit,
        ref_null_expr: walkRefNullExpression,
        pipe_expr: walkPipeExpression,
        bind_expr: walkBindExpression,
        block_expr: walkBlockExpression,
        block: walkBlock,
        match_expr: walkMatchExpression,
        alt_expr: walkAltExpression,
        for_expr: walkForExpression,
        while_expr: walkWhileExpression,
        emit_expr: (node) => walkNamedChildren(node, walkExpression),
        literal: () => { },
    };
    const EXPRESSION_TYPE_INFERERS = {
        identifier: inferIdentifierType,
        field_expr: inferFieldExpressionType,
        call_expr: inferCallExpressionType,
        namespace_call_expr: (node) => getBuiltinReturnType(builtinKeyFromNamespaceCall(node)),
        pipe_expr: inferPipeExpressionType,
        pipe_target: inferPipeTargetType,
        struct_init: inferStructInitType,
        array_init: inferArrayInitType,
        ref_null_expr: inferRefNullType,
        paren_expr: inferFirstChildType,
        block_expr: inferFirstChildType,
        literal: inferLiteralType,
        binary_expr: inferFirstChildType,
        else_expr: inferFirstChildType,
        tuple_expr: inferFirstChildType,
        index_expr: inferFirstChildType,
        assign_expr: inferFirstChildType,
        unary_expr: inferFirstChildType,
    };
    for (const item of rootNode.namedChildren)
        collectTopLevelDeclarations(item);
    for (const item of rootNode.namedChildren)
        walkTopLevelItem(item);
    occurrences.sort((left, right) => comparePositions(left.range.start, right.range.start));
    return { uri, version: document.version, diagnostics, symbols, symbolByKey, occurrences, topLevelSymbols };
    function collectTopLevelDeclarations(item) {
        if (item.type !== 'export_decl')
            return void topLevelHandlers[item.type]?.collect(item);
        const fnDecl = findNamedChild(item, 'fn_decl');
        if (fnDecl)
            collectFunctionDeclaration(fnDecl, true);
    }
    function collectFieldSymbols(ownerSymbol, fieldList) {
        for (const fieldNode of findNamedChildren(fieldList, 'field')) {
            const fieldNameNode = findNamedChild(fieldNode, 'identifier');
            const fieldTypeNode = fieldNode.namedChildren.at(-1);
            if (!fieldNameNode || !fieldTypeNode)
                continue;
            const fieldSymbol = createSymbol(fieldNameNode, 'field', { detail: `field of ${ownerSymbol.name}`, signature: `${fieldNameNode.text}: ${fieldTypeNode.text}`, typeText: fieldTypeNode.text, containerName: ownerSymbol.name });
            registerField(ownerSymbol.name, fieldSymbol);
        }
    }
    function collectStructDeclaration(structDecl) {
        const nameNode = findNamedChild(structDecl, 'type_ident');
        if (!nameNode)
            return;
        const structSymbol = createSymbol(nameNode, 'struct', { detail: 'struct', signature: `struct ${nameNode.text}`, topLevel: true });
        rememberSymbolKey(topLevelTypeKeys, structSymbol);
        collectFieldSymbols(structSymbol, findNamedChild(structDecl, 'field_list'));
    }
    function collectTypeDeclaration(typeDecl) {
        const nameNode = findNamedChild(typeDecl, 'type_ident');
        if (!nameNode)
            return;
        const typeSymbol = createSymbol(nameNode, 'sumType', { detail: 'sum type', signature: `type ${nameNode.text}`, topLevel: true });
        rememberSymbolKey(topLevelTypeKeys, typeSymbol);
        for (const variantNode of findNamedChildren(findNamedChild(typeDecl, 'variant_list'), 'variant')) {
            const variantNameNode = findNamedChild(variantNode, 'type_ident');
            if (!variantNameNode)
                continue;
            const variantSymbol = createSymbol(variantNameNode, 'variant', { detail: `variant of ${typeSymbol.name}`, signature: `variant ${variantNameNode.text} of ${typeSymbol.name}`, containerName: typeSymbol.name, topLevel: true });
            rememberSymbolKey(topLevelTypeKeys, variantSymbol);
            collectFieldSymbols(variantSymbol, findNamedChild(variantNode, 'field_list'));
        }
    }
    function collectFunctionDeclaration(fnDecl, exported) {
        const nameNode = findNamedChild(fnDecl, 'identifier');
        if (!nameNode)
            return;
        const paramList = findNamedChild(fnDecl, 'param_list');
        const returnType = findNamedChild(fnDecl, 'return_type');
        const signature = `${exported ? 'export ' : ''}fun ${nameNode.text}(${paramList?.text ?? ''})${returnType ? ` ${returnType.text}` : ''}`;
        const functionSymbol = createSymbol(nameNode, 'function', { detail: exported ? 'exported function' : 'function', exported, signature, returnTypeText: returnType?.text, topLevel: true });
        rememberSymbolKey(topLevelValueKeys, functionSymbol);
    }
    function collectGlobalDeclaration(globalDecl) {
        const nameNode = findNamedChild(globalDecl, 'identifier');
        const typeNode = globalDecl.namedChildren[1];
        if (!nameNode || !typeNode)
            return;
        const globalSymbol = createSymbol(nameNode, 'global', { detail: 'global binding', signature: `let ${nameNode.text}: ${typeNode.text}`, typeText: typeNode.text, topLevel: true });
        rememberSymbolKey(topLevelValueKeys, globalSymbol);
    }
    function collectImportDeclaration(importDecl) {
        const moduleNode = findNamedChild(importDecl, 'string_lit');
        const nameNode = findNamedChild(importDecl, 'identifier');
        if (!moduleNode || !nameNode)
            return;
        const moduleText = moduleNode.text;
        const returnTypeNode = findNamedChild(importDecl, 'return_type');
        if (returnTypeNode) {
            const paramList = findNamedChild(importDecl, 'import_param_list');
            const importSymbol = createSymbol(nameNode, 'importFunction', { detail: 'host import', signature: `shimport ${moduleText} ${nameNode.text}(${paramList?.text ?? ''}) ${returnTypeNode.text}`, returnTypeText: returnTypeNode.text, topLevel: true });
            rememberSymbolKey(topLevelValueKeys, importSymbol);
            return;
        }
        const typeNode = importDecl.namedChildren.at(-1);
        if (!typeNode || typeNode.type === 'identifier')
            return;
        const importSymbol = createSymbol(nameNode, 'importValue', { detail: 'host import value', signature: `shimport ${moduleText} ${nameNode.text}: ${typeNode.text}`, typeText: typeNode.text, topLevel: true });
        rememberSymbolKey(topLevelValueKeys, importSymbol);
    }
    function collectTestDeclaration(testDecl) {
        const nameNode = findNamedChild(testDecl, 'string_lit');
        if (!nameNode)
            return;
        createSymbol(nameNode, 'test', { detail: 'test case', name: stringLiteralName(nameNode), signature: `test ${nameNode.text}`, topLevel: true });
    }
    function collectBenchDeclaration(benchDecl) {
        const nameNode = findNamedChild(benchDecl, 'string_lit');
        const captureNode = findNamedChild(findNamedChild(benchDecl, 'bench_capture'), 'identifier');
        if (!nameNode)
            return;
        createSymbol(nameNode, 'bench', { detail: 'benchmark', name: stringLiteralName(nameNode), signature: `bench ${nameNode.text}${captureNode ? ` |${captureNode.text}|` : ''}`, topLevel: true });
    }
    function walkTopLevelItem(item) {
        if (item.type !== 'export_decl')
            return void topLevelHandlers[item.type]?.walk(item);
        const fnDecl = findNamedChild(item, 'fn_decl');
        if (fnDecl)
            walkFunction(fnDecl);
    }
    function walkFieldTypeAnnotations(fieldList) {
        for (const fieldNode of findNamedChildren(fieldList, 'field')) {
            const typeNode = fieldNode.namedChildren.at(-1);
            if (typeNode)
                walkTypeAnnotation(typeNode);
        }
    }
    function walkStruct(structDecl) { walkFieldTypeAnnotations(findNamedChild(structDecl, 'field_list')); }
    function walkTypeDeclaration(typeDecl) {
        for (const variantNode of findNamedChildren(findNamedChild(typeDecl, 'variant_list'), 'variant'))
            walkFieldTypeAnnotations(findNamedChild(variantNode, 'field_list'));
    }
    function walkFunction(fnDecl) {
        withScope(localScopes, () => {
            for (const paramNode of findNamedChildren(findNamedChild(fnDecl, 'param_list'), 'param')) {
                const nameNode = findNamedChild(paramNode, 'identifier');
                const typeNode = paramNode.namedChildren.at(-1);
                if (!nameNode || !typeNode)
                    continue;
                declareLocalSymbol(nameNode, 'parameter', 'parameter', typeNode);
            }
            const returnType = findNamedChild(fnDecl, 'return_type');
            if (returnType) walkTypeAnnotation(returnType);
            walkBlock(findNamedChild(fnDecl, 'block'));
        });
    }
    function walkGlobal(globalDecl) {
        walkTypeAnnotation(globalDecl.namedChildren[1]);
        walkExpression(globalDecl.namedChildren[2]);
    }
    function walkImport(importDecl) {
        const returnTypeNode = findNamedChild(importDecl, 'return_type');
        if (returnTypeNode) {
            for (const paramNode of findNamedChildren(findNamedChild(importDecl, 'import_param_list'), 'param')) {
                const typeNode = paramNode.namedChildren.at(-1);
                if (typeNode) walkTypeAnnotation(typeNode);
            }
            walkTypeAnnotation(returnTypeNode);
            return;
        }
        const typeNode = importDecl.namedChildren.at(-1);
        if (typeNode && typeNode.type !== 'identifier')
            walkTypeAnnotation(typeNode);
    }
    function walkTest(testDecl) { walkBlock(findNamedChild(testDecl, 'block')); }
    function walkBench(benchDecl) {
        const setupDecl = findNamedChild(benchDecl, 'setup_decl');
        if (!setupDecl)
            return;
        withScope(localScopes, () => {
            const captureNode = findNamedChild(findNamedChild(benchDecl, 'bench_capture'), 'identifier');
            if (captureNode)
                declareLocalSymbol(captureNode, 'capture', 'benchmark iteration capture');
            for (const child of setupDecl.namedChildren) {
                if (child.type === 'measure_decl') {
                    walkBlock(findNamedChild(child, 'block'));
                    continue;
                }
                walkExpression(child);
            }
        });
    }
    function walkBlock(block) {
        if (!block)
            return;
        withScope(localScopes, () => {
            for (const statement of block.namedChildren)
                walkExpression(statement);
        });
    }
    function walkBlockExpression(node) { walkBlock(findNamedChild(node, 'block')); }
    function walkExpression(node) {
        if (!node)
            return;
        if (RECURSIVE_EXPRESSION_TYPES.has(node.type)) {
            walkNamedChildren(node, walkExpression);
            return;
        }
        const walkNode = WALK_EXPRESSION_HANDLERS[node.type];
        if (walkNode)
            return walkNode(node);
        walkNamedChildren(node, walkExpression);
    }
    function walkStructInit(node) {
        const typeNode = findNamedChild(node, 'type_ident');
        if (!typeNode)
            return;
        addResolvedOccurrence(typeNode, 'type', resolveTypeKey(typeNode.text));
        const ownerType = typeNode.text;
        for (const fieldInit of findNamedChildren(node, 'field_init')) {
            const fieldNameNode = findNamedChild(fieldInit, 'identifier');
            const valueNode = fieldInit.namedChildren.at(-1);
            if (fieldNameNode)
                addResolvedOccurrence(fieldNameNode, 'field', resolveFieldKey(ownerType, fieldNameNode.text));
            if (valueNode)
                walkExpression(valueNode);
        }
    }
    function walkFieldExpression(node) {
        const [baseNode, fieldNameNode] = node.namedChildren;
        if (!baseNode || !fieldNameNode)
            return;
        walkExpression(baseNode);
        const baseType = inferExpressionType(baseNode);
        addResolvedOccurrence(fieldNameNode, 'field', baseType ? resolveFieldKey(baseType, fieldNameNode.text) : undefined);
    }
    function walkCallExpression(node) {
        const [calleeNode, argListNode] = node.namedChildren;
        walkExpression(calleeNode);
        walkExpressions(argListNode?.type === 'arg_list' ? argListNode.namedChildren : []);
    }
    function walkArrayInit(node) {
        const typeNode = node.namedChildren[0];
        const methodNode = findNamedChild(node, 'identifier');
        const argListNode = findNamedChild(node, 'arg_list');
        walkTypeAnnotation(typeNode);
        if (methodNode)
            addBuiltinOccurrence(spanFromOffsets(document, node.startIndex, methodNode.endIndex), `array.${methodNode.text}`, `array.${methodNode.text}`);
        walkExpressions(argListNode?.namedChildren ?? []);
    }
    function walkRefNullExpression(node) {
        const typeNode = findNamedChild(node, 'type_ident');
        addBuiltinOccurrence(spanFromOffsets(document, node.startIndex, node.startIndex + 'ref.null'.length), 'ref.null');
        if (typeNode)
            addResolvedOccurrence(typeNode, 'type', resolveTypeKey(typeNode.text));
    }
    function walkPipeExpression(node) {
        const [valueNode, targetNode] = node.namedChildren;
        walkExpression(valueNode);
        walkPipeTarget(targetNode);
    }
    function walkPipeTarget(node) {
        if (!node)
            return;
        const namedChildren = node.namedChildren;
        if (namedChildren.length === 0)
            return;
        const first = namedChildren[0];
        const second = namedChildren[1];
        if (first.type === 'identifier' && second?.type === 'identifier' && isBuiltinNamespace(first.text))
            addBuiltinOccurrence(spanFromOffsets(document, node.startIndex, second.endIndex), `${first.text}.${second.text}`, `${first.text}.${second.text}`);
        else if (first.type === 'identifier')
            addResolvedOccurrence(first, 'value', resolveValueKey(first.text));
        walkExpressions(findNamedChildren(findNamedChild(node, 'pipe_args'), 'pipe_arg').map((pipeArg) => pipeArg.namedChildren[0]));
    }
    function walkBindExpression(node) {
        const namedChildren = node.namedChildren;
        const valueNode = namedChildren.at(-1);
        if (valueNode)
            walkExpression(valueNode);
        for (const bindTarget of namedChildren.slice(0, -1)) {
            if (bindTarget.type !== 'bind_target')
                continue;
            const nameNode = findNamedChild(bindTarget, 'identifier');
            const typeNode = bindTarget.namedChildren.at(-1);
            if (!nameNode || !typeNode)
                continue;
            declareLocalSymbol(nameNode, 'binding', 'local binding', typeNode);
        }
    }
    function walkMatchExpression(node) {
        const [subjectNode, ...arms] = node.namedChildren;
        walkExpression(subjectNode);
        walkExpressions(arms.map((armNode) => armNode.namedChildren.at(-1)));
    }
    function walkAltExpression(node) {
        const [subjectNode, ...arms] = node.namedChildren;
        if (subjectNode)
            walkExpression(subjectNode);
        for (const armNode of arms)
            walkAltArm(armNode);
    }
    function walkAltArm(node) {
        withScope(localScopes, () => {
            const patternNode = node.namedChildren[0]?.type === 'identifier' ? node.namedChildren[0] : undefined;
            const typeNode = findNamedChild(node, 'type_ident');
            const expressionNode = node.namedChildren.at(-1);
            if (typeNode) addResolvedOccurrence(typeNode, 'type', resolveTypeKey(typeNode.text));
            if (patternNode) declareLocalSymbol(patternNode, 'matchBinding', 'alt binding', typeNode, typeNode ? `${patternNode.text}: ${typeNode.text}` : patternNode.text);
            walkExpression(expressionNode);
        });
    }
    function walkForExpression(node) {
        const forSources = findNamedChild(node, 'for_sources');
        if (forSources) {
            for (const sourceNode of forSources.namedChildren)
                for (const child of sourceNode.namedChildren)
                    walkExpression(child);
        }
        withScope(localScopes, () => {
            const captureNode = findNamedChild(node, 'capture');
            if (captureNode)
                for (const captureIdentifier of findNamedChildren(captureNode, 'identifier'))
                    declareLocalSymbol(captureIdentifier, 'capture', 'loop capture');
            walkExpressions(findNamedChild(node, 'block')?.namedChildren ?? []);
        });
    }
    function walkWhileExpression(node) {
        for (const child of node.namedChildren) {
            if (child.type !== 'block')
                walkExpression(child);
        }
        walkBlock(findNamedChild(node, 'block'));
    }
    function walkTypeAnnotation(node) {
        if (!node)
            return;
        if (node.type === 'type_ident') {
            addResolvedOccurrence(node, 'type', resolveTypeKey(node.text));
            return;
        }
        walkExpressions(node.namedChildren, walkTypeAnnotation);
    }
    function declareLocal(symbol) { localScopes.at(-1)?.set(symbol.name, symbol.key); }
    function resolveValueKey(name) {
        for (let index = localScopes.length - 1; index >= 0; index -= 1) {
            const key = localScopes[index].get(name);
            if (key)
                return key;
        }
        return topLevelValueKeys.get(name);
    }
    function resolveTypeKey(name) {
        return topLevelTypeKeys.get(name);
    }
    function resolveFieldKey(ownerTypeText, fieldName) {
        for (const candidateType of expandTypeCandidates(ownerTypeText)) {
            const fieldKey = fieldsByOwner.get(candidateType)?.get(fieldName);
            if (fieldKey) return fieldKey;
        }
        return undefined;
    }
    function inferFirstChildType(node) { return node.namedChildren[0] ? inferExpressionType(node.namedChildren[0]) : undefined; }
    function inferIdentifierType(node) {
        const symbol = lookupSymbol(resolveValueKey(node.text));
        return symbol?.typeText ?? symbol?.returnTypeText;
    }
    function inferFieldExpressionType(node) {
        const [baseNode, fieldNode] = node.namedChildren;
        if (!baseNode || !fieldNode)
            return undefined;
        const baseType = inferExpressionType(baseNode);
        if (!baseType)
            return undefined;
        const fieldSymbol = lookupSymbol(resolveFieldKey(baseType, fieldNode.text));
        return fieldSymbol?.typeText;
    }
    function inferCallExpressionType(node) {
        const calleeNode = node.namedChildren[0];
        if (!calleeNode)
            return undefined;
        if (calleeNode.type === 'identifier')
            return inferIdentifierType(calleeNode);
        return calleeNode.type === 'namespace_call_expr' ? getBuiltinReturnType(builtinKeyFromNamespaceCall(calleeNode)) : undefined;
    }
    function inferStructInitType(node) { return findNamedChild(node, 'type_ident')?.text; }
    function inferArrayInitType(node) { return node.namedChildren[0] ? `array[${node.namedChildren[0].text}]` : 'array[T]'; }
    function inferRefNullType(node) {
        const typeNode = findNamedChild(node, 'type_ident');
        return typeNode ? `${typeNode.text} # null` : undefined;
    }
    function inferPipeExpressionType(node) {
        const targetNode = node.namedChildren.at(-1);
        return targetNode ? inferPipeTargetType(targetNode) : undefined;
    }
    function inferExpressionType(node) {
        return EXPRESSION_TYPE_INFERERS[node.type]?.(node);
    }
    function inferPipeTargetType(node) {
        if (!node)
            return undefined;
        const namedChildren = node.namedChildren;
        if (namedChildren.length === 0)
            return undefined;
        const first = namedChildren[0];
        const second = namedChildren[1];
        if (first.type === 'identifier' && second?.type === 'identifier' && isBuiltinNamespace(first.text)) {
            return getBuiltinReturnType(`${first.text}.${second.text}`);
        }
        if (first.type === 'identifier') {
            const symbol = lookupSymbol(resolveValueKey(first.text));
            return symbol?.returnTypeText ?? symbol?.typeText;
        }
        return undefined;
    }
    function walkExpressions(nodes, visit = walkExpression) {
        for (const node of nodes) {
            if (node)
                visit(node);
        }
    }
}
function resolveSymbol(index, position) {
    const occurrence = findOccurrenceAtPosition(index, position);
    if (occurrence?.builtinKey) {
        return undefined;
    }
    if (occurrence?.symbolKey) {
        return index.symbolByKey.get(occurrence.symbolKey);
    }
    return findSymbolAtPosition(index, position);
}
function getFallbackHover(word) {
    return getCoreTypeHover(word)
        ?? getLiteralHover(word)
        ?? getKeywordHover(word)
        ?? getBuiltinNamespaceHover(word);
}
function getOccurrencesForSymbol(index, symbolKey) { return index.occurrences.filter((occurrence) => occurrence.symbolKey === symbolKey); }
function findBestRangeMatch(values, position) {
    let bestMatch;
    for (const value of values) {
        if (!rangeContains(value.range, position))
            continue;
        if (!bestMatch || rangeLength(value.range) < rangeLength(bestMatch.range))
            bestMatch = value;
    }
    return bestMatch;
}
function symbolToMarkup(symbol) {
    const sections = [`\`\`\`utu\n${symbol.signature}\n\`\`\``, symbol.detail];
    if (symbol.typeText)
        sections.push(`Type: \`${symbol.typeText}\``);
    if (symbol.returnTypeText)
        sections.push(`Returns: \`${symbol.returnTypeText}\``);
    if (symbol.containerName)
        sections.push(`Container: \`${symbol.containerName}\``);
    return { kind: 'markdown', value: sections.join('\n\n') };
}
function expandTypeCandidates(typeText) { const normalized = normalizeTypeText(typeText); return normalized ? [normalized] : []; }
function normalizeTypeText(typeText) {
    let value = typeText.trim();
    while (value.startsWith('(') && value.endsWith(')'))
        value = value.slice(1, -1).trim();
    value = value.replace(/\s*#\s*null\s*$/, '').trim();
    return value;
}
function builtinKeyFromNamespaceCall(node) {
    const methodNode = findNamedChild(node, 'identifier');
    const namespace = node.children[0]?.text ?? 'builtin';
    return `${namespace}.${methodNode?.text ?? 'unknown'}`;
}
function rangeForBuiltinNode(document, node) {
    const methodNode = findNamedChild(node, 'identifier');
    return methodNode ? spanFromOffsets(document, node.startIndex, methodNode.endIndex) : spanFromNode(document, node);
}
function inferLiteralType(node) {
    return node.text === 'true' || node.text === 'false'
        ? 'bool'
        : node.text === 'null'
            ? 'null'
            : LITERAL_TYPE_BY_NODE_TYPE[node.namedChildren[0]?.type];
}
function withScope(scopes, action) {
    scopes.push(new Map());
    try {
        return action();
    }
    finally {
        scopes.pop();
    }
}
function cloneDiagnostic(diagnostic) {
    return { ...diagnostic, range: copyRange(diagnostic.range) };
}
