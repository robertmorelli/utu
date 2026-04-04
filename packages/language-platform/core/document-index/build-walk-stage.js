import { BUILTIN_METHODS, getBuiltinHover, isBuiltinNamespace } from "../hoverDocs.js";
import { findNamedChild, findNamedChildren, spanFromNode, spanFromOffsets, walkNamedChildren } from "../../../document/index.js";
import { RECURSIVE_EXPRESSION_TYPES } from "../../../language-spec/index.js";
import { stripNullableTypeText } from "../completion-helpers.js";
import { rangeForBuiltinNode, withScope } from "./build-utils.js";

export function createDocumentIndexWalkFns({
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
}) {
    let topLevelHandlers = {};
    let walkExpressionHandlers = {};

    const setTopLevelHandlers = (handlers) => {
        topLevelHandlers = handlers ?? {};
    };
    const setWalkExpressionHandlers = (handlers) => {
        walkExpressionHandlers = handlers ?? {};
    };
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
    function walkIdentifierExpression(node) {
        const symbolKey = resolveValueKey(node.text);
        if (!symbolKey)
            addSemanticDiagnostic(node, `Undefined value "${node.text}".`);
        addResolvedOccurrence(node, 'value', symbolKey);
    }
    function addNamespaceOccurrence(node, namespace) {
        const targetNode = findModuleNameNode(node) ?? node;
        if (targetNode)
            addResolvedOccurrence(targetNode, 'value', namespace?.symbolKey);
    }
    function walkFileImportDeclaration(node) {
        const sourceNode = findModuleNameNode(findNamedChild(node, 'imported_module_name'));
        const captureNode = findModuleNameNode(findNamedChild(node, 'captured_module_name'));
        const binding = importedBindingsByLocalName.get(captureNode?.text ?? sourceNode?.text ?? '');
        if (sourceNode)
            addResolvedOccurrence(sourceNode, 'value', binding?.namespace?.symbolKey);
        if (captureNode)
            addResolvedOccurrence(captureNode, 'value', binding?.namespace?.symbolKey);
    }
    function walkModuleReference(node) {
        if (!node)
            return;
        const namespaceNode = findModuleNameNode(node);
        const namespace = resolveNamespaceNode(node);
        if (namespaceNode && !namespace)
            addSemanticDiagnostic(namespaceNode, `Unknown module or construct alias "${namespaceNode.text}".`);
        if (namespaceNode)
            addResolvedOccurrence(namespaceNode, 'value', namespace?.symbolKey);
        const moduleNameNode = findNamedChild(node, 'module_name');
        for (const child of node.namedChildren ?? []) {
            if (child === moduleNameNode || child === namespaceNode)
                continue;
            walkTypeAnnotation(child);
        }
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
        if (namespaceNode)
            addResolvedOccurrence(namespaceNode, 'value', namespace?.symbolKey);
        if (typeNode)
            addResolvedOccurrence(typeNode, 'type', key);
        else if (namespaceNode)
            addResolvedOccurrence(namespaceNode, 'type', key);
    }
    function walkTopLevelItem(item) {
        if (item.type === 'library_decl') {
            for (const child of item.namedChildren ?? []) {
                if (child.type !== 'comment')
                    walkTopLevelItem(child);
            }
            return;
        }
        return void topLevelHandlers[item.type]?.walk(item);
    }
    function walkModuleDeclaration(moduleDecl) {
        const namespace = resolveNamespaceNode(findModuleNameNode(moduleDecl));
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
    function walkConstructDeclaration(constructDecl) {
        const namedChildren = constructDecl.namedChildren ?? [];
        const aliasNode = namedChildren[0]?.type === 'identifier' && namedChildren.length > 1 ? namedChildren[0] : undefined;
        const moduleNode = aliasNode ? namedChildren[1] : namedChildren[0];
        const namespace = resolveNamespaceNode(moduleNode);
        if (aliasNode)
            addResolvedOccurrence(aliasNode, 'value', namespace?.symbolKey);
        walkModuleReference(moduleNode);
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
    function walkJsgen(jsgenDecl) {
        const returnTypeNode = findNamedChild(jsgenDecl, 'return_type');
        if (returnTypeNode) {
            for (const paramNode of findNamedChildren(findNamedChild(jsgenDecl, 'import_param_list'), 'param')) {
                const typeNode = paramNode.namedChildren.at(-1);
                if (typeNode) walkTypeAnnotation(typeNode);
            }
            walkTypeAnnotation(returnTypeNode);
            return;
        }
        const typeNode = jsgenDecl.namedChildren.at(-1);
        if (typeNode && typeNode.type !== 'identifier')
            walkTypeAnnotation(typeNode);
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
        const walkNode = walkExpressionHandlers[node.type];
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
            addNamespaceOccurrence(baseNode, moduleNamespace);
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
                    addNamespaceOccurrence(baseNode, moduleNamespace);
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
                addNamespaceOccurrence(baseNode, moduleNamespace);
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
                if (methodKey.includes('.')) {
                    const builtinHover = getBuiltinHover(methodKey);
                    if (builtinHover) {
                        addBuiltinOccurrence(spanFromNode(document, memberNode), methodKey, memberNode.text);
                    } else {
                        addResolvedOccurrence(memberNode, 'value', methodKey);
                    }
                } else {
                    addResolvedOccurrence(memberNode, 'value', methodKey);
                }
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
        addNamespaceOccurrence(node, namespace);
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
                addNamespaceOccurrence(first, namespace);
                const symbolKey = resolveNamespaceValueOrPromotedAssocKey(namespace, second.text);
                if (!symbolKey)
                    addSemanticDiagnostic(second, `Unknown member "${second.text}" in namespace "${namespace.name}".`);
                addResolvedOccurrence(second, 'value', symbolKey);
            }
            else if (namespace && second?.type === 'type_ident' && pathParts[2]?.type === 'identifier') {
                addNamespaceOccurrence(first, namespace);
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
    function walkExpressions(nodes, visit = walkExpression) {
        for (const node of nodes) {
            if (node)
                visit(node);
        }
    }

    return {
        setTopLevelHandlers,
        setWalkExpressionHandlers,
        walkTopLevelItem,
        walkFileImportDeclaration,
        walkModuleDeclaration,
        walkConstructDeclaration,
        walkStruct,
        walkTypeDeclaration,
        walkFunction,
        walkGlobal,
        walkJsgen,
        walkTest,
        walkBench,
        walkIdentifierExpression,
        walkQualifiedTypeReference,
        walkTypeMemberExpression,
        walkPromotedModuleCallExpression,
        walkStructInit,
        walkFieldExpression,
        walkAssignExpression,
        walkCallExpression,
        walkNamespaceCallExpression,
        walkArrayInit,
        walkRefNullExpression,
        walkPipeExpression,
        walkPromoteExpression,
        walkBindExpression,
        walkBlockExpression,
        walkBlock,
        walkMatchExpression,
        walkAltExpression,
        walkForExpression,
        walkWhileExpression,
        walkExpression,
    };
}
