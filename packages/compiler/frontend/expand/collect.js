import {
    ModuleExpander,
    childOfType,
    childrenOfType,
    hasAnon,
    hashText,
    kids,
    moduleNameNode,
    pascalCase,
    snakeCase,
} from "./shared.js";

const CollectMixin = class {
    collectTopLevelSymbols(ctx) {
        const items = this.flattenLibraryItems(kids(this.root));
        for (const item of items) {
            if (item.type === 'module_decl') this.collectModuleTemplate(item);
            if (item.type === 'struct_decl') {
                const nameNode = childOfType(item, 'type_ident');
                if (nameNode) this.topLevelTypeNames.add(nameNode.text);
            }
            if (item.type === 'type_decl') {
                const nameNode = childOfType(item, 'type_ident');
                if (nameNode) this.topLevelTypeNames.add(nameNode.text);
                for (const variant of childrenOfType(childOfType(item, 'variant_list'), 'variant')) {
                    const variantName = childOfType(variant, 'type_ident');
                    if (variantName) this.topLevelTypeNames.add(variantName.text);
                }
            }
            if (item.type === 'proto_decl') {
                const nameNode = childOfType(item, 'type_ident');
                if (nameNode) this.topLevelProtocolNames.add(nameNode.text);
            }
        }
        for (const item of items) {
            if (item.type === 'struct_decl') this.collectTopLevelStructFields(item, ctx);
            if (item.type === 'type_decl') this.collectTopLevelTypeFields(item, ctx);
            if (item.type === 'proto_decl') this.collectTopLevelProtocol(item, ctx);
        }
        this.collectSymbols(items, ctx, {
            onConstruct: (item) => this.applyConstruct(item, ctx),
            onType: (name) => this.topLevelTypeNames.add(name),
            onValue: (name, type) => {
                this.topLevelValueNames.add(name);
                this.topLevelValueTypes.set(name, type);
            },
            onFunction: (name, returnInfo) => {
                this.topLevelValueNames.add(name);
                this.topLevelFnReturns.set(name, returnInfo);
            },
            onAssoc: (owner, member, returnInfo) => {
                const key = `${owner}.${member}`;
                this.topLevelAssocNames.set(key, this.mangleTopLevelAssoc(owner, member));
                this.topLevelAssocReturns.set(key, returnInfo);
            },
            onProtocolImpl: (protocol, member, node, returnInfo) => this.collectTopLevelProtocolImpl(protocol, member, node, ctx, returnInfo),
        });
    }

    collectModuleTemplate(node) {
        this.registerModuleTemplate(this.buildModuleTemplate(node));
    }

    collectTopLevelStructFields(node, ctx) {
        const nameNode = childOfType(node, 'type_ident');
        if (!nameNode) return;
        const protocolNames = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident').map((child) => child.text);
        if (hasAnon(node, 'tag') && protocolNames.length > 0)
            this.topLevelTaggedTypeProtocols.set(nameNode.text, new Set(protocolNames));
        const fields = new Map();
        for (const field of childrenOfType(childOfType(node, 'field_list'), 'field')) {
            const fieldName = childOfType(field, 'identifier');
            const typeNode = kids(field).at(-1);
            if (!fieldName || !typeNode) continue;
            fields.set(fieldName.text, {
                typeInfo: this.describeType(typeNode, ctx),
                mut: hasAnon(field, 'mut'),
            });
        }
        this.topLevelStructFieldTypes.set(nameNode.text, fields);
    }

    collectTopLevelTypeFields(node, ctx) {
        const nameNode = childOfType(node, 'type_ident');
        if (!nameNode) return;
        const protocolNames = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident').map((child) => child.text);
        if (hasAnon(node, 'tag') && protocolNames.length > 0)
            this.topLevelTaggedTypeProtocols.set(nameNode.text, new Set(protocolNames));
        for (const variant of childrenOfType(childOfType(node, 'variant_list'), 'variant')) {
            const variantName = childOfType(variant, 'type_ident');
            if (!variantName) continue;
            const fields = new Map();
            for (const field of childrenOfType(childOfType(variant, 'field_list'), 'field')) {
                const fieldName = childOfType(field, 'identifier');
                const typeNode = kids(field).at(-1);
                if (!fieldName || !typeNode) continue;
                fields.set(fieldName.text, {
                    typeInfo: this.describeType(typeNode, ctx),
                    mut: hasAnon(field, 'mut'),
                });
            }
            this.topLevelStructFieldTypes.set(variantName.text, fields);
        }
    }

    collectTopLevelProtocol(node, ctx) {
        const nameNode = childOfType(node, 'type_ident');
        if (!nameNode) return;
        this.topLevelProtocolNames.add(nameNode.text);
        this.collectProtocolMembers(nameNode.text, node, ctx);
    }

    collectNamespaceTypeNames(namespace) {
        for (const item of namespace.template.items) {
            if (item.type === 'struct_decl' || item.type === 'type_decl' || item.type === 'proto_decl') {
                const nameNode = childOfType(item, 'type_ident');
                if (nameNode) {
                    this.registerNamespaceType(namespace, nameNode.text);
                    if (item.type === 'proto_decl') {
                        if (!namespace.protocolNames)
                            namespace.protocolNames = new Set();
                        namespace.protocolNames.add(nameNode.text);
                    }
                }
            }
            if (item.type === 'type_decl') {
                for (const variant of childrenOfType(childOfType(item, 'variant_list'), 'variant')) {
                    const variantName = childOfType(variant, 'type_ident');
                    if (variantName)
                        this.registerNamespaceType(namespace, variantName.text);
                }
            }
        }
    }

    collectNamespaceDeclarations(namespace, ctx) {
        for (const item of namespace.template.items) {
            if (item.type === 'struct_decl') this.collectNamespaceStructFields(item, namespace, ctx);
            if (item.type === 'type_decl') this.collectNamespaceTypeFields(item, namespace, ctx);
            if (item.type === 'proto_decl') this.collectNamespaceProtocol(item, namespace, ctx);
        }
    }

    collectNamespaceStructFields(node, namespace, ctx) {
        const rawName = childOfType(node, 'type_ident')?.text;
        const typeName = rawName ? namespace.typeNames.get(rawName) : null;
        if (!typeName) return;
        const protocolNames = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident')
            .map((child) => namespace.typeNames.get(child.text) ?? child.text);
        if (hasAnon(node, 'tag') && protocolNames.length > 0)
            this.topLevelTaggedTypeProtocols.set(typeName, new Set(protocolNames));
        const fields = new Map();
        for (const field of childrenOfType(childOfType(node, 'field_list'), 'field')) {
            const fieldName = childOfType(field, 'identifier');
            const typeNode = kids(field).at(-1);
            if (!fieldName || !typeNode) continue;
            fields.set(fieldName.text, {
                typeInfo: this.describeType(typeNode, ctx),
                mut: hasAnon(field, 'mut'),
            });
        }
        this.topLevelStructFieldTypes.set(typeName, fields);
    }

    collectNamespaceTypeFields(node, namespace, ctx) {
        const rawName = childOfType(node, 'type_ident')?.text;
        const typeName = rawName ? namespace.typeNames.get(rawName) : null;
        if (!typeName) return;
        const protocolNames = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident')
            .map((child) => namespace.typeNames.get(child.text) ?? child.text);
        if (hasAnon(node, 'tag') && protocolNames.length > 0)
            this.topLevelTaggedTypeProtocols.set(typeName, new Set(protocolNames));
        for (const variant of childrenOfType(childOfType(node, 'variant_list'), 'variant')) {
            const variantNameNode = childOfType(variant, 'type_ident');
            const variantName = variantNameNode ? namespace.typeNames.get(variantNameNode.text) : null;
            if (!variantName) continue;
            const fields = new Map();
            for (const field of childrenOfType(childOfType(variant, 'field_list'), 'field')) {
                const fieldName = childOfType(field, 'identifier');
                const typeNode = kids(field).at(-1);
                if (!fieldName || !typeNode) continue;
                fields.set(fieldName.text, {
                    typeInfo: this.describeType(typeNode, ctx),
                    mut: hasAnon(field, 'mut'),
                });
            }
            this.topLevelStructFieldTypes.set(variantName, fields);
        }
    }

    collectNamespaceProtocol(node, namespace, ctx) {
        const rawName = childOfType(node, 'type_ident')?.text;
        const protocolName = rawName ? namespace.typeNames.get(rawName) : null;
        if (!protocolName) return;
        this.topLevelProtocolNames.add(protocolName);
        this.collectProtocolMembers(protocolName, node, ctx);
    }

    collectProtocolMembers(protocolName, node, ctx) {
        const memberList = childOfType(node, 'proto_member_list');
        const members = memberList
            ? childrenOfType(memberList, 'proto_member')
                .map((member) => kids(member)[0])
                .filter((child) => ['proto_method', 'proto_getter', 'proto_setter'].includes(child?.type))
            : [];
        for (const member of members) {
            const memberName = childOfType(member, 'identifier');
            if (!memberName) continue;
            if (member.type === 'proto_setter') {
                this.topLevelProtocolSetterMembers.set(this.protocolMemberKey(protocolName, memberName.text), {
                    setter: true,
                    arity: 2,
                    valueInfo: this.describeType(kids(member).at(-1), ctx),
                });
                continue;
            }
            this.topLevelProtocolMembers.set(this.protocolMemberKey(protocolName, memberName.text), {
                getter: member.type === 'proto_getter',
                arity: member.type === 'proto_getter'
                    ? 1
                    : kids(childOfType(member, 'type_list')).length,
                returnInfo: member.type === 'proto_getter'
                    ? this.describeType(kids(member).at(-1), ctx)
                    : this.describeReturn(childOfType(member, 'return_type'), ctx),
            });
        }
    }

    applyConstruct(node, ctx) {
        const named = kids(node);
        const aliasNode = named[0]?.type === 'identifier' && ['module_ref', 'instantiated_module_ref'].includes(named[1]?.type) ? named[0] : null;
        const moduleRef = childOfType(node, 'module_ref') ?? childOfType(node, 'instantiated_module_ref');
        const namespace = this.resolveNamespaceFromModuleRef(moduleRef, ctx);

        if (aliasNode) {
            ctx.aliases.set(aliasNode.text, namespace);
            return;
        }

        this.openNamespace(namespace, ctx);
    }

    openNamespace(namespace, ctx) {
        for (const name of namespace.exportedValues) {
            if (this.topLevelValueNames.has(name) || ctx.openValues.has(name))
                throw new Error(`open construct ${namespace.displayText} would collide on value "${name}"`);
            ctx.openValues.set(name, namespace);
        }

        for (const name of namespace.exportedTypes) {
            if (this.topLevelTypeNames.has(name) || ctx.openTypes.has(name))
                throw new Error(`open construct ${namespace.displayText} would collide on type "${name}"`);
            ctx.openTypes.set(name, namespace);
        }
    }

    resolveNamespaceFromModuleRef(node, ctx) {
        const { name, argNodes } = this.getModuleRef(node);
        return this.resolveNamespaceByNameAndArgs(name, argNodes, ctx);
    }

    resolveNamespaceByNameAndArgs(name, argNodes, ctx) {
        if (argNodes.length === 0 && ctx.aliases.has(name)) return ctx.aliases.get(name);

        const template = ctx.moduleBindings.get(name) ?? this.moduleTemplates.get(name);
        const argTexts = argNodes.map((typeNode) => this.emitType(typeNode, ctx));
        return this.ensureNamespace(template, argTexts, ctx);
    }

    resolveMaybeNamespaceName(name, ctx) {
        if (ctx.aliases.has(name)) return ctx.aliases.get(name);
        const template = ctx.moduleBindings.get(name) ?? this.moduleTemplates.get(name);
        return template && template.typeParams.length === 0 ? this.ensureNamespace(template, [], ctx) : null;
    }

    ensureNamespace(template, argTexts, ctx) {
        if (!template) throw new Error('Unknown module reference');
        if (argTexts.length !== template.typeParams.length)
            throw new Error(`module ${template.name} expects ${template.typeParams.length} type argument(s), received ${argTexts.length}`);
        const displayText = template.typeParams.length
            ? `${template.name}[${argTexts.join(', ')}]`
            : template.name;
        const key = displayText;
        if (this.namespaceCache.has(key)) return this.namespaceCache.get(key);

        const hash = hashText(key);
        const namespace = {
            key,
            hash,
            displayText,
            template,
            typeParams: new Map(template.typeParams.map((name, index) => [name, argTexts[index]])),
            typeNames: new Map(),
            freeValueNames: new Map(),
            assocNames: new Map(),
            freeValueTypes: new Map(),
            freeFnReturns: new Map(),
            assocReturns: new Map(),
            exportedTypes: [],
            exportedValues: [],
            promotedTypeName: null,
            promotedType: null,
            source: '',
        };

        this.namespaceCache.set(key, namespace);
        this.namespaceOrder.push(namespace);

        const moduleCtx = this.cloneContext(ctx, {
            namespace,
            typeParams: new Map([...ctx.typeParams, ...namespace.typeParams]),
            moduleBindings: template.moduleBindings ?? ctx.moduleBindings,
            localValueScopes: [],
        });
        this.collectNamespaceTypeNames(namespace);
        this.collectNamespaceDeclarations(namespace, moduleCtx);
        this.collectNamespaceNames(namespace, moduleCtx);
        namespace.source = namespace.template.items
            .map((item) => this.emitItem(item, moduleCtx, true))
            .filter(Boolean)
            .join('\n\n');

        return namespace;
    }

    collectNamespaceNames(namespace, ctx) {
        this.collectSymbols(namespace.template.items, ctx, {
            onType: (name) => this.registerNamespaceType(namespace, name),
            onValue: (name, type) => {
                this.registerNamespaceValue(namespace, name);
                namespace.freeValueTypes.set(name, type);
            },
            onFunction: (name, returnInfo) => {
                this.registerNamespaceValue(namespace, name);
                namespace.freeFnReturns.set(name, returnInfo);
            },
            onAssoc: (owner, member, returnInfo) => {
                const key = `${owner}.${member}`;
                namespace.assocNames.set(key, this.mangleNamespaceAssoc(namespace, owner, member));
                namespace.assocReturns.set(key, returnInfo);
            },
            onProtocolImpl: (protocol, member, node, returnInfo) => this.collectTopLevelProtocolImpl(protocol, member, node, ctx, returnInfo),
        });
    }

    collectSymbols(items, ctx, handlers) {
        for (const item of items) {
            switch (item.type) {
                case 'library_decl':
                    this.collectSymbols(kids(item), ctx, handlers);
                    break;
                case 'module_decl':
                case 'file_import_decl':
                    break;
                case 'construct_decl':
                    handlers.onConstruct?.(item);
                    break;
                case 'struct_decl':
                    handlers.onType(childOfType(item, 'type_ident').text);
                    break;
                case 'proto_decl':
                    handlers.onType?.(childOfType(item, 'type_ident').text);
                    break;
                case 'type_decl':
                    handlers.onType(childOfType(item, 'type_ident').text);
                    for (const variant of childrenOfType(childOfType(item, 'variant_list'), 'variant')) {
                        handlers.onType(childOfType(variant, 'type_ident').text);
                    }
                    break;
                case 'fn_decl':
                    this.collectFunctionSymbol(item, ctx, handlers);
                    break;
                case 'global_decl':
                    this.collectValueSymbol(item, kids(item).at(-1), ctx, handlers.onValue);
                    break;
                case 'jsgen_decl': {
                    const returnTypeNode = childOfType(item, 'return_type');
                    this.collectValueSymbol(item, returnTypeNode ?? kids(item).at(-1), ctx, returnTypeNode ? handlers.onFunction : handlers.onValue, returnTypeNode);
                    break;
                }
            }
        }
    }

    collectFunctionSymbol(node, ctx, handlers) {
        const assocNode = childOfType(node, 'associated_fn_name');
        const returnInfo = this.describeReturn(childOfType(node, 'return_type'), ctx);
        if (assocNode) {
            const [ownerNode, nameNode] = kids(assocNode);
            const protocolOwner = this.resolveProtocolOwnerName(ownerNode.text, ctx);
            if (protocolOwner) {
                handlers.onProtocolImpl?.(protocolOwner, nameNode.text, node, returnInfo);
                return;
            }
            handlers.onAssoc(ownerNode.text, nameNode.text, returnInfo);
            return;
        }
        const nameNode = childOfType(node, 'identifier');
        if (nameNode) handlers.onFunction(nameNode.text, returnInfo);
    }

    collectTopLevelProtocolImpl(protocol, member, node, ctx, returnInfo) {
        const selfType = this.protocolSelfType(node, ctx);
        if (!selfType) return;
        const entry = { protocol, member, selfType, returnInfo };
        this.topLevelProtocolImplsByKey.set(this.protocolImplKey(protocol, member, selfType), entry);
        if (!this.topLevelProtocolImplementers.has(protocol)) this.topLevelProtocolImplementers.set(protocol, new Set());
        this.topLevelProtocolImplementers.get(protocol).add(selfType);
        const typeMemberKey = this.protocolTypeMemberKey(selfType, member);
        const entries = this.topLevelProtocolImplsByTypeMember.get(typeMemberKey) ?? [];
        entries.push(entry);
        this.topLevelProtocolImplsByTypeMember.set(typeMemberKey, entries);
    }

    collectValueSymbol(node, valueTypeNode, ctx, register, returnTypeNode = null) {
        const nameNode = childOfType(node, 'identifier');
        if (!nameNode) return;
        register(nameNode.text, returnTypeNode ? this.describeReturn(returnTypeNode, ctx) : this.describeType(valueTypeNode, ctx));
    }

    registerNamespaceType(namespace, name) {
        if (namespace.typeNames.has(name)) return;
        const value = this.mangleNamespaceType(namespace, name);
        namespace.typeNames.set(name, value);
        if (name === namespace.template.name) {
            namespace.promotedTypeName = name;
            namespace.promotedType = value;
        }
        namespace.exportedTypes.push(name);
    }

    registerNamespaceValue(namespace, name) {
        namespace.freeValueNames.set(name, this.mangleNamespaceValue(namespace, name));
        namespace.exportedValues.push(name);
    }

    mangleTopLevelAssoc(owner, member) {
        return `__utu_assoc_${snakeCase(owner)}_${snakeCase(member)}`;
    }

    mangleProtocolDispatch(protocol, member, selfType) {
        return `__utu_proto_dispatch_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
    }

    mangleProtocolSetterDispatch(protocol, member, selfType) {
        return `__utu_proto_set_dispatch_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
    }

    mangleNamespaceType(namespace, name) {
        return `Utu${namespace.hash}${pascalCase(namespace.template.name)}${pascalCase(name)}`;
    }

    mangleNamespaceValue(namespace, name) {
        return `__utu_${snakeCase(namespace.template.name)}_${namespace.hash}_${snakeCase(name)}`;
    }

    mangleNamespaceAssoc(namespace, owner, member) {
        return `__utu_${snakeCase(namespace.template.name)}_${namespace.hash}_${snakeCase(owner)}_${snakeCase(member)}`;
    }

    resolveProtocolOwnerName(name, ctx) {
        if (this.topLevelProtocolNames.has(name)) return name;
        const mapped = ctx.namespace?.typeNames.get(name);
        return mapped && this.topLevelProtocolNames.has(mapped) ? mapped : null;
    }

    getModuleRef(node) {
        const instNode = node?.type === 'instantiated_module_ref' ? node : childOfType(node, 'instantiated_module_ref');
        const target = instNode ?? node;
        const argsNode = childOfType(target, 'module_type_arg_list');
        return { name: moduleNameNode(target).text, argNodes: argsNode ? kids(argsNode) : [] };
    }

    flattenLibraryItems(items) {
        return items.flatMap((item) => item.type === 'library_decl' ? kids(item) : [item]);
    }
};

for (const name of Object.getOwnPropertyNames(CollectMixin.prototype)) {
    if (name !== 'constructor') ModuleExpander.prototype[name] = CollectMixin.prototype[name];
}
