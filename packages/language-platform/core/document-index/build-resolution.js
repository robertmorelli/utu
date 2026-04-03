import { findNamedChild } from "../../../document/index.js";
import { getBuiltinReturnType, isBuiltinNamespace } from "../hoverDocs.js";
import {
    builtinKeyFromNamespaceCall,
    builtinMethodKeyForType,
    builtinMethodSymbolForType,
    inferLiteralType,
    memberLabel,
    normalizeTypeText,
    normalizedArrayElemType,
    stripNullableTypeText,
} from "../completion-helpers.js";

export function createDocumentIndexResolutionFns({
    builtinMethods,
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
}) {
    function getMemberSymbolsForTypeText(typeText) {
        const normalizedType = normalizeTypeText(typeText);
        if (normalizedType.startsWith('array[')) {
            return (builtinMethods.array ?? [])
                .filter((method) => !method.startsWith('new'))
                .map((method) => builtinMethodSymbolForType(typeText, method))
                .filter(Boolean)
                .sort((left, right) => memberLabel(left).localeCompare(memberLabel(right)));
        }
        const ownerInfo = resolveOwnerInfoFromTypeText(typeText);
        if (!ownerInfo?.owner)
            return [];
        const seen = new Set();
        const results = [];
        const add = (key) => {
            if (!key || seen.has(key))
                return;
            const symbol = lookupSymbol(key);
            if (!symbol)
                return;
            seen.add(key);
            results.push(symbol);
        };
        for (const candidateType of expandTypeCandidates(typeText)) {
            for (const fieldKey of fieldsByOwner.get(candidateType)?.values() ?? [])
                add(fieldKey);
        }
        const addAssocEntries = (entries) => {
            for (const [qualifiedName, key] of entries) {
                if (!qualifiedName.startsWith(`${ownerInfo.owner}.`))
                    continue;
                add(key);
            }
        };
        if (ownerInfo.namespace)
            addAssocEntries(ownerInfo.namespace.assocKeys.entries());
        addAssocEntries(topLevelAssocKeys.entries());
        addAssocEntries(protocolAssocKeysBySelf.entries());
        return results.sort((left, right) => memberLabel(left).localeCompare(memberLabel(right)));
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
        return memberNode && baseType
            ? resolveAssociatedKeyFromTypeText(baseType, memberNode.text) ?? builtinMethodKeyForType(baseType, memberNode.text)
            : undefined;
    }

    function resolveSetterKey(node) {
        const [baseNode, memberNode] = node.namedChildren;
        const baseType = inferExpressionType(baseNode);
        return memberNode && baseType ? resolveSetterKeyFromTypeText(baseType, memberNode.text) : undefined;
    }

    function inferTypeNodeText(node) {
        return node?.type === 'instantiated_module_ref' ? findModuleNameNode(node)?.text : node?.text;
    }

    function declareLocal(symbol) {
        localScopes.at(-1)?.set(symbol.name, symbol.key);
    }

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
            ?? moduleScopes.at(-1)?.typeParamKeys?.get(name)
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

    function inferFirstChildType(node) {
        return node.namedChildren[0] ? inferExpressionType(node.namedChildren[0]) : undefined;
    }

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
            if (methodSymbol?.returnTypeText || methodSymbol?.typeText)
                return methodSymbol.returnTypeText ?? methodSymbol.typeText;
            const [baseNode, memberNode] = calleeNode.namedChildren;
            const baseType = inferExpressionType(baseNode);
            const builtinKey = baseType && memberNode ? builtinMethodKeyForType(baseType, memberNode.text) : undefined;
            return builtinKey
                ? getBuiltinReturnType(builtinKey, normalizedArrayElemType(baseType))
                : inferFieldExpressionType(calleeNode);
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

    function inferStructInitType(node) {
        return inferTypeNodeText(node.namedChildren[0]);
    }

    function inferArrayInitType(node) {
        return node.namedChildren[0] ? `array[${node.namedChildren[0].text}]` : 'array[T]';
    }

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
        return expressionTypeInferers[node.type]?.(node);
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
        if (first.type === 'identifier' && second?.type === 'identifier' && isBuiltinNamespace(first.text))
            return getBuiltinReturnType(`${first.text}.${second.text}`);
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

    const expressionTypeInferers = {
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

    return {
        declareLocal,
        findModuleNameNode,
        formatTypeName,
        getMemberSymbolsForTypeText,
        getTypeResolution,
        inferArrayInitType,
        inferBlockType,
        inferCallExpressionType,
        inferElseExpressionType,
        inferExpressionType,
        inferFieldExpressionType,
        inferFirstChildType,
        inferIdentifierType,
        inferIndexExpressionType,
        inferPipeExpressionType,
        inferPipeTargetType,
        inferPromoteExpressionType,
        inferPromotedModuleCallType,
        inferRefNullType,
        inferStructInitType,
        inferTypeMemberExpressionType,
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
    };
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
