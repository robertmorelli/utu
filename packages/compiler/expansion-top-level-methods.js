import { childOfType, childrenOfType, hasAnon, kids } from './expansion-shared.js';

export function collectTopLevelDefinitionNames() {
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
}

export function collectTopLevelDefinitions(ctx) {
    this.collectTopLevelDefinitionNames();
    const items = this.flattenLibraryItems(kids(this.root));
    for (const item of items) {
        if (item.type === 'struct_decl') this.collectTopLevelStructFields(item, ctx);
        if (item.type === 'type_decl') this.collectTopLevelTypeFields(item, ctx);
        if (item.type === 'proto_decl') this.collectTopLevelProtocol(item, ctx);
    }
}

export function collectTopLevelValueFacts(ctx) {
    const items = this.flattenLibraryItems(kids(this.root));
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

export function collectTopLevelSymbols(ctx) {
    this.collectTopLevelDefinitions(ctx);
    this.collectTopLevelValueFacts(ctx);
}

export function collectModuleTemplate(node) {
    this.registerModuleTemplate(this.buildModuleTemplate(node));
}

export function collectTopLevelStructFields(node, ctx) {
    const nameNode = childOfType(node, 'type_ident');
    if (!nameNode) return;
    const protocolNames = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident').map((child) => child.text);
    if (hasAnon(node, 'tag') && protocolNames.length > 0) {
        this.topLevelTaggedTypeProtocols.set(nameNode.text, new Set(protocolNames));
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
    this.topLevelStructFieldTypes.set(nameNode.text, fields);
}

export function collectTopLevelTypeFields(node, ctx) {
    const nameNode = childOfType(node, 'type_ident');
    if (!nameNode) return;
    const protocolNames = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident').map((child) => child.text);
    if (hasAnon(node, 'tag') && protocolNames.length > 0) {
        this.topLevelTaggedTypeProtocols.set(nameNode.text, new Set(protocolNames));
    }
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

export function collectTopLevelProtocol(node, ctx) {
    const nameNode = childOfType(node, 'type_ident');
    if (!nameNode) return;
    this.topLevelProtocolNames.add(nameNode.text);
    this.collectProtocolMembers(nameNode.text, node, ctx);
}

export function collectProtocolMembers(protocolName, node, ctx) {
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

export function collectTopLevelProtocolImpl(protocol, member, node, ctx, returnInfo) {
    const selfType = this.protocolSelfType(node, ctx);
    if (!selfType) return;
    const key = this.protocolImplKey(protocol, member, selfType);
    if (this.topLevelProtocolImplsByKey.has(key)) return;
    const entry = { protocol, member, selfType, returnInfo };
    this.topLevelProtocolImplsByKey.set(key, entry);
    if (!this.topLevelProtocolImplementers.has(protocol)) this.topLevelProtocolImplementers.set(protocol, new Set());
    this.topLevelProtocolImplementers.get(protocol).add(selfType);
    const typeMemberKey = this.protocolTypeMemberKey(selfType, member);
    const entries = this.topLevelProtocolImplsByTypeMember.get(typeMemberKey) ?? [];
    entries.push(entry);
    this.topLevelProtocolImplsByTypeMember.set(typeMemberKey, entries);
}
