import { getBuiltinNamespaceHover, getCoreTypeHover, getKeywordHover, getLiteralHover } from "../hoverDocs.js";
import { findNamedChild, spanFromNode, spanFromOffsets } from "../../../document/index.js";
import { findOccurrenceAtPosition, findSymbolAtPosition } from "../symbols.js";

export function resolveSymbol(index, position) {
    const occurrence = findOccurrenceAtPosition(index, position);
    if (occurrence?.builtinKey) {
        return undefined;
    }
    if (occurrence?.symbolKey) {
        return index.symbolByKey.get(occurrence.symbolKey);
    }
    return findSymbolAtPosition(index, position);
}

export function getFallbackHover(word) {
    return getCoreTypeHover(word)
        ?? getLiteralHover(word)
        ?? getKeywordHover(word)
        ?? getBuiltinNamespaceHover(word);
}

export function getOccurrencesForSymbol(index, symbolKey) { return index.occurrences.filter((occurrence) => occurrence.symbolKey === symbolKey); }

export function symbolToMarkup(symbol) {
    const sections = [`\`\`\`utu\n${symbol.signature}\n\`\`\``, symbol.detail];
    if (symbol.typeText)
        sections.push(`Type: \`${symbol.typeText}\``);
    if (symbol.returnTypeText)
        sections.push(`Returns: \`${symbol.returnTypeText}\``);
    if (symbol.containerName)
        sections.push(`Container: \`${symbol.containerName}\``);
    return { kind: 'markdown', value: sections.join('\n\n') };
}

export function rangeForBuiltinNode(document, node) {
    const methodNode = findNamedChild(node, 'identifier');
    return methodNode ? spanFromOffsets(document, node.startIndex, methodNode.endIndex) : spanFromNode(document, node);
}

export function withScope(scopes, action) {
    scopes.push(new Map());
    try {
        return action();
    }
    finally {
        scopes.pop();
    }
}
