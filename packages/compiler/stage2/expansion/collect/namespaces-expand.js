import {
    childOfType,
    childrenOfType,
    hasAnon,
    hashText,
    kids,
    pascalCase,
    snakeCase,
} from '../core.js';
import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class CollectNamespacesExpandMixin {
    ensureNamespace(template, argTexts, ctx) {
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
        const registerNamespaceType = (name) => {
            if (namespace.typeNames.has(name)) return;
            const value = `Utu${namespace.hash}${pascalCase(namespace.template.name)}${pascalCase(name)}`;
            namespace.typeNames.set(name, value);
            if (name === namespace.template.name) {
                namespace.promotedTypeName = name;
                namespace.promotedType = value;
            }
            namespace.exportedTypes.push(name);
        };
        const registerNamespaceValue = (name) => {
            namespace.freeValueNames.set(name, `__utu_${snakeCase(namespace.template.name)}_${namespace.hash}_${snakeCase(name)}`);
            namespace.exportedValues.push(name);
        };

        for (const item of namespace.template.items) {
            if (item.type === 'struct_decl' || item.type === 'type_decl' || item.type === 'proto_decl') {
                const nameNode = childOfType(item, 'type_ident');
                if (nameNode) {
                    registerNamespaceType(nameNode.text);
                    if (item.type === 'proto_decl') {
                        if (!namespace.protocolNames) namespace.protocolNames = new Set();
                        namespace.protocolNames.add(nameNode.text);
                    }
                }
            }
            if (item.type === 'type_decl') {
                for (const variant of childrenOfType(childOfType(item, 'variant_list'), 'variant')) {
                    const variantName = childOfType(variant, 'type_ident');
                    if (variantName) registerNamespaceType(variantName.text);
                }
            }
        }

        for (const item of namespace.template.items) {
            if (item.type === 'struct_decl') {
                const rawName = childOfType(item, 'type_ident')?.text;
                const typeName = rawName ? namespace.typeNames.get(rawName) : null;
                if (!typeName) continue;
                const protocolNames = childrenOfType(childOfType(item, 'protocol_list'), 'type_ident')
                    .map((child) => namespace.typeNames.get(child.text) ?? child.text);
                if (hasAnon(item, 'tag') && protocolNames.length > 0) {
                    this.topLevelTaggedTypeProtocols.set(typeName, new Set(protocolNames));
                }
                const fields = new Map();
                for (const field of childrenOfType(childOfType(item, 'field_list'), 'field')) {
                    const fieldName = childOfType(field, 'identifier');
                    const typeNode = kids(field).at(-1);
                    if (!fieldName || !typeNode) continue;
                    fields.set(fieldName.text, {
                        typeInfo: this.describeType(typeNode, moduleCtx),
                        mut: hasAnon(field, 'mut'),
                    });
                }
                this.topLevelStructFieldTypes.set(typeName, fields);
                continue;
            }
            if (item.type === 'type_decl') {
                const rawName = childOfType(item, 'type_ident')?.text;
                const typeName = rawName ? namespace.typeNames.get(rawName) : null;
                if (!typeName) continue;
                const protocolNames = childrenOfType(childOfType(item, 'protocol_list'), 'type_ident')
                    .map((child) => namespace.typeNames.get(child.text) ?? child.text);
                if (hasAnon(item, 'tag') && protocolNames.length > 0) {
                    this.topLevelTaggedTypeProtocols.set(typeName, new Set(protocolNames));
                }
                for (const variant of childrenOfType(childOfType(item, 'variant_list'), 'variant')) {
                    const variantNameNode = childOfType(variant, 'type_ident');
                    const variantName = variantNameNode ? namespace.typeNames.get(variantNameNode.text) : null;
                    if (!variantName) continue;
                    const fields = new Map();
                    for (const field of childrenOfType(childOfType(variant, 'field_list'), 'field')) {
                        const fieldName = childOfType(field, 'identifier');
                        const typeNode = kids(field).at(-1);
                        if (!fieldName || !typeNode) continue;
                        fields.set(fieldName.text, {
                            typeInfo: this.describeType(typeNode, moduleCtx),
                            mut: hasAnon(field, 'mut'),
                        });
                    }
                    this.topLevelStructFieldTypes.set(variantName, fields);
                }
                continue;
            }
            if (item.type === 'proto_decl') {
                const rawName = childOfType(item, 'type_ident')?.text;
                const protocolName = rawName ? namespace.typeNames.get(rawName) : null;
                if (!protocolName) continue;
                this.topLevelProtocolNames.add(protocolName);
                this.collectProtocolMembers(protocolName, item, moduleCtx);
            }
        }

        this.collectSymbols(namespace.template.items, moduleCtx, {
            onType: (name) => registerNamespaceType(name),
            onValue: (name, type) => {
                registerNamespaceValue(name);
                namespace.freeValueTypes.set(name, type);
            },
            onFunction: (name, returnInfo) => {
                registerNamespaceValue(name);
                namespace.freeFnReturns.set(name, returnInfo);
            },
            onAssoc: (owner, member, returnInfo) => {
                const assocKey = `${owner}.${member}`;
                namespace.assocNames.set(
                    assocKey,
                    `__utu_${snakeCase(namespace.template.name)}_${namespace.hash}_${snakeCase(owner)}_${snakeCase(member)}`,
                );
                namespace.assocReturns.set(assocKey, returnInfo);
            },
            onProtocolImpl: (protocol, member, node, returnInfo) => this.collectTopLevelProtocolImpl(protocol, member, node, moduleCtx, returnInfo),
        });
        namespace.source = namespace.template.items
            .map((item) => this.emitItem(item, moduleCtx, true))
            .filter(Boolean)
            .join('\n\n');

        return namespace;
    }
}

installMixin(ModuleExpander, CollectNamespacesExpandMixin);
