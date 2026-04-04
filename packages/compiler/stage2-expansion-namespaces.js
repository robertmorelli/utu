import {
    childOfType,
    childrenOfType,
    hashText,
    hasAnon,
    kids,
    moduleNameNode,
    pascalCase,
    snakeCase,
} from './stage2-expansion-shared.js';

export function collectNamespaceTypeNames(namespace) {
    for (const item of namespace.template.items) {
        if (item.type === 'struct_decl' || item.type === 'type_decl' || item.type === 'proto_decl') {
            const nameNode = childOfType(item, 'type_ident');
            if (nameNode) {
                this.registerNamespaceType(namespace, nameNode.text);
                if (item.type === 'proto_decl') {
                    if (!namespace.protocolNames) namespace.protocolNames = new Set();
                    namespace.protocolNames.add(nameNode.text);
                }
            }
        }
        if (item.type === 'type_decl') {
            for (const variant of childrenOfType(childOfType(item, 'variant_list'), 'variant')) {
                const variantName = childOfType(variant, 'type_ident');
                if (variantName) this.registerNamespaceType(namespace, variantName.text);
            }
        }
    }
}

export function collectNamespaceDeclarations(namespace, ctx) {
    for (const item of namespace.template.items) {
        if (item.type === 'struct_decl') this.collectNamespaceStructFields(item, namespace, ctx);
        if (item.type === 'type_decl') this.collectNamespaceTypeFields(item, namespace, ctx);
        if (item.type === 'proto_decl') this.collectNamespaceProtocol(item, namespace, ctx);
    }
}

export function collectNamespaceStructFields(node, namespace, ctx) {
    const rawName = childOfType(node, 'type_ident')?.text;
    const typeName = rawName ? namespace.typeNames.get(rawName) : null;
    if (!typeName) return;
    const protocolNames = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident')
        .map((child) => namespace.typeNames.get(child.text) ?? child.text);
    if (hasAnon(node, 'tag') && protocolNames.length > 0) {
        this.topLevelTaggedTypeProtocols.set(typeName, new Set(protocolNames));
    }
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

export function collectNamespaceTypeFields(node, namespace, ctx) {
    const rawName = childOfType(node, 'type_ident')?.text;
    const typeName = rawName ? namespace.typeNames.get(rawName) : null;
    if (!typeName) return;
    const protocolNames = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident')
        .map((child) => namespace.typeNames.get(child.text) ?? child.text);
    if (hasAnon(node, 'tag') && protocolNames.length > 0) {
        this.topLevelTaggedTypeProtocols.set(typeName, new Set(protocolNames));
    }
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

export function collectNamespaceProtocol(node, namespace, ctx) {
    const rawName = childOfType(node, 'type_ident')?.text;
    const protocolName = rawName ? namespace.typeNames.get(rawName) : null;
    if (!protocolName) return;
    this.topLevelProtocolNames.add(protocolName);
    this.collectProtocolMembers(protocolName, node, ctx);
}

export function applyConstruct(node, ctx) {
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

export function openNamespace(namespace, ctx) {
    for (const name of namespace.exportedValues) {
        if (this.topLevelValueNames.has(name) || ctx.openValues.has(name)) {
            throw new Error(`open construct ${namespace.displayText} would collide on value "${name}"`);
        }
        ctx.openValues.set(name, namespace);
    }

    for (const name of namespace.exportedTypes) {
        if (this.topLevelTypeNames.has(name) || ctx.openTypes.has(name)) {
            throw new Error(`open construct ${namespace.displayText} would collide on type "${name}"`);
        }
        ctx.openTypes.set(name, namespace);
    }
}

export function resolveNamespaceFromModuleRef(node, ctx) {
    const { name, argNodes } = this.getModuleRef(node);
    return this.resolveNamespaceByNameAndArgs(name, argNodes, ctx);
}

export function resolveNamespaceByNameAndArgs(name, argNodes, ctx) {
    if (argNodes.length === 0 && ctx.aliases.has(name)) return ctx.aliases.get(name);
    const template = ctx.moduleBindings.get(name) ?? this.moduleTemplates.get(name);
    const argTexts = argNodes.map((typeNode) => this.emitType(typeNode, ctx));
    return this.ensureNamespace(template, argTexts, ctx);
}

export function resolveMaybeNamespaceName(name, ctx) {
    if (ctx.aliases.has(name)) return ctx.aliases.get(name);
    const template = ctx.moduleBindings.get(name) ?? this.moduleTemplates.get(name);
    return template && template.typeParams.length === 0 ? this.ensureNamespace(template, [], ctx) : null;
}

export function ensureNamespace(template, argTexts, ctx) {
    if (!template) throw new Error('Unknown module reference');
    if (argTexts.length !== template.typeParams.length) {
        throw new Error(`module ${template.name} expects ${template.typeParams.length} type argument(s), received ${argTexts.length}`);
    }
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

    return namespace;
}

export function collectNamespaceNames(namespace, ctx) {
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

export function registerNamespaceType(namespace, name) {
    if (namespace.typeNames.has(name)) return;
    const value = this.mangleNamespaceType(namespace, name);
    namespace.typeNames.set(name, value);
    if (name === namespace.template.name) {
        namespace.promotedTypeName = name;
        namespace.promotedType = value;
    }
    namespace.exportedTypes.push(name);
}

export function registerNamespaceValue(namespace, name) {
    namespace.freeValueNames.set(name, this.mangleNamespaceValue(namespace, name));
    namespace.exportedValues.push(name);
}

export function mangleTopLevelAssoc(owner, member) {
    return `__utu_assoc_${snakeCase(owner)}_${snakeCase(member)}`;
}

export function mangleProtocolDispatch(protocol, member, selfType) {
    return `__utu_proto_dispatch_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
}

export function mangleProtocolSetterDispatch(protocol, member, selfType) {
    return `__utu_proto_set_dispatch_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
}

export function mangleNamespaceType(namespace, name) {
    return `Utu${namespace.hash}${pascalCase(namespace.template.name)}${pascalCase(name)}`;
}

export function mangleNamespaceValue(namespace, name) {
    return `__utu_${snakeCase(namespace.template.name)}_${namespace.hash}_${snakeCase(name)}`;
}

export function mangleNamespaceAssoc(namespace, owner, member) {
    return `__utu_${snakeCase(namespace.template.name)}_${namespace.hash}_${snakeCase(owner)}_${snakeCase(member)}`;
}

export function resolveProtocolOwnerName(name, ctx) {
    if (this.topLevelProtocolNames.has(name)) return name;
    const mapped = ctx.namespace?.typeNames.get(name);
    return mapped && this.topLevelProtocolNames.has(mapped) ? mapped : null;
}

export function getModuleRef(node) {
    const instNode = node?.type === 'instantiated_module_ref' ? node : childOfType(node, 'instantiated_module_ref');
    const target = instNode ?? node;
    const argsNode = childOfType(target, 'module_type_arg_list');
    return { name: moduleNameNode(target).text, argNodes: argsNode ? kids(argsNode) : [] };
}

export function flattenLibraryItems(items) {
    return items.flatMap((item) => item.type === 'library_decl' ? kids(item) : [item]);
}
