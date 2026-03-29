import {
    BUILTIN_METHODS,
    CORE_TYPE_COMPLETIONS,
    KEYWORD_COMPLETIONS,
    LITERAL_COMPLETIONS,
    getBuiltinHover,
    isBuiltinNamespace,
} from "./hoverDocs.js";
import { collectParseDiagnostics, getWordAtPosition } from "../../document/index.js";
import { copyRange, getDocumentUri } from "./types.js";
import { SYMBOL_METADATA } from "../../language-spec/index.js";
import { memberLabel, memberNodeText, inferCompletionExpressionType, treePoint } from "./completion-helpers.js";
import { cloneDiagnostic } from "./compile-diagnostics.js";
import { findOccurrenceAtPosition, findSymbolAtPosition, getSemanticTokenType } from "./symbols.js";
import { UtuWorkspaceSymbolIndex } from "./workspaceSymbols.js";
import {
    buildDocumentIndex,
    resolveSymbol,
    getFallbackHover,
    getOccurrencesForSymbol,
    symbolToMarkup,
} from "./document-index/build.js";
import { collectCompileDiagnostics } from "./document-index/compile.js";

export const DOCUMENT_INDEX_MODES = Object.freeze({
    EDITOR: "editor",
    VALIDATION: "validation",
    COMPILE: "compile",
});

const STATIC_COMPLETION_ITEMS = [
    ...createCompletionItems(KEYWORD_COMPLETIONS, "keyword"),
    ...createCompletionItems(Object.keys(BUILTIN_METHODS), "module"),
    ...createCompletionItems(CORE_TYPE_COMPLETIONS, "class"),
    ...createCompletionItems(LITERAL_COMPLETIONS, "keyword"),
];

function createCompletionItems(labels, kind) {
    return labels.map((label) => ({ label, kind }));
}

export class UtuLanguageService {
    parserService;
    validateWat;
    loadImport;
    cache = new Map();

    constructor(parserService, { validateWat = null, loadImport = null } = {}) {
        this.parserService = parserService;
        this.validateWat = validateWat;
        this.loadImport = loadImport;
    }

    dispose() { this.clear(); }
    invalidate(uri) {
        this.cache.get(uri)?.parsed?.dispose();
        this.cache.delete(uri);
    }
    clear() {
        for (const { parsed } of this.cache.values()) parsed?.dispose();
        this.cache.clear();
    }
    async getDiagnostics(document, { mode = "validation" } = {}) {
        return (await this.getDocumentIndex(document, { mode })).diagnostics.map(cloneDiagnostic);
    }

    async getDocumentIndex(document, { mode = DOCUMENT_INDEX_MODES.EDITOR } = {}) {
        const normalizedMode = normalizeDocumentIndexMode(mode);
        const documentState = await this.getCachedDocumentState(document);
        const cachedIndex = documentState.indexByMode.get(normalizedMode);
        if (cachedIndex) return cachedIndex;
        if (normalizedMode === DOCUMENT_INDEX_MODES.EDITOR) return documentState.index;
        const diagnostics = await collectCompileDiagnostics(documentState, this, document, { mode: normalizedMode });
        return diagnostics.length === documentState.index.diagnostics.length
            ? rememberModeIndex(documentState, normalizedMode, documentState.index)
            : rememberModeIndex(documentState, normalizedMode, { ...documentState.index, diagnostics });
    }

    async getCachedDocumentState(document) {
        const cacheKey = getDocumentUri(document);
        const cached = this.cache.get(cacheKey);
        if (cached && cached.version === document.version) return cached;
        cached?.parsed?.dispose();

        const source = document.getText();
        const parsed = await this.parserService.parseSource(source);
        const parseDiagnostics = collectParseDiagnostics(parsed.tree.rootNode, document);
        const index = buildDocumentIndex(document, parsed.tree.rootNode, parseDiagnostics.map(cloneDiagnostic));
        const entry = {
            version: document.version,
            source,
            parsed,
            tree: parsed.tree,
            parseDiagnostics,
            index,
            indexByMode: new Map([[DOCUMENT_INDEX_MODES.EDITOR, index]]),
        };
        this.cache.set(cacheKey, entry);
        return entry;
    }

    async getHover(document, position) {
        const index = await this.getDocumentIndex(document);
        const occurrence = findOccurrenceAtPosition(index, position);
        if (occurrence?.builtinKey) {
            const builtinHover = getBuiltinHover(occurrence.builtinKey);
            if (builtinHover) return { contents: builtinHover, range: copyRange(occurrence.range) };
        }
        const symbol = occurrence?.symbolKey ? index.symbolByKey.get(occurrence.symbolKey) : findSymbolAtPosition(index, position);
        if (symbol) return { contents: symbolToMarkup(symbol), range: copyRange(occurrence?.range ?? symbol.range) };
        const word = getWordAtPosition(document, position);
        if (!word) return undefined;
        const fallbackHover = getFallbackHover(word.text);
        if (!fallbackHover) return undefined;
        return { contents: fallbackHover, range: word.range };
    }

    async getDefinition(document, position) {
        return this.withResolvedSymbol(document, position, undefined, (_index, symbol) => ({ uri: symbol.uri, range: copyRange(symbol.range) }));
    }

    async getReferences(document, position, includeDeclaration) {
        return this.withResolvedSymbol(document, position, [], (index, symbol) => getOccurrencesForSymbol(index, symbol.key)
            .filter((occurrence) => includeDeclaration || !occurrence.isDefinition)
            .map((occurrence) => ({ uri: index.uri, range: copyRange(occurrence.range) })));
    }

    async getDocumentHighlights(document, position) {
        return this.withResolvedSymbol(document, position, [], (index, symbol) => getOccurrencesForSymbol(index, symbol.key)
            .map((occurrence) => ({ range: copyRange(occurrence.range), kind: occurrence.isDefinition ? "write" : "read" })));
    }

    async getCompletionItems(document, position) {
        const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
        const namespaceMatch = linePrefix.match(/\b([a-z0-9_]+)\.$/i);
        if (namespaceMatch && isBuiltinNamespace(namespaceMatch[1])) {
            return (BUILTIN_METHODS[namespaceMatch[1]] ?? []).map((method) => ({
                label: method,
                kind: "method",
                detail: `${namespaceMatch[1]}.${method}`,
            }));
        }
        const index = await this.getDocumentIndex(document);
        const memberItems = await this.getMemberCompletionItems(document, position, linePrefix, index);
        if (memberItems.length) return memberItems;
        return [
            ...STATIC_COMPLETION_ITEMS,
            ...index.topLevelSymbols
                .filter((symbol) => symbol.kind !== "test" && symbol.kind !== "bench")
                .map((symbol) => ({ label: symbol.name, kind: SYMBOL_METADATA[symbol.kind].completionKind, detail: symbol.signature })),
        ];
    }

    async getMemberCompletionItems(document, position, linePrefix, index) {
        const context = await this.findMemberCompletionContext(document, position, linePrefix, index);
        if (!context || !context.baseType) return [];
        return index.getMemberSymbolsForTypeText(context.baseType)
            .filter((symbol) => memberLabel(symbol).startsWith(context.prefix))
            .map((symbol) => ({
                label: memberLabel(symbol),
                kind: SYMBOL_METADATA[symbol.kind].completionKind,
                detail: symbol.signature,
            }));
    }

    async findMemberCompletionContext(document, position, linePrefix, index) {
        const suffixMatch = linePrefix.match(/\.([a-z_][a-z0-9_]*)?$/i);
        if (!suffixMatch) return null;
        const memberPrefix = suffixMatch[1] ?? "";
        const { tree } = await this.getCachedDocumentState(document);
        const rootNode = tree.rootNode;
        if (memberPrefix) {
            const anchor = treePoint(position.line, Math.max(position.character - 1, 0));
            let node = rootNode.namedDescendantForPosition(anchor, anchor);
            while (node) {
                if ((node.type === "field_expr" || node.type === "type_member_expr") && memberNodeText(node) === memberPrefix) {
                    return { baseType: inferCompletionExpressionType(node.namedChildren[0], index), prefix: memberPrefix };
                }
                node = node.parent;
            }
        }
        const dotColumn = position.character - 1;
        if (dotColumn < 0) return null;
        const anchor = treePoint(position.line, Math.max(dotColumn - 1, 0));
        let node = rootNode.namedDescendantForPosition(anchor, anchor);
        let best = null;
        while (node) {
            if (node.endPosition.row === position.line
                && node.endPosition.column === dotColumn
                && inferCompletionExpressionType(node, index)) {
                best = node;
            }
            node = node.parent;
        }
        return best ? { baseType: inferCompletionExpressionType(best, index), prefix: "" } : null;
    }

    async getDocumentSemanticTokens(document) {
        const index = await this.getDocumentIndex(document);
        const seen = new Set();
        const tokens = [];
        for (const occurrence of index.occurrences) {
            if (!occurrence.symbolKey) continue;
            const symbol = index.symbolByKey.get(occurrence.symbolKey);
            if (!symbol) continue;
            const tokenType = getSemanticTokenType(symbol);
            if (!tokenType) continue;
            const key = `${occurrence.range.start.line}:${occurrence.range.start.character}:${tokenType}`;
            if (seen.has(key)) continue;
            seen.add(key);
            tokens.push({ range: copyRange(occurrence.range), type: tokenType, modifiers: occurrence.isDefinition ? ["declaration"] : [] });
        }
        return tokens;
    }

    async getDocumentSymbols(document) {
        const index = await this.getDocumentIndex(document);
        return index.topLevelSymbols.map((symbol) => ({
            name: symbol.name,
            detail: symbol.detail,
            kind: SYMBOL_METADATA[symbol.kind].documentSymbolKind,
            range: copyRange(symbol.range),
            selectionRange: copyRange(symbol.range),
        }));
    }

    async getWorkspaceSymbols(query, documents) {
        const workspaceIndex = new UtuWorkspaceSymbolIndex(this);
        await workspaceIndex.syncDocuments(documents, { replace: true });
        return workspaceIndex.getWorkspaceSymbols(query);
    }

    async withResolvedSymbol(document, position, fallback, action) {
        const index = await this.getDocumentIndex(document);
        const symbol = resolveSymbol(index, position);
        return symbol ? action(index, symbol) : fallback;
    }
}

function normalizeDocumentIndexMode(mode) {
    switch (mode) {
        case DOCUMENT_INDEX_MODES.EDITOR:
        case DOCUMENT_INDEX_MODES.VALIDATION:
        case DOCUMENT_INDEX_MODES.COMPILE:
            return mode;
        default:
            throw new Error(`Unknown document index mode "${mode}"`);
    }
}

function rememberModeIndex(documentState, mode, index) {
    documentState.indexByMode.set(mode, index);
    return index;
}
