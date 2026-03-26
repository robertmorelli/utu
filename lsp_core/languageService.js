import data from '../jsondata/languageService.data.json' with { type: 'json' };
import { BUILTIN_METHODS, CORE_TYPE_COMPLETIONS, KEYWORD_COMPLETIONS, LITERAL_COMPLETIONS, getBuiltinNamespaceHover, getBuiltinHover, getBuiltinReturnType, getCoreTypeHover, getKeywordHover, getLiteralHover, isBuiltinNamespace, } from './hoverDocs.js';
import { collectParseDiagnostics, findNamedChild, findNamedChildren, getWordAtPosition, spanFromNode, spanFromOffsets, stringLiteralName, walkNamedChildren, } from '../parser.js';
import { comparePositions, copyRange, getDocumentUri, rangeContains, rangeKey, rangeLength, } from './types.js';
import { expandSource } from '../expand.js';
import { watgen } from '../watgen.js';

const FILE_START_RANGE = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
const FILE_START_OFFSET_RANGE = { start: 0, end: 0 };
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
    validateWat;
    cache = new Map();
    constructor(parserService, { validateWat = null } = {}) { this.parserService = parserService; this.validateWat = validateWat; }
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
            if (diagnostics.length === 0) {
                const compileDiagnostic = await this.tryGetCompileDiagnostic(parsedTree.tree, document.getText(), document);
                if (compileDiagnostic)
                    diagnostics.push(compileDiagnostic);
            }
            this.cache.set(cacheKey, { version: document.version, index });
            return index;
        }
        finally {
            parsedTree.dispose();
        }
    }
    async tryGetCompileDiagnostic(tree, source, document) {
        let wat;
        try {
            const expandedSource = expandSource(tree, source);
            if (expandedSource === source) {
                ({ wat } = watgen(tree));
            } else {
                const expandedParsed = await this.parserService.parseSource(expandedSource);
                try {
                    ({ wat } = watgen(expandedParsed.tree));
                } finally {
                    expandedParsed.dispose();
                }
            }
        } catch (error) {
            const message = error?.message || String(error);
            if (!message) return null;
            return { message, range: FILE_START_RANGE, offsetRange: FILE_START_OFFSET_RANGE, severity: 'error', source: 'utu' };
        }
        if (!this.validateWat) return null;
        const result = await this.validateWat(wat);
        if (!result) return null;
        const span = findCompileErrorSpan(tree.rootNode, result.message, result.binaryenOutput, document);
        return { message: result.message, ...span, severity: 'error', source: 'utu' };
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
    const topLevelAssocKeys = new Map();
    const topLevelSetterAssocKeys = new Map();
    const fieldsByOwner = new Map();
    const moduleNamespaces = new Map();
    const constructAliases = new Map();
    const protocolTypeNames = new Set();
    const protocolAssocKeysBySelf = new Map();
    const protocolSetterAssocKeysBySelf = new Map();
    const taggedTypeProtocols = new Map();
    const openValueKeys = new Map();
    const openTypeKeys = new Map();
    const openTypeNamespaces = new Map();
    const localScopes = [];
    const moduleScopes = [];
    const semanticDiagnosticKeys = new Set();
    let symbolCounter = 0;
    const rememberSymbolKey = (symbolsByName, { name, key }) => void (!symbolsByName.has(name) && symbolsByName.set(name, key));
    const registerField = (ownerName, fieldSymbol) => {
        const ownerFields = fieldsByOwner.get(ownerName) ?? fieldsByOwner.set(ownerName, new Map()).get(ownerName);
        if (!ownerFields.has(fieldSymbol.name)) {
            ownerFields.set(fieldSymbol.name, fieldSymbol.key);
        }
    };
    const registerProtocolAssocForSelfType = (ownerTypeText, memberName, symbolKey) => {
        const ownerName = normalizeTypeText(ownerTypeText);
        if (!ownerName)
            return;
        const key = `${ownerName}.${memberName}`;
        if (!protocolAssocKeysBySelf.has(key)) {
            protocolAssocKeysBySelf.set(key, symbolKey);
            return;
        }
        if (protocolAssocKeysBySelf.get(key) !== symbolKey)
            protocolAssocKeysBySelf.set(key, undefined);
    };
    const registerProtocolSetterAssocForSelfType = (ownerTypeText, memberName, symbolKey) => {
        const ownerName = normalizeTypeText(ownerTypeText);
        if (!ownerName)
            return;
        const key = `${ownerName}.${memberName}`;
        if (!protocolSetterAssocKeysBySelf.has(key)) {
            protocolSetterAssocKeysBySelf.set(key, symbolKey);
            return;
        }
        if (protocolSetterAssocKeysBySelf.get(key) !== symbolKey)
            protocolSetterAssocKeysBySelf.set(key, undefined);
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
    const addSemanticDiagnostic = (node, message) => {
        if (!node)
            return;
        const span = spanFromNode(document, node);
        const key = `${message}:${rangeKey(span.range)}`;
        if (semanticDiagnosticKeys.has(key))
            return;
        semanticDiagnosticKeys.add(key);
        diagnostics.push({ message, range: span.range, offsetRange: span.offsetRange, severity: 'error', source: 'utu' });
    };
    const lookupSymbol = (key) => (key ? symbolByKey.get(key) : undefined);
    const declareLocalSymbol = (nameNode, kind, detail, typeNode, signature = typeNode ? `${nameNode.text}: ${typeNode.text}` : nameNode.text) => {
        if (typeNode)
            walkTypeAnnotation(typeNode);
        const symbol = createSymbol(nameNode, kind, { detail, signature, typeText: typeNode?.text });
        declareLocal(symbol);
        return symbol;
    };
    const declareLocalTypeText = (nameNode, kind, detail, typeText, signature = typeText ? `${nameNode.text}: ${typeText}` : nameNode.text) => {
        const symbol = createSymbol(nameNode, kind, { detail, signature, typeText });
        declareLocal(symbol);
        return symbol;
    };
    const topLevelHandlers = {
        module_decl: { collect: collectModuleDeclaration, walk: walkModuleDeclaration },
        construct_decl: { collect: collectConstructDeclaration, walk: () => { } },
        struct_decl: { collect: collectStructDeclaration, walk: walkStruct },
        proto_decl: { collect: collectProtoDeclaration, walk: () => { } },
        type_decl: { collect: collectTypeDeclaration, walk: walkTypeDeclaration },
        fn_decl: { collect: (item) => collectFunctionDeclaration(item, false), walk: walkFunction },
        global_decl: { collect: collectGlobalDeclaration, walk: walkGlobal },
        import_decl: { collect: collectImportDeclaration, walk: walkImport },
        jsgen_decl: { collect: collectJsgenDeclaration, walk: walkJsgen },
        test_decl: { collect: collectTestDeclaration, walk: walkTest },
        bench_decl: { collect: collectBenchDeclaration, walk: walkBench },
    };
    const WALK_EXPRESSION_HANDLERS = {
        identifier: walkIdentifierExpression,
        qualified_type_ref: walkQualifiedTypeReference,
        type_member_expr: walkTypeMemberExpression,
        promoted_module_call_expr: walkPromotedModuleCallExpression,
        struct_init: walkStructInit,
        field_expr: walkFieldExpression,
        assign_expr: walkAssignExpression,
        call_expr: walkCallExpression,
        namespace_call_expr: walkNamespaceCallExpression,
        array_init: walkArrayInit,
        ref_null_expr: walkRefNullExpression,
        pipe_expr: walkPipeExpression,
        promote_expr: walkPromoteExpression,
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
        type_member_expr: inferTypeMemberExpressionType,
        promoted_module_call_expr: inferPromotedModuleCallType,
        namespace_call_expr: (node) => getBuiltinReturnType(builtinKeyFromNamespaceCall(node)),
        pipe_expr: inferPipeExpressionType,
        pipe_target: inferPipeTargetType,
        promote_expr: inferPromoteExpressionType,
        struct_init: inferStructInitType,
        array_init: inferArrayInitType,
        ref_null_expr: inferRefNullType,
        paren_expr: inferFirstChildType,
        block_expr: inferFirstChildType,
        literal: inferLiteralType,
        binary_expr: inferFirstChildType,
        else_expr: inferElseExpressionType,
        tuple_expr: inferFirstChildType,
        index_expr: inferIndexExpressionType,
        assign_expr: inferFirstChildType,
        unary_expr: inferFirstChildType,
    };
    for (const item of rootNode.namedChildren)
        collectTopLevelDeclarations(item);
    registerTaggedTypeProtocolAssocKeys();
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
        const protocolListNode = findNamedChild(typeDecl, 'protocol_list');
        if (typeDecl.text.includes('tag type') && protocolListNode) {
            taggedTypeProtocols.set(nameNode.text, findNamedChildren(protocolListNode, 'type_ident').map((node) => node.text));
        }
        for (const variantNode of findNamedChildren(findNamedChild(typeDecl, 'variant_list'), 'variant')) {
            const variantNameNode = findNamedChild(variantNode, 'type_ident');
            if (!variantNameNode)
                continue;
            const variantSymbol = createSymbol(variantNameNode, 'variant', { detail: `variant of ${typeSymbol.name}`, signature: `variant ${variantNameNode.text} of ${typeSymbol.name}`, containerName: typeSymbol.name, topLevel: true });
            rememberSymbolKey(topLevelTypeKeys, variantSymbol);
            collectFieldSymbols(variantSymbol, findNamedChild(variantNode, 'field_list'));
        }
    }
    function collectProtoDeclaration(protoDecl) {
        const nameNode = findNamedChild(protoDecl, 'type_ident');
        if (!nameNode)
            return;
        const protoSymbol = createSymbol(nameNode, 'sumType', { detail: 'protocol', signature: `proto ${nameNode.text}`, topLevel: true });
        protocolTypeNames.add(nameNode.text);
        rememberSymbolKey(topLevelTypeKeys, protoSymbol);
        for (const protoMemberNode of findNamedChildren(findNamedChild(protoDecl, 'proto_member_list'), 'proto_member')) {
            const getterNode = findNamedChild(protoMemberNode, 'proto_getter');
            if (!getterNode)
                continue;
            const memberNameNode = findNamedChild(getterNode, 'identifier');
            const typeNode = getterNode.namedChildren.at(-1);
            if (!memberNameNode || !typeNode)
                continue;
            const getterSymbol = createSymbol(memberNameNode, 'function', {
                detail: `protocol getter on ${nameNode.text}`,
                name: `${nameNode.text}.${memberNameNode.text}`,
                signature: `get ${nameNode.text}.${memberNameNode.text}: ${typeNode.text}`,
                returnTypeText: typeNode.text,
                containerName: nameNode.text,
                topLevel: false,
            });
            topLevelAssocKeys.set(`${nameNode.text}.${memberNameNode.text}`, getterSymbol.key);
        }
        for (const protoMemberNode of findNamedChildren(findNamedChild(protoDecl, 'proto_member_list'), 'proto_member')) {
            const setterNode = findNamedChild(protoMemberNode, 'proto_setter');
            if (!setterNode)
                continue;
            const memberNameNode = findNamedChild(setterNode, 'identifier');
            const typeNode = setterNode.namedChildren.at(-1);
            if (!memberNameNode || !typeNode)
                continue;
            const setterSymbol = createSymbol(memberNameNode, 'function', {
                detail: `protocol setter on ${nameNode.text}`,
                name: `${nameNode.text}.${memberNameNode.text}=`,
                signature: `set ${nameNode.text}.${memberNameNode.text}: ${typeNode.text}`,
                typeText: typeNode.text,
                containerName: nameNode.text,
                topLevel: false,
            });
            topLevelSetterAssocKeys.set(`${nameNode.text}.${memberNameNode.text}`, setterSymbol.key);
        }
        for (const protoMemberNode of findNamedChildren(findNamedChild(protoDecl, 'proto_member_list'), 'proto_member')) {
            const methodNode = findNamedChild(protoMemberNode, 'proto_method');
            if (!methodNode)
                continue;
            const memberNameNode = findNamedChild(methodNode, 'identifier');
            const returnTypeNode = findNamedChild(methodNode, 'return_type');
            const typeListNode = findNamedChild(methodNode, 'type_list');
            if (!memberNameNode || !returnTypeNode)
                continue;
            const methodSymbol = createSymbol(memberNameNode, 'function', {
                detail: `protocol member on ${nameNode.text}`,
                name: `${nameNode.text}.${memberNameNode.text}`,
                signature: `fun ${nameNode.text}.${memberNameNode.text}(${typeListNode?.text ?? ''}) ${returnTypeNode.text}`,
                returnTypeText: returnTypeNode.text,
                containerName: nameNode.text,
                topLevel: false,
            });
            topLevelAssocKeys.set(`${nameNode.text}.${memberNameNode.text}`, methodSymbol.key);
        }
    }
    function registerTaggedTypeProtocolAssocKeys() {
        for (const [typeName, protocolNames] of taggedTypeProtocols.entries()) {
            for (const protocolName of protocolNames) {
                for (const [assocKey, symbolKey] of topLevelAssocKeys.entries()) {
                    if (!assocKey.startsWith(`${protocolName}.`))
                        continue;
                    registerProtocolAssocForSelfType(typeName, assocKey.slice(protocolName.length + 1), symbolKey);
                }
                for (const [assocKey, symbolKey] of topLevelSetterAssocKeys.entries()) {
                    if (!assocKey.startsWith(`${protocolName}.`))
                        continue;
                    registerProtocolSetterAssocForSelfType(typeName, assocKey.slice(protocolName.length + 1), symbolKey);
                }
            }
        }
    }
    function findModuleNameNode(node) {
        return findNamedChild(findNamedChild(node, 'module_name'), 'identifier')
            ?? findNamedChild(findNamedChild(node, 'module_name'), 'type_ident')
            ?? findNamedChild(findNamedChild(findNamedChild(node, 'module_ref'), 'module_name'), 'identifier')
            ?? findNamedChild(findNamedChild(findNamedChild(node, 'module_ref'), 'module_name'), 'type_ident')
            ?? findNamedChild(findNamedChild(node, 'module_ref'), 'identifier')
            ?? findNamedChild(findNamedChild(node, 'module_ref'), 'type_ident')
            ?? findNamedChild(node, 'identifier')
            ?? findNamedChild(node, 'type_ident');
    }
    function formatTypeName(typeText) {
        return normalizeTypeText(typeText) ?? typeText?.trim() ?? 'unknown';
    }
    function getTypeResolution(node) {
        if (!node)
            return { key: undefined };
        if (node.type === 'type_ident')
            return { key: resolveTypeKey(node.text), typeNode: node, typeName: node.text };
        if (node.type === 'qualified_type_ref' || node.type === 'instantiated_module_ref' || node.type === 'inline_module_type_path') {
            const namespaceNode = findModuleNameNode(node);
            const namespace = resolveNamespaceNode(node);
            const typeNode = findNamedChild(node, 'type_ident');
            const typeName = formatTypeName(node.text);
            const key = typeNode
                ? namespace?.typeKeys.get(typeNode.text)
                : namespace?.promotedTypeName
                    ? namespace.typeKeys.get(namespace.promotedTypeName)
                    : undefined;
            return { key, namespace, namespaceNode, typeNode, typeName };
        }
        return { key: undefined };
    }
    function walkIdentifierExpression(node) {
        const symbolKey = resolveValueKey(node.text);
        if (!symbolKey)
            addSemanticDiagnostic(node, `Undefined value "${node.text}".`);
        addResolvedOccurrence(node, 'value', symbolKey);
    }
    function walkQualifiedTypeLike(node) {
        const { key, namespace, namespaceNode, typeNode } = getTypeResolution(node);
        if (!namespace) {
            if (namespaceNode)
                addSemanticDiagnostic(namespaceNode, `Unknown module or construct alias "${namespaceNode.text}".`);
        }
        else if (typeNode && !key) {
            addSemanticDiagnostic(typeNode, `Unknown type "${typeNode.text}" in namespace "${namespace.name}".`);
        }
        if (typeNode)
            addResolvedOccurrence(typeNode, 'type', key);
        else if (namespaceNode)
            addResolvedOccurrence(namespaceNode, 'type', key);
    }
    function isCallableValueSymbol(symbol) {
        return symbol?.kind === 'function' || symbol?.kind === 'importFunction';
    }
    function resolvePromotedTypeKeyByName(name) {
        const namespace = resolveNamespaceByName(name);
        return namespace?.promotedTypeName ? namespace.typeKeys.get(namespace.promotedTypeName) : undefined;
    }
    function resolveNamespaceValueOrPromotedAssocKey(namespace, name) {
        return namespace?.valueKeys.get(name)
            ?? (namespace?.promotedTypeName ? namespace.assocKeys.get(`${namespace.promotedTypeName}.${name}`) : undefined);
    }
    function collectModuleDeclaration(moduleDecl) {
        const moduleNameNode = findModuleNameNode(moduleDecl);
        if (!moduleNameNode)
            return;
        const namespace = {
            name: moduleNameNode.text,
            typeKeys: new Map(),
            valueKeys: new Map(),
            assocKeys: new Map(),
            promotedTypeName: undefined,
        };
        moduleNamespaces.set(namespace.name, namespace);
        for (const item of moduleDecl.namedChildren) {
            switch (item.type) {
                case 'struct_decl':
                    collectModuleStruct(item, namespace);
                    break;
                case 'type_decl':
                    collectModuleType(item, namespace);
                    break;
                case 'fn_decl':
                    collectFunctionDeclaration(item, false, namespace);
                    break;
                case 'global_decl':
                    collectModuleGlobal(item, namespace);
                    break;
                case 'import_decl':
                    collectModuleImport(item, namespace);
                    break;
                case 'jsgen_decl':
                    collectModuleJsgen(item, namespace);
                    break;
            }
        }
    }
    function collectModuleStruct(structDecl, namespace) {
        const nameNode = findNamedChild(structDecl, 'type_ident');
        if (!nameNode)
            return;
        const structSymbol = createSymbol(nameNode, 'struct', { detail: `struct in ${namespace.name}`, signature: `struct ${nameNode.text}`, containerName: namespace.name });
        namespace.typeKeys.set(nameNode.text, structSymbol.key);
        if (nameNode.text === namespace.name)
            namespace.promotedTypeName = nameNode.text;
        collectFieldSymbols(structSymbol, findNamedChild(structDecl, 'field_list'));
    }
    function collectModuleType(typeDecl, namespace) {
        const nameNode = findNamedChild(typeDecl, 'type_ident');
        if (!nameNode)
            return;
        const typeSymbol = createSymbol(nameNode, 'sumType', { detail: `sum type in ${namespace.name}`, signature: `type ${nameNode.text}`, containerName: namespace.name });
        namespace.typeKeys.set(nameNode.text, typeSymbol.key);
        if (nameNode.text === namespace.name)
            namespace.promotedTypeName = nameNode.text;
        for (const variantNode of findNamedChildren(findNamedChild(typeDecl, 'variant_list'), 'variant')) {
            const variantNameNode = findNamedChild(variantNode, 'type_ident');
            if (!variantNameNode)
                continue;
            const variantSymbol = createSymbol(variantNameNode, 'variant', { detail: `variant of ${typeSymbol.name}`, signature: `variant ${variantNameNode.text} of ${typeSymbol.name}`, containerName: namespace.name });
            namespace.typeKeys.set(variantNameNode.text, variantSymbol.key);
            collectFieldSymbols(variantSymbol, findNamedChild(variantNode, 'field_list'));
        }
    }
    function collectFunctionDeclaration(fnDecl, exported, namespace) {
        const assocNode = findNamedChild(fnDecl, 'associated_fn_name');
        if (assocNode) {
            const [ownerNode, memberNode] = assocNode.namedChildren;
            if (!ownerNode || !memberNode)
                return;
            const paramList = findNamedChild(fnDecl, 'param_list');
            const returnType = findNamedChild(fnDecl, 'return_type');
            const signature = `${exported ? 'export ' : ''}fun ${ownerNode.text}.${memberNode.text}(${paramList?.text ?? ''})${returnType ? ` ${returnType.text}` : ''}`;
            const assocSymbol = createSymbol(memberNode, 'function', {
                detail: namespace ? `method in ${namespace.name}` : exported ? 'exported associated function' : 'associated function',
                name: `${ownerNode.text}.${memberNode.text}`,
                signature,
                returnTypeText: returnType?.text,
                containerName: namespace?.name ?? ownerNode.text,
                exported,
                topLevel: false,
            });
            if (namespace)
                namespace.assocKeys.set(`${ownerNode.text}.${memberNode.text}`, assocSymbol.key);
            else
                topLevelAssocKeys.set(`${ownerNode.text}.${memberNode.text}`, assocSymbol.key);
            if (!namespace && protocolTypeNames.has(ownerNode.text)) {
                const selfTypeNode = findNamedChildren(paramList, 'param')[0]?.namedChildren.at(-1);
                if (selfTypeNode)
                    registerProtocolAssocForSelfType(selfTypeNode.text, memberNode.text, assocSymbol.key);
            }
            return;
        }
        const nameNode = findNamedChild(fnDecl, 'identifier');
        if (!nameNode)
            return;
        const paramList = findNamedChild(fnDecl, 'param_list');
        const returnType = findNamedChild(fnDecl, 'return_type');
        const signature = `${exported ? 'export ' : ''}fun ${nameNode.text}(${paramList?.text ?? ''})${returnType ? ` ${returnType.text}` : ''}`;
        const functionSymbol = createSymbol(nameNode, 'function', {
            detail: namespace ? `function in ${namespace.name}` : exported ? 'exported function' : 'function',
            exported,
            signature,
            returnTypeText: returnType?.text,
            containerName: namespace?.name,
            topLevel: !namespace,
        });
        if (namespace)
            namespace.valueKeys.set(nameNode.text, functionSymbol.key);
        else
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
    function collectModuleGlobal(globalDecl, namespace) {
        const nameNode = findNamedChild(globalDecl, 'identifier');
        const typeNode = globalDecl.namedChildren[1];
        if (!nameNode || !typeNode)
            return;
        const globalSymbol = createSymbol(nameNode, 'global', { detail: `global binding in ${namespace.name}`, signature: `let ${nameNode.text}: ${typeNode.text}`, typeText: typeNode.text, containerName: namespace.name });
        namespace.valueKeys.set(nameNode.text, globalSymbol.key);
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
    function collectJsgenDeclaration(jsgenDecl) {
        const sourceNode = findNamedChild(jsgenDecl, 'jsgen_lit');
        const nameNode = findNamedChild(jsgenDecl, 'identifier');
        if (!sourceNode || !nameNode)
            return;
        const paramList = findNamedChild(jsgenDecl, 'import_param_list');
        const returnTypeNode = findNamedChild(jsgenDecl, 'return_type');
        if (!returnTypeNode)
            return;
        const importSymbol = createSymbol(nameNode, 'importFunction', { detail: 'inline js import', signature: `escape ${sourceNode.text} ${nameNode.text}(${paramList?.text ?? ''}) ${returnTypeNode.text}`, returnTypeText: returnTypeNode.text, topLevel: true });
        rememberSymbolKey(topLevelValueKeys, importSymbol);
    }
    function collectModuleImport(importDecl, namespace) {
        const moduleNode = findNamedChild(importDecl, 'string_lit');
        const nameNode = findNamedChild(importDecl, 'identifier');
        if (!moduleNode || !nameNode)
            return;
        const returnTypeNode = findNamedChild(importDecl, 'return_type');
        if (returnTypeNode) {
            const paramList = findNamedChild(importDecl, 'import_param_list');
            const importSymbol = createSymbol(nameNode, 'importFunction', {
                detail: `host import in ${namespace.name}`,
                signature: `shimport ${moduleNode.text} ${nameNode.text}(${paramList?.text ?? ''}) ${returnTypeNode.text}`,
                returnTypeText: returnTypeNode.text,
                containerName: namespace.name,
            });
            namespace.valueKeys.set(nameNode.text, importSymbol.key);
            return;
        }
        const typeNode = importDecl.namedChildren.at(-1);
        if (!typeNode || typeNode.type === 'identifier')
            return;
        const importSymbol = createSymbol(nameNode, 'importValue', {
            detail: `host import value in ${namespace.name}`,
            signature: `shimport ${moduleNode.text} ${nameNode.text}: ${typeNode.text}`,
            typeText: typeNode.text,
            containerName: namespace.name,
        });
        namespace.valueKeys.set(nameNode.text, importSymbol.key);
    }
    function collectModuleJsgen(jsgenDecl, namespace) {
        const sourceNode = findNamedChild(jsgenDecl, 'jsgen_lit');
        const nameNode = findNamedChild(jsgenDecl, 'identifier');
        const returnTypeNode = findNamedChild(jsgenDecl, 'return_type');
        if (!sourceNode || !nameNode || !returnTypeNode)
            return;
        const paramList = findNamedChild(jsgenDecl, 'import_param_list');
        const jsgenSymbol = createSymbol(nameNode, 'importFunction', {
            detail: `inline js import in ${namespace.name}`,
            signature: `escape ${sourceNode.text} ${nameNode.text}(${paramList?.text ?? ''}) ${returnTypeNode.text}`,
            returnTypeText: returnTypeNode.text,
            containerName: namespace.name,
        });
        namespace.valueKeys.set(nameNode.text, jsgenSymbol.key);
    }
    function collectConstructDeclaration(constructDecl) {
        const namedChildren = constructDecl.namedChildren;
        const aliasNode = namedChildren[0]?.type === 'identifier' && namedChildren.length > 1 ? namedChildren[0] : undefined;
        const moduleNode = aliasNode ? namedChildren[1] : namedChildren[0];
        const namespace = resolveNamespaceNode(moduleNode);
        if (!namespace)
            return;
        if (aliasNode) {
            constructAliases.set(aliasNode.text, namespace);
            return;
        }
        for (const [name, key] of namespace.valueKeys) {
            if (!openValueKeys.has(name))
                openValueKeys.set(name, key);
        }
        for (const [name, key] of namespace.typeKeys) {
            if (!openTypeKeys.has(name)) {
                openTypeKeys.set(name, key);
                openTypeNamespaces.set(name, namespace);
            }
        }
    }
    function collectTestDeclaration(testDecl) {
        const nameNode = findNamedChild(testDecl, 'string_lit');
        if (!nameNode)
            return;
        createSymbol(nameNode, 'test', { detail: 'test case', name: stringLiteralName(nameNode), signature: `test ${nameNode.text}`, topLevel: true });
    }
    function collectBenchDeclaration(benchDecl) {
        const nameNode = findNamedChild(benchDecl, 'string_lit');
        if (!nameNode)
            return;
        createSymbol(nameNode, 'bench', { detail: 'benchmark', name: stringLiteralName(nameNode), signature: `bench ${nameNode.text}`, topLevel: true });
    }
    function walkTopLevelItem(item) {
        if (item.type !== 'export_decl')
            return void topLevelHandlers[item.type]?.walk(item);
        const fnDecl = findNamedChild(item, 'fn_decl');
        if (fnDecl)
            walkFunction(fnDecl);
    }
    function walkModuleDeclaration(moduleDecl) {
        const namespace = resolveNamespaceNode(findNamedChild(moduleDecl, 'identifier'));
        if (!namespace)
            return;
        moduleScopes.push(namespace);
        try {
            for (const item of moduleDecl.namedChildren) {
                if (item.type === 'identifier' || item.type === 'module_type_param_list')
                    continue;
                topLevelHandlers[item.type]?.walk?.(item);
            }
        }
        finally {
            moduleScopes.pop();
        }
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
    function walkJsgen(jsgenDecl) {
        const returnTypeNode = findNamedChild(jsgenDecl, 'return_type');
        if (!returnTypeNode)
            return;
        for (const paramNode of findNamedChildren(findNamedChild(jsgenDecl, 'import_param_list'), 'param')) {
            const typeNode = paramNode.namedChildren.at(-1);
            if (typeNode) walkTypeAnnotation(typeNode);
        }
        walkTypeAnnotation(returnTypeNode);
    }
    function walkTest(testDecl) { walkBlock(findNamedChild(testDecl, 'block')); }
    function walkBench(benchDecl) {
        const setupDecl = findNamedChild(benchDecl, 'setup_decl');
        if (!setupDecl)
            return;
        withScope(localScopes, () => {
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
        const typeNode = node.namedChildren[0];
        if (!typeNode)
            return;
        walkTypeAnnotation(typeNode);
        const ownerType = formatTypeName(inferTypeNodeText(typeNode));
        for (const fieldInit of findNamedChildren(node, 'field_init')) {
            const fieldNameNode = findNamedChild(fieldInit, 'identifier');
            const valueNode = fieldInit.namedChildren.at(-1);
            if (fieldNameNode) {
                const fieldKey = resolveFieldKey(ownerType, fieldNameNode.text);
                if (!fieldKey)
                    addSemanticDiagnostic(fieldNameNode, `Unknown field "${fieldNameNode.text}" in struct initializer for "${ownerType}".`);
                addResolvedOccurrence(fieldNameNode, 'field', fieldKey);
            }
            if (valueNode)
                walkExpression(valueNode);
        }
    }
    function walkQualifiedTypeReference(node) {
        walkQualifiedTypeLike(node);
    }
    function walkTypeMemberExpression(node) {
        const ownerNode = node.namedChildren[0];
        const memberNode = node.namedChildren.at(-1);
        if (!ownerNode || !memberNode)
            return;
        walkTypeAnnotation(ownerNode);
        addResolvedOccurrence(memberNode, 'value', resolveAssociatedKey(ownerNode, memberNode.text));
    }
    function walkFieldExpression(node) {
        const [baseNode, fieldNameNode] = node.namedChildren;
        if (!baseNode || !fieldNameNode)
            return;
        const moduleNamespace = resolveExpressionNamespaceNode(baseNode);
        if (moduleNamespace) {
            const symbolKey = resolveNamespaceValueOrPromotedAssocKey(moduleNamespace, fieldNameNode.text);
            if (!symbolKey)
                addSemanticDiagnostic(fieldNameNode, `Unknown member "${fieldNameNode.text}" in namespace "${moduleNamespace.name}".`);
            addResolvedOccurrence(fieldNameNode, 'value', symbolKey);
            return;
        }
        walkExpression(baseNode);
        const baseType = inferExpressionType(baseNode);
        const fieldKey = baseType ? resolveFieldKey(baseType, fieldNameNode.text) : undefined;
        const getterKey = resolveMethodCallKey(node);
        const getterSymbol = lookupSymbol(getterKey);
        const protocolGetter = getterSymbol?.detail?.includes('protocol getter');
        if (protocolGetter) {
            addResolvedOccurrence(fieldNameNode, 'value', getterKey);
            return;
        }
        if (baseType && !fieldKey)
            addSemanticDiagnostic(fieldNameNode, `Unknown field "${fieldNameNode.text}" on type "${formatTypeName(baseType)}".`);
        addResolvedOccurrence(fieldNameNode, 'field', fieldKey);
    }
    function walkAssignExpression(node) {
        const [lhsNode, rhsNode] = node.namedChildren;
        if (!lhsNode)
            return;
        if (lhsNode.type === 'field_expr') {
            const [baseNode, fieldNameNode] = lhsNode.namedChildren;
            if (baseNode && fieldNameNode) {
                const moduleNamespace = resolveExpressionNamespaceNode(baseNode);
                if (moduleNamespace) {
                    const symbolKey = resolveNamespaceValueOrPromotedAssocKey(moduleNamespace, fieldNameNode.text);
                    if (!symbolKey)
                        addSemanticDiagnostic(fieldNameNode, `Unknown member "${fieldNameNode.text}" in namespace "${moduleNamespace.name}".`);
                    addResolvedOccurrence(fieldNameNode, 'value', symbolKey);
                } else {
                    walkExpression(baseNode);
                    const baseType = inferExpressionType(baseNode);
                    const fieldKey = baseType ? resolveFieldKey(baseType, fieldNameNode.text) : undefined;
                    const setterKey = resolveSetterKey(lhsNode);
                    const setterSymbol = lookupSymbol(setterKey);
                    const protocolSetter = setterSymbol?.detail?.includes('protocol setter');
                    if (protocolSetter) addResolvedOccurrence(fieldNameNode, 'value', setterKey);
                    else {
                        if (baseType && !fieldKey)
                            addSemanticDiagnostic(fieldNameNode, `Unknown field "${fieldNameNode.text}" on type "${formatTypeName(baseType)}".`);
                        addResolvedOccurrence(fieldNameNode, 'field', fieldKey);
                    }
                }
            }
            if (rhsNode)
                walkExpression(rhsNode);
            return;
        }
        walkExpression(lhsNode);
        if (rhsNode)
            walkExpression(rhsNode);
    }
    function walkCallExpression(node) {
        const [calleeNode, argListNode] = node.namedChildren;
        const args = argListNode?.type === 'arg_list' ? argListNode.namedChildren : [];
        if (calleeNode?.type === 'identifier') {
            const symbolKey = resolveValueKey(calleeNode.text);
            const symbol = lookupSymbol(symbolKey);
            if (!symbol)
                addSemanticDiagnostic(calleeNode, `Undefined function or import "${calleeNode.text}".`);
            else if (!isCallableValueSymbol(symbol))
                addSemanticDiagnostic(calleeNode, `Cannot call "${calleeNode.text}" because it is not a function.`);
            addResolvedOccurrence(calleeNode, 'value', symbolKey);
            walkExpressions(args);
            return;
        }
        if (calleeNode?.type === 'field_expr') {
            const [baseNode, memberNode] = calleeNode.namedChildren;
            const moduleNamespace = resolveExpressionNamespaceNode(baseNode);
            if (moduleNamespace && memberNode) {
                const symbolKey = resolveNamespaceValueOrPromotedAssocKey(moduleNamespace, memberNode.text);
                if (!symbolKey)
                    addSemanticDiagnostic(memberNode, `Unknown member "${memberNode.text}" in namespace "${moduleNamespace.name}".`);
                addResolvedOccurrence(memberNode, 'value', symbolKey);
                walkExpressions(args);
                return;
            }
            const methodKey = resolveMethodCallKey(calleeNode);
            if (memberNode && methodKey) {
                walkExpression(baseNode);
                addResolvedOccurrence(memberNode, 'value', methodKey);
                walkExpressions(args);
                return;
            }
            if (memberNode) {
                walkExpression(baseNode);
                const baseType = inferExpressionType(baseNode);
                const fieldKey = baseType ? resolveFieldKey(baseType, memberNode.text) : undefined;
                if (baseType && fieldKey)
                    addSemanticDiagnostic(memberNode, `Cannot call field "${memberNode.text}" on type "${formatTypeName(baseType)}".`);
                else if (baseType)
                    addSemanticDiagnostic(memberNode, `Unknown method "${memberNode.text}" on type "${formatTypeName(baseType)}".`);
                addResolvedOccurrence(memberNode, 'value', methodKey);
                walkExpressions(args);
                return;
            }
        }
        if (calleeNode?.type === 'type_member_expr') {
            const [ownerNode, memberNode] = calleeNode.namedChildren;
            if (ownerNode && memberNode) {
                const ownerResolution = getTypeResolution(ownerNode);
                walkTypeAnnotation(ownerNode);
                const symbolKey = resolveAssociatedKey(ownerNode, memberNode.text);
                if (ownerResolution.key && !symbolKey)
                    addSemanticDiagnostic(memberNode, `Unknown associated function "${memberNode.text}" on type "${ownerResolution.typeName}".`);
                addResolvedOccurrence(memberNode, 'value', symbolKey);
                walkExpressions(args);
                return;
            }
        }
        walkExpression(calleeNode);
        walkExpressions(args);
    }
    function walkPromotedModuleCallExpression(node) {
        const namespace = resolveNamespaceByName(findModuleNameNode(node)?.text ?? '');
        const memberNode = findNamedChild(node, 'identifier');
        if (memberNode)
            addResolvedOccurrence(memberNode, 'value', resolveNamespaceValueOrPromotedAssocKey(namespace, memberNode.text));
        walkExpressions(findNamedChild(node, 'arg_list')?.namedChildren ?? []);
    }
    function walkNamespaceCallExpression(node) {
        const methodNode = findNamedChild(node, 'identifier');
        const namespace = node.children[0]?.text ?? 'builtin';
        if (!methodNode)
            return;
        if (!(BUILTIN_METHODS[namespace] ?? []).includes(methodNode.text))
            addSemanticDiagnostic(methodNode, `Unknown builtin method "${namespace}.${methodNode.text}".`);
        else
            addBuiltinOccurrence(rangeForBuiltinNode(document, node), `${namespace}.${methodNode.text}`, node.text);
        walkExpressions(findNamedChild(node, 'arg_list')?.namedChildren ?? []);
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
        const typeNode = node.namedChildren.at(-1);
        addBuiltinOccurrence(spanFromOffsets(document, node.startIndex, node.startIndex + 'ref.null'.length), 'ref.null');
        if (typeNode)
            walkTypeAnnotation(typeNode);
    }
    function walkPipeExpression(node) {
        const [valueNode, targetNode] = node.namedChildren;
        walkExpression(valueNode);
        walkPipeTarget(targetNode);
    }
    function walkPipeTarget(node) {
        if (!node)
            return;
        const pathParts = node.namedChildren.filter((child) => child.type !== 'pipe_args');
        if (pathParts.length === 0)
            return;
        const first = pathParts[0];
        const second = pathParts[1];
        if (first.type === 'identifier' && second?.type === 'identifier' && isBuiltinNamespace(first.text)) {
            if (!(BUILTIN_METHODS[first.text] ?? []).includes(second.text))
                addSemanticDiagnostic(second, `Unknown builtin method "${first.text}.${second.text}".`);
            else
                addBuiltinOccurrence(spanFromOffsets(document, node.startIndex, second.endIndex), `${first.text}.${second.text}`, `${first.text}.${second.text}`);
        }
        else {
            const namespace = resolveExpressionNamespaceNode(first);
            if (namespace && second?.type === 'identifier' && pathParts.length === 2) {
                const symbolKey = resolveNamespaceValueOrPromotedAssocKey(namespace, second.text);
                if (!symbolKey)
                    addSemanticDiagnostic(second, `Unknown member "${second.text}" in namespace "${namespace.name}".`);
                addResolvedOccurrence(second, 'value', symbolKey);
            }
            else if (namespace && second?.type === 'type_ident' && pathParts[2]?.type === 'identifier') {
                const typeKey = namespace.typeKeys.get(second.text);
                if (!typeKey)
                    addSemanticDiagnostic(second, `Unknown type "${second.text}" in namespace "${namespace.name}".`);
                addResolvedOccurrence(second, 'type', typeKey);
                const assocKey = namespace.assocKeys.get(`${second.text}.${pathParts[2].text}`);
                if (typeKey && !assocKey)
                    addSemanticDiagnostic(pathParts[2], `Unknown associated function "${pathParts[2].text}" on type "${second.text}".`);
                addResolvedOccurrence(pathParts[2], 'value', assocKey);
            }
            else if (first.type === 'type_ident' && second?.type === 'identifier') {
                const typeKey = resolveTypeKey(first.text);
                if (!typeKey)
                    addSemanticDiagnostic(first, `Undefined type "${first.text}".`);
                addResolvedOccurrence(first, 'type', typeKey);
                const assocKey = resolveAssociatedKey(first, second.text);
                if (typeKey && !assocKey)
                    addSemanticDiagnostic(second, `Unknown associated function "${second.text}" on type "${first.text}".`);
                addResolvedOccurrence(second, 'value', assocKey);
            }
            else if (first.type === 'identifier') {
                const symbolKey = resolveValueKey(first.text);
                if (!symbolKey)
                    addSemanticDiagnostic(first, `Undefined function or import "${first.text}".`);
                addResolvedOccurrence(first, 'value', symbolKey);
            }
        }
        walkExpressions(findNamedChildren(findNamedChild(node, 'pipe_args'), 'pipe_arg').map((pipeArg) => pipeArg.namedChildren[0]));
    }
    function walkPromoteExpression(node) {
        const [subjectNode, captureNode, thenBlock, elseBlock] = node.namedChildren;
        if (subjectNode)
            walkExpression(subjectNode);
        const captureNameNode = findNamedChild(captureNode, 'identifier');
        const captureTypeText = stripNullableTypeText(inferExpressionType(subjectNode));
        if (thenBlock) {
            withScope(localScopes, () => {
                if (captureNameNode)
                    declareLocalTypeText(captureNameNode, 'binding', 'promote capture', captureTypeText);
                walkBlock(thenBlock);
            });
        }
        if (elseBlock)
            walkBlock(elseBlock);
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
            const typeKey = resolveTypeKey(node.text);
            if (!typeKey)
                addSemanticDiagnostic(node, `Undefined type "${node.text}".`);
            addResolvedOccurrence(node, 'type', typeKey);
            return;
        }
        if (node.type === 'instantiated_module_ref') {
            walkQualifiedTypeLike(node);
            return;
        }
        if (node.type === 'qualified_type_ref') {
            walkQualifiedTypeLike(node);
            return;
        }
        if (node.type === 'inline_module_type_path') {
            walkQualifiedTypeLike(node);
            return;
        }
        walkExpressions(node.namedChildren, walkTypeAnnotation);
    }
    function resolveNamespaceByName(name) {
        return (moduleScopes.at(-1)?.name === name ? moduleScopes.at(-1) : undefined)
            ?? constructAliases.get(name)
            ?? moduleNamespaces.get(name);
    }
    function resolveNamespaceNode(node) {
        if (!node)
            return undefined;
        if (node.type === 'module_ref')
            return resolveNamespaceNode(findModuleNameNode(node));
        if (node.type === 'qualified_type_ref')
            return resolveNamespaceNode(node.namedChildren[0]);
        if (node.type === 'identifier')
            return resolveNamespaceByName(node.text);
        if (node.type === 'type_ident')
            return resolveNamespaceByName(node.text);
        if (['instantiated_module_ref', 'inline_module_type_path'].includes(node.type))
            return resolveNamespaceByName(findModuleNameNode(node)?.text ?? '');
        return undefined;
    }
    function resolveExpressionNamespaceNode(node) {
        if (!node)
            return undefined;
        if (node.type === 'identifier' && resolveValueKey(node.text))
            return undefined;
        return resolveNamespaceNode(node);
    }
    function resolveQualifiedTypeKey(node) {
        const namespace = resolveNamespaceNode(node);
        const typeNode = findNamedChild(node, 'type_ident');
        return typeNode
            ? namespace?.typeKeys.get(typeNode.text)
            : namespace?.promotedTypeName
                ? namespace.typeKeys.get(namespace.promotedTypeName)
                : undefined;
    }
    function resolveAssociatedKeyByOwnerName(ownerName, memberName) {
        const promoted = resolveNamespaceByName(ownerName);
        return moduleScopes.at(-1)?.assocKeys.get(`${ownerName}.${memberName}`)
            ?? openTypeNamespaces.get(ownerName)?.assocKeys.get(`${ownerName}.${memberName}`)
            ?? promoted?.assocKeys.get(`${promoted.promotedTypeName ?? ''}.${memberName}`)
            ?? topLevelAssocKeys.get(`${ownerName}.${memberName}`)
            ?? protocolAssocKeysBySelf.get(`${ownerName}.${memberName}`);
    }
    function resolveSetterKeyByOwnerName(ownerName, memberName) {
        const promoted = resolveNamespaceByName(ownerName);
        return moduleScopes.at(-1)?.assocKeys.get(`${ownerName}.${memberName}`)
            ?? openTypeNamespaces.get(ownerName)?.assocKeys.get(`${ownerName}.${memberName}`)
            ?? promoted?.assocKeys.get(`${promoted.promotedTypeName ?? ''}.${memberName}`)
            ?? topLevelSetterAssocKeys.get(`${ownerName}.${memberName}`)
            ?? protocolSetterAssocKeysBySelf.get(`${ownerName}.${memberName}`);
    }
    function resolveAssociatedKey(ownerNode, memberName) {
        if (!ownerNode)
            return undefined;
        if (['qualified_type_ref', 'inline_module_type_path', 'instantiated_module_ref'].includes(ownerNode.type)) {
            const namespace = resolveNamespaceNode(ownerNode);
            const typeNode = findNamedChild(ownerNode, 'type_ident');
            const ownerName = typeNode?.text ?? namespace?.promotedTypeName;
            return ownerName ? namespace?.assocKeys.get(`${ownerName}.${memberName}`) : undefined;
        }
        const ownerName = ownerNode.type === 'type_ident' ? ownerNode.text : findNamedChild(ownerNode, 'type_ident')?.text;
        return ownerName ? resolveAssociatedKeyByOwnerName(ownerName, memberName) : undefined;
    }
    function resolveNamespaceText(text) {
        const normalized = normalizeTypeText(text);
        if (!normalized)
            return undefined;
        const head = normalized.split('.')[0];
        const bracketIndex = head.indexOf('[');
        return resolveNamespaceByName(bracketIndex >= 0 ? head.slice(0, bracketIndex) : head);
    }
    function resolveOwnerInfoFromTypeText(typeText) {
        const normalized = normalizeTypeText(typeText);
        if (!normalized)
            return undefined;
        const lastDot = normalized.lastIndexOf('.');
        if (lastDot >= 0) {
            const namespace = resolveNamespaceText(normalized.slice(0, lastDot));
            const owner = normalized.slice(lastDot + 1);
            return owner ? { owner, namespace } : undefined;
        }
        if (normalized.includes('[')) {
            const namespace = resolveNamespaceText(normalized);
            return namespace?.promotedTypeName ? { owner: namespace.promotedTypeName, namespace } : undefined;
        }
        if (openTypeNamespaces.has(normalized))
            return { owner: normalized, namespace: openTypeNamespaces.get(normalized) };
        if (moduleScopes.at(-1)?.typeKeys.has(normalized))
            return { owner: normalized, namespace: moduleScopes.at(-1) };
        return { owner: normalized, namespace: undefined };
    }
    function qualifyTypeTextWithOwnerNode(typeText, ownerNode) {
        let value = typeText?.trim();
        if (!value)
            return value;
        const nullablePrefix = value.startsWith('?') ? '?' : '';
        const bareValue = nullablePrefix ? value.slice(1).trim() : value;
        if (!bareValue || bareValue.includes('.') || bareValue.includes('['))
            return value;
        const namespace = resolveNamespaceNode(ownerNode);
        const prefix = ownerNode?.type === 'qualified_type_ref' || ownerNode?.type === 'inline_module_type_path'
            ? ownerNode.text.slice(0, ownerNode.text.lastIndexOf('.'))
            : ownerNode?.type === 'instantiated_module_ref'
                ? ownerNode.text
                : undefined;
        return namespace?.typeKeys.has(bareValue) && prefix
            ? `${nullablePrefix}${prefix}.${bareValue}`
            : value;
    }
    function resolveAssociatedKeyFromTypeText(typeText, memberName) {
        const ownerInfo = resolveOwnerInfoFromTypeText(typeText);
        if (!ownerInfo?.owner)
            return undefined;
        if (ownerInfo.namespace) {
            const direct = ownerInfo.namespace.assocKeys.get(`${ownerInfo.owner}.${memberName}`);
            if (direct)
                return direct;
        }
        return resolveAssociatedKeyByOwnerName(ownerInfo.owner, memberName);
    }
    function resolveSetterKeyFromTypeText(typeText, memberName) {
        const ownerInfo = resolveOwnerInfoFromTypeText(typeText);
        if (!ownerInfo?.owner)
            return undefined;
        return resolveSetterKeyByOwnerName(ownerInfo.owner, memberName);
    }
    function resolveMethodCallKey(node) {
        const [baseNode, memberNode] = node.namedChildren;
        const baseType = inferExpressionType(baseNode);
        return memberNode && baseType ? resolveAssociatedKeyFromTypeText(baseType, memberNode.text) : undefined;
    }
    function resolveSetterKey(node) {
        const [baseNode, memberNode] = node.namedChildren;
        const baseType = inferExpressionType(baseNode);
        return memberNode && baseType ? resolveSetterKeyFromTypeText(baseType, memberNode.text) : undefined;
    }
    function inferTypeNodeText(node) {
        return node?.type === 'instantiated_module_ref' ? findModuleNameNode(node)?.text : node?.text;
    }
    function declareLocal(symbol) { localScopes.at(-1)?.set(symbol.name, symbol.key); }
    function resolveValueKey(name) {
        for (let index = localScopes.length - 1; index >= 0; index -= 1) {
            const key = localScopes[index].get(name);
            if (key)
                return key;
        }
        return moduleScopes.at(-1)?.valueKeys.get(name)
            ?? openValueKeys.get(name)
            ?? topLevelValueKeys.get(name);
    }
    function resolveTypeKey(name) {
        return moduleScopes.at(-1)?.typeKeys.get(name)
            ?? openTypeKeys.get(name)
            ?? resolvePromotedTypeKeyByName(name)
            ?? topLevelTypeKeys.get(name);
    }
    function resolveFieldKey(ownerTypeText, fieldName) {
        for (const candidateType of expandTypeCandidates(ownerTypeText)) {
            const fieldKey = fieldsByOwner.get(candidateType)?.get(fieldName);
            if (fieldKey) return fieldKey;
        }
        return undefined;
    }
    function inferIndexExpressionType(node) {
        const baseType = inferExpressionType(node.namedChildren[0]);
        const normalized = normalizeTypeText(baseType);
        const match = /^array\[(.+)\]$/u.exec(normalized ?? '');
        return match?.[1];
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
        const moduleNamespace = resolveExpressionNamespaceNode(baseNode);
        if (moduleNamespace) {
            const symbol = lookupSymbol(resolveNamespaceValueOrPromotedAssocKey(moduleNamespace, fieldNode.text));
            return symbol?.returnTypeText ?? symbol?.typeText;
        }
        const baseType = inferExpressionType(baseNode);
        if (!baseType)
            return undefined;
        const fieldSymbol = lookupSymbol(resolveFieldKey(baseType, fieldNode.text));
        if (fieldSymbol?.typeText)
            return fieldSymbol.typeText;
        const getterSymbol = lookupSymbol(resolveMethodCallKey(node));
        return getterSymbol?.returnTypeText ?? getterSymbol?.typeText;
    }
    function inferCallExpressionType(node) {
        const calleeNode = node.namedChildren[0];
        if (!calleeNode)
            return undefined;
        if (calleeNode.type === 'identifier')
            return inferIdentifierType(calleeNode);
        if (calleeNode.type === 'field_expr') {
            const methodSymbol = lookupSymbol(resolveMethodCallKey(calleeNode));
            return methodSymbol?.returnTypeText ?? methodSymbol?.typeText ?? inferFieldExpressionType(calleeNode);
        }
        if (calleeNode.type === 'type_member_expr')
            return inferTypeMemberExpressionType(calleeNode);
        return calleeNode.type === 'namespace_call_expr' ? getBuiltinReturnType(builtinKeyFromNamespaceCall(calleeNode)) : undefined;
    }
    function inferPromotedModuleCallType(node) {
        const namespace = resolveNamespaceByName(findModuleNameNode(node)?.text ?? '');
        const memberNode = findNamedChild(node, 'identifier');
        const symbol = lookupSymbol(memberNode ? resolveNamespaceValueOrPromotedAssocKey(namespace, memberNode.text) : undefined);
        return symbol?.returnTypeText ?? symbol?.typeText;
    }
    function inferTypeMemberExpressionType(node) {
        const memberNode = node.namedChildren.at(-1);
        if (!memberNode)
            return undefined;
        const symbol = lookupSymbol(resolveAssociatedKey(node.namedChildren[0], memberNode.text));
        return qualifyTypeTextWithOwnerNode(symbol?.returnTypeText ?? symbol?.typeText, node.namedChildren[0]);
    }
    function inferStructInitType(node) { return inferTypeNodeText(node.namedChildren[0]); }
    function inferArrayInitType(node) { return node.namedChildren[0] ? `array[${node.namedChildren[0].text}]` : 'array[T]'; }
    function inferRefNullType(node) {
        const typeNode = node.namedChildren.at(-1);
        const typeText = inferTypeNodeText(typeNode);
        return typeText ? `?${typeText}` : undefined;
    }
    function inferElseExpressionType(node) {
        return inferExpressionType(node.namedChildren[1]) ?? stripNullableTypeText(inferExpressionType(node.namedChildren[0]));
    }
    function inferPromoteExpressionType(node) {
        const thenBlock = node.namedChildren[2];
        const elseBlock = node.namedChildren[3];
        return inferBlockType(thenBlock) ?? inferBlockType(elseBlock);
    }
    function inferPipeExpressionType(node) {
        const targetNode = node.namedChildren.at(-1);
        return targetNode ? inferPipeTargetType(targetNode) : undefined;
    }
    function inferExpressionType(node) {
        return EXPRESSION_TYPE_INFERERS[node.type]?.(node);
    }
    function inferBlockType(node) {
        const expressionNode = node?.namedChildren.at(-1);
        return expressionNode ? inferExpressionType(expressionNode) : undefined;
    }
    function inferPipeTargetType(node) {
        if (!node)
            return undefined;
        const pathParts = node.namedChildren.filter((child) => child.type !== 'pipe_args');
        if (pathParts.length === 0)
            return undefined;
        const first = pathParts[0];
        const second = pathParts[1];
        if (first.type === 'identifier' && second?.type === 'identifier' && isBuiltinNamespace(first.text)) {
            return getBuiltinReturnType(`${first.text}.${second.text}`);
        }
        const namespace = resolveExpressionNamespaceNode(first);
        if (namespace && second?.type === 'identifier') {
            const symbol = lookupSymbol(resolveNamespaceValueOrPromotedAssocKey(namespace, second.text));
            return symbol?.returnTypeText ?? symbol?.typeText;
        }
        if (namespace && second?.type === 'type_ident' && pathParts[2]?.type === 'identifier') {
            const symbol = lookupSymbol(namespace.assocKeys.get(`${second.text}.${pathParts[2].text}`));
            return symbol?.returnTypeText ?? symbol?.typeText;
        }
        if (first.type === 'type_ident' && second?.type === 'identifier') {
            const symbol = lookupSymbol(resolveAssociatedKey(first, second.text));
            return symbol?.returnTypeText ?? symbol?.typeText;
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
function expandTypeCandidates(typeText) {
    const normalized = normalizeTypeText(typeText);
    if (!normalized)
        return [];
    const candidates = new Set([normalized]);
    const typeArgsIndex = normalized.indexOf('[');
    if (typeArgsIndex > 0)
        candidates.add(normalized.slice(0, typeArgsIndex));
    const lastDot = normalized.lastIndexOf('.');
    if (lastDot >= 0 && lastDot < normalized.length - 1)
        candidates.add(normalized.slice(lastDot + 1));
    return [...candidates];
}
function normalizeTypeText(typeText) {
    let value = typeText.trim();
    while (value.startsWith('(') && value.endsWith(')'))
        value = value.slice(1, -1).trim();
    return value;
}
function stripNullableTypeText(typeText) {
    let value = typeText?.trim();
    if (!value)
        return value;
    while (value.startsWith('(') && value.endsWith(')'))
        value = value.slice(1, -1).trim();
    if (value.startsWith('?'))
        value = value.slice(1).trim();
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

// Try to find the source span most relevant to a compile error.
// Checks binaryenOutput for "[wasm-validator error in function X]" to extract X,
// then maps X to the matching export/test/bench node.
function findCompileErrorSpan(rootNode, message, binaryenOutput, document) {
    const functionName = extractBinaryenFunctionName(binaryenOutput);
    if (functionName) {
        const node = findNodeForWatFunction(rootNode, functionName);
        if (node) return spanFromNode(document, node);
    }
    return { range: FILE_START_RANGE, offsetRange: FILE_START_OFFSET_RANGE };
}

function extractBinaryenFunctionName(binaryenOutput) {
    for (const line of (binaryenOutput ?? [])) {
        const match = line.match(/\[wasm-validator error in function (\S+)\]/);
        if (match) return match[1];
    }
    return null;
}

function findNodeForWatFunction(rootNode, watName) {
    // __utu_test_N → Nth test_decl
    const testMatch = watName.match(/^__utu_test_(\d+)$/);
    if (testMatch) {
        const tests = rootNode.namedChildren.filter(n => n.type === 'test_decl');
        return tests[parseInt(testMatch[1])] ?? null;
    }
    // __utu_bench_N → Nth bench_decl
    const benchMatch = watName.match(/^__utu_bench_(\d+)$/);
    if (benchMatch) {
        const benches = rootNode.namedChildren.filter(n => n.type === 'bench_decl');
        return benches[parseInt(benchMatch[1])] ?? null;
    }
    // top-level exported function
    for (const node of rootNode.namedChildren) {
        if (node.type === 'export_decl') {
            const fn = findNamedChild(node, 'fn_decl');
            const name = findNamedChild(fn, 'identifier')?.text;
            if (name === watName) return node;
        }
    }
    return null;
}
