import { findNamedChild, findNamedChildren, stringLiteralName } from "../../../document/index.js";

export function createCollectionFns(ctx) {
    const {
        createSymbol,
        rememberSymbolKey,
        registerField,
        registerProtocolAssocForSelfType,
        registerProtocolSetterAssocForSelfType,
        resolveNamespaceNode,
        protocolTypeNames,
        taggedTypeProtocols,
        topLevelAssocKeys,
        topLevelSetterAssocKeys,
        topLevelTypeKeys,
        topLevelValueKeys,
        moduleNamespaces,
        constructAliases,
        openValueKeys,
        openTypeKeys,
        openTypeNamespaces,
    } = ctx;

    function collectTopLevelDeclarations(item) {
        if (item.type !== 'export_decl')
            return void ctx.topLevelHandlers[item.type]?.collect(item);
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
            const fieldSymbol = createSymbol(fieldNameNode, 'field', {
                detail: `field of ${ownerSymbol.name}`,
                signature: `${fieldNameNode.text}: ${fieldTypeNode.text}`,
                typeText: fieldTypeNode.text,
                containerName: ownerSymbol.name,
            });
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
            const variantSymbol = createSymbol(variantNameNode, 'variant', {
                detail: `variant of ${typeSymbol.name}`,
                signature: `variant ${variantNameNode.text} of ${typeSymbol.name}`,
                containerName: typeSymbol.name,
                topLevel: true,
            });
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

    function collectModuleDeclaration(moduleDecl) {
        const moduleNameNode = ctx.findModuleNameNode(moduleDecl);
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
            const variantSymbol = createSymbol(variantNameNode, 'variant', {
                detail: `variant of ${typeSymbol.name}`,
                signature: `variant ${variantNameNode.text} of ${typeSymbol.name}`,
                containerName: namespace.name,
            });
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
        const globalSymbol = createSymbol(nameNode, 'global', {
            detail: 'global binding',
            signature: `let ${nameNode.text}: ${typeNode.text}`,
            typeText: typeNode.text,
            topLevel: true,
        });
        rememberSymbolKey(topLevelValueKeys, globalSymbol);
    }

    function collectModuleGlobal(globalDecl, namespace) {
        const nameNode = findNamedChild(globalDecl, 'identifier');
        const typeNode = globalDecl.namedChildren[1];
        if (!nameNode || !typeNode)
            return;
        const globalSymbol = createSymbol(nameNode, 'global', {
            detail: `global binding in ${namespace.name}`,
            signature: `let ${nameNode.text}: ${typeNode.text}`,
            typeText: typeNode.text,
            containerName: namespace.name,
        });
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
            const importSymbol = createSymbol(nameNode, 'importFunction', {
                detail: 'host import',
                signature: `shimport ${moduleText} ${nameNode.text}(${paramList?.text ?? ''}) ${returnTypeNode.text}`,
                returnTypeText: returnTypeNode.text,
                topLevel: true,
            });
            rememberSymbolKey(topLevelValueKeys, importSymbol);
            return;
        }
        const typeNode = importDecl.namedChildren.at(-1);
        if (!typeNode || typeNode.type === 'identifier')
            return;
        const importSymbol = createSymbol(nameNode, 'importValue', {
            detail: 'host import value',
            signature: `shimport ${moduleText} ${nameNode.text}: ${typeNode.text}`,
            typeText: typeNode.text,
            topLevel: true,
        });
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
        const importSymbol = createSymbol(nameNode, 'importFunction', {
            detail: 'inline js import',
            signature: `escape ${sourceNode.text} ${nameNode.text}(${paramList?.text ?? ''}) ${returnTypeNode.text}`,
            returnTypeText: returnTypeNode.text,
            topLevel: true,
        });
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

    return {
        collectTopLevelDeclarations,
        collectFieldSymbols,
        collectStructDeclaration,
        collectTypeDeclaration,
        collectProtoDeclaration,
        registerTaggedTypeProtocolAssocKeys,
        collectModuleDeclaration,
        collectModuleStruct,
        collectModuleType,
        collectFunctionDeclaration,
        collectGlobalDeclaration,
        collectModuleGlobal,
        collectImportDeclaration,
        collectJsgenDeclaration,
        collectModuleImport,
        collectModuleJsgen,
        collectConstructDeclaration,
        collectTestDeclaration,
        collectBenchDeclaration,
    };
}
