import { findNamedChild } from '../../document/index.js';
import { BUILTIN_METHODS, getBuiltinReturnType } from './hoverDocs.js';
import { LITERAL_TYPE_BY_NODE_TYPE } from '../../language-spec/index.js';

const BUILTIN_METHOD_COMPLETION_TYPES = new Map([
    ['array.len', 'i32'],
]);

export function normalizeTypeText(typeText) {
    let value = typeText.trim();
    while (value.startsWith('(') && value.endsWith(')'))
        value = value.slice(1, -1).trim();
    return value;
}

export function treePoint(line, character) {
    return { row: line, column: character };
}

export function samePosition(left, right) {
    return left?.line === right?.line && left?.character === right?.character;
}

export function sameRange(left, right) {
    return samePosition(left?.start, right?.start) && samePosition(left?.end, right?.end);
}

export function nodeRange(node) {
    return {
        start: { line: node.startPosition.row, character: node.startPosition.column },
        end: { line: node.endPosition.row, character: node.endPosition.column },
    };
}

export function memberNodeText(node) {
    return node?.namedChildren.at(-1)?.text ?? '';
}

export function memberLabel(symbol) {
    if (symbol.kind === 'field')
        return symbol.name;
    const memberName = symbol.name.includes('.') ? symbol.name.slice(symbol.name.lastIndexOf('.') + 1) : symbol.name;
    return memberName.endsWith('=') ? memberName.slice(0, -1) : memberName;
}

export function memberSymbolForType(index, typeText, memberName) {
    return index.getMemberSymbolsForTypeText(typeText).find((symbol) => memberLabel(symbol) === memberName);
}

export function builtinMethodKeyForType(typeText, memberName) {
    const normalized = normalizeTypeText(typeText);
    if (!normalized)
        return undefined;
    if (normalized.startsWith('array[') && BUILTIN_METHODS.array?.includes(memberName) && !memberName.startsWith('new'))
        return `array.${memberName}`;
    return undefined;
}

export function builtinMethodSymbolForType(typeText, memberName) {
    const builtinKey = builtinMethodKeyForType(typeText, memberName);
    if (!builtinKey)
        return undefined;
    const returnTypeText = BUILTIN_METHOD_COMPLETION_TYPES.get(builtinKey) ?? getBuiltinReturnType(builtinKey, normalizedArrayElemType(typeText));
    return {
        key: builtinKey,
        kind: 'function',
        name: builtinKey,
        signature: builtinKey,
        detail: 'builtin method',
        returnTypeText,
        topLevel: false,
    };
}

export function normalizedArrayElemType(typeText) {
    const normalized = normalizeTypeText(typeText);
    const match = /^array\[(.+)\]$/u.exec(normalized ?? '');
    return match?.[1];
}

export function inferCompletionExpressionType(node, index) {
    if (!node)
        return undefined;
    switch (node.type) {
        case 'identifier': {
            const occurrence = index.occurrences.find((candidate) => candidate.symbolKey && sameRange(candidate.range, nodeRange(node)));
            const symbol = occurrence?.symbolKey ? index.symbolByKey.get(occurrence.symbolKey) : undefined;
            return symbol?.typeText ?? symbol?.returnTypeText;
        }
        case 'paren_expr':
        case 'unary_expr':
            return inferCompletionExpressionType(node.namedChildren[0], index);
        case 'index_expr': {
            const baseType = normalizeTypeText(inferCompletionExpressionType(node.namedChildren[0], index) ?? '');
            const match = /^array\[(.+)\]$/u.exec(baseType);
            return match?.[1];
        }
        case 'field_expr': {
            const [baseNode, fieldNode] = node.namedChildren;
            const baseType = inferCompletionExpressionType(baseNode, index);
            const symbol = baseType && fieldNode
                ? memberSymbolForType(index, baseType, fieldNode.text) ?? builtinMethodSymbolForType(baseType, fieldNode.text)
                : undefined;
            return symbol?.returnTypeText ?? symbol?.typeText;
        }
        case 'call_expr': {
            const calleeNode = node.namedChildren[0];
            if (!calleeNode)
                return undefined;
            if (calleeNode.type === 'identifier') {
                const occurrence = index.occurrences.find((candidate) => candidate.symbolKey && sameRange(candidate.range, nodeRange(calleeNode)));
                const symbol = occurrence?.symbolKey ? index.symbolByKey.get(occurrence.symbolKey) : undefined;
                return symbol?.returnTypeText ?? symbol?.typeText;
            }
            if (calleeNode.type === 'field_expr') {
                const [baseNode, memberNode] = calleeNode.namedChildren;
                const baseType = inferCompletionExpressionType(baseNode, index);
                const symbol = baseType && memberNode
                    ? memberSymbolForType(index, baseType, memberNode.text) ?? builtinMethodSymbolForType(baseType, memberNode.text)
                    : undefined;
                return symbol?.returnTypeText ?? symbol?.typeText;
            }
            return undefined;
        }
        case 'struct_init':
            return node.namedChildren[0]?.text;
        default:
            return undefined;
    }
}

export function stripNullableTypeText(typeText) {
    let value = typeText?.trim();
    if (!value)
        return value;
    while (value.startsWith('(') && value.endsWith(')'))
        value = value.slice(1, -1).trim();
    if (value.startsWith('?'))
        value = value.slice(1).trim();
    return value;
}

export function builtinKeyFromNamespaceCall(node) {
    const methodNode = findNamedChild(node, 'identifier');
    const namespace = node.children[0]?.text ?? 'builtin';
    return `${namespace}.${methodNode?.text ?? 'unknown'}`;
}

export function inferLiteralType(node) {
    return node.text === 'true' || node.text === 'false'
        ? 'bool'
        : node.text === 'null'
            ? 'null'
            : LITERAL_TYPE_BY_NODE_TYPE[node.namedChildren[0]?.type];
}
