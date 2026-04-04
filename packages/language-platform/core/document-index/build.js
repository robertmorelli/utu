import { BUILTIN_METHODS } from "../hoverDocs.js";
import { spanFromNode, walkNamedChildren } from "../../../document/index.js";
import { analyzeSourceLayout } from "../../../../packages/compiler/a1_5.js";
import { comparePositions, getDocumentUri, rangeKey } from "../types.js";
import { SYMBOL_METADATA } from "../../../language-spec/index.js";
import { normalizeTypeText } from "../completion-helpers.js";
import { createDocumentIndexResolutionFns } from "./build-resolution.js";
import { createCollectionFns } from "./collect.js";
import { createWalkHandlers } from "./build-walk-handlers.js";
import { getFallbackHover, getOccurrencesForSymbol, resolveSymbol, symbolToMarkup } from "./build-utils.js";
import { runDocumentIndexCollectionStage, runDocumentIndexSemanticStage } from "./build-index-stages.js";
import { createDocumentIndexWalkFns } from "./build-walk-stage.js";

export { resolveSymbol, getFallbackHover, getOccurrencesForSymbol, symbolToMarkup };

export function buildDocumentIndex(document, rootNode, diagnostics, { importedBindings = [] } = {}) {
    const uri = getDocumentUri(document);
    const sourceLayout = analyzeSourceLayout(rootNode);
    const symbols = [];
    const symbolByKey = new Map();
    const occurrences = [];
    const topLevelSymbols = [];
    const topLevelValueKeys = new Map();
    const topLevelTypeKeys = new Map();
    const topLevelAssocKeys = new Map();
    const topLevelSetterAssocKeys = new Map();
    const fieldsByOwner = new Map();
    const declaredModuleNamespaces = new Map();
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
    const addOccurrence = (occurrence) => void occurrences.push(occurrence);
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
    const addForeignSymbol = (symbol) => {
        if (!symbol || symbolByKey.has(symbol.key))
            return;
        symbolByKey.set(symbol.key, symbol);
    };

    const importedBindingsByLocalName = new Map();
    for (const binding of importedBindings) {
        if (!binding?.localName || !binding.namespace)
            continue;
        importedBindingsByLocalName.set(binding.localName, binding);
        moduleNamespaces.set(binding.localName, binding.namespace);
        if (binding.foreignSymbols) {
            for (const symbol of binding.foreignSymbols.values())
                addForeignSymbol(symbol);
        }
    }

    const {
        declareLocal,
        findModuleNameNode,
        formatTypeName,
        getMemberSymbolsForTypeText,
        getTypeResolution,
        inferExpressionType,
        inferTypeNodeText,
        isCallableValueSymbol,
        resolveAssociatedKey,
        resolveExpressionNamespaceNode,
        resolveFieldKey,
        resolveMethodCallKey,
        resolveNamespaceByName,
        resolveNamespaceNode,
        resolveNamespaceValueOrPromotedAssocKey,
        resolveSetterKey,
        resolveTypeKey,
        resolveValueKey,
    } = createDocumentIndexResolutionFns({
        builtinMethods: BUILTIN_METHODS,
        constructAliases,
        fieldsByOwner,
        localScopes,
        lookupSymbol,
        moduleNamespaces,
        moduleScopes,
        openTypeKeys,
        openTypeNamespaces,
        openValueKeys,
        protocolAssocKeysBySelf,
        protocolSetterAssocKeysBySelf,
        topLevelAssocKeys,
        topLevelSetterAssocKeys,
        topLevelTypeKeys,
        topLevelValueKeys,
    });

    const collectionCtx = {
        createSymbol,
        rememberSymbolKey,
        registerField,
        registerProtocolAssocForSelfType,
        registerProtocolSetterAssocForSelfType,
        resolveNamespaceNode: (node) => resolveNamespaceNode(node),
        topLevelHandlers: null,
        protocolTypeNames,
        taggedTypeProtocols,
        topLevelAssocKeys,
        topLevelSetterAssocKeys,
        topLevelTypeKeys,
        topLevelValueKeys,
        declaredModuleNamespaces,
        moduleNamespaces,
        constructAliases,
        openValueKeys,
        openTypeKeys,
        openTypeNamespaces,
        findModuleNameNode,
        sourceLayout,
    };
    const {
        collectTopLevelDeclarations,
        collectStructDeclaration,
        collectTypeDeclaration,
        collectProtoDeclaration,
        registerTaggedTypeProtocolAssocKeys,
        collectModuleDeclaration,
        collectFunctionDeclaration,
        collectGlobalDeclaration,
        collectJsgenDeclaration,
        collectConstructDeclaration,
        collectTestDeclaration,
        collectBenchDeclaration,
    } = createCollectionFns(collectionCtx);

    const walkFns = createDocumentIndexWalkFns({
        document,
        importedBindingsByLocalName,
        localScopes,
        moduleScopes,
        createSymbol,
        declareLocal,
        addSemanticDiagnostic,
        addResolvedOccurrence,
        addBuiltinOccurrence,
        lookupSymbol,
        findModuleNameNode,
        formatTypeName,
        getTypeResolution,
        inferExpressionType,
        inferTypeNodeText,
        isCallableValueSymbol,
        resolveAssociatedKey,
        resolveExpressionNamespaceNode,
        resolveFieldKey,
        resolveMethodCallKey,
        resolveNamespaceByName,
        resolveNamespaceNode,
        resolveNamespaceValueOrPromotedAssocKey,
        resolveSetterKey,
        resolveTypeKey,
        resolveValueKey,
    });

    const { topLevelHandlers, walkExpressionHandlers } = createWalkHandlers({
        collectModuleDeclaration,
        collectConstructDeclaration,
        collectStructDeclaration,
        collectProtoDeclaration,
        collectTypeDeclaration,
        collectFunctionDeclaration,
        collectGlobalDeclaration,
        collectJsgenDeclaration,
        collectTestDeclaration,
        collectBenchDeclaration,
        ...walkFns,
        walkNamedChildren,
    });
    walkFns.setTopLevelHandlers(topLevelHandlers);
    walkFns.setWalkExpressionHandlers(walkExpressionHandlers);
    collectionCtx.topLevelHandlers = topLevelHandlers;

    runDocumentIndexCollectionStage(rootNode, collectTopLevelDeclarations, registerTaggedTypeProtocolAssocKeys);
    runDocumentIndexSemanticStage(rootNode, walkFns.walkTopLevelItem);

    occurrences.sort((left, right) => comparePositions(left.range.start, right.range.start));
    return {
        uri,
        version: document.version,
        diagnostics,
        symbols,
        symbolByKey,
        occurrences,
        topLevelSymbols,
        moduleNamespaces,
        declaredModuleNamespaces,
        getMemberSymbolsForTypeText,
    };
}
