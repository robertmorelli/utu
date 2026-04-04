import {
    childOfType,
    childrenOfType,
    kids,
    sameTypeInfo,
} from '../core.js';
import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class ExpressionsResolutionMixin {
    resolveAssociatedByOwner(ownerName, memberName, ctx) {
        const entry = this.resolveAssociatedEntry(ownerName, memberName, ctx);
        return entry?.callee;
    }

    resolveNamespaceValue(namespace, memberName) {
        return namespace?.freeValueNames.get(memberName)
            ?? (namespace?.promotedTypeName ? namespace.assocNames.get(`${namespace.promotedTypeName}.${memberName}`) : null)
            ?? null;
    }

    resolveNamespaceAssoc(namespace, ownerName, memberName) {
        const key = `${ownerName}.${memberName}`;
        const callee = namespace?.assocNames.get(key);
        return callee ? { callee, returnInfo: namespace.assocReturns.get(key) ?? null } : null;
    }

    resolveAssociatedEntry(ownerName, memberName, ctx) {
        const local = this.resolveNamespaceAssoc(ctx.namespace, ownerName, memberName);
        if (local) return local;
        if (this.topLevelAssocNames.has(`${ownerName}.${memberName}`)) {
            return {
                callee: this.topLevelAssocNames.get(`${ownerName}.${memberName}`),
                returnInfo: this.topLevelAssocReturns.get(`${ownerName}.${memberName}`) ?? null,
            };
        }
        if (ctx.openTypes.has(ownerName)) {
            const opened = this.resolveNamespaceAssoc(ctx.openTypes.get(ownerName), ownerName, memberName);
            if (opened) return opened;
        }
        const promoted = this.resolveMaybeNamespaceName(ownerName, ctx);
        return promoted?.promotedTypeName ? this.resolveNamespaceAssoc(promoted, promoted.promotedTypeName, memberName) : null;
    }

    resolveAssociatedEntryFromInfo(info, memberName, ctx) {
        if (!info?.owner) return null;
        if (info.namespace) {
            const resolved = this.resolveNamespaceAssoc(info.namespace, info.owner, memberName);
            if (resolved) return resolved;
        }
        return this.resolveAssociatedEntry(info.owner, memberName, ctx);
    }

    resolveProtocolDispatchFromInfo(info, memberName, totalArgCount = 1) {
        if (!info?.text) return null;
        if (this.topLevelProtocolNames.has(info.text)) {
            const member = this.topLevelProtocolMembers.get(this.protocolMemberKey(info.text, memberName));
            return member?.arity === totalArgCount
                ? { callee: this.mangleProtocolDispatch(info.text, memberName, info.text), returnInfo: member.returnInfo }
                : null;
        }
        const entries = this.topLevelProtocolImplsByTypeMember.get(this.protocolTypeMemberKey(info.text, memberName)) ?? [];
        const matchingEntries = entries.filter((entry) => (this.topLevelProtocolMembers.get(this.protocolMemberKey(entry.protocol, entry.member))?.arity ?? 1) === totalArgCount);
        if (matchingEntries.length === 0) {
            const protocols = new Set([...(this.topLevelTaggedTypeProtocols.get(info.text) ?? new Set())]
                .filter((protocol) => this.topLevelProtocolMembers.get(this.protocolMemberKey(protocol, memberName))?.arity === totalArgCount));
            const matches = [...protocols];
            if (matches.length === 0) return null;
            if (matches.length > 1)
                throw new Error(`Ambiguous protocol method ".${memberName}()" on type "${info.text}" across protocols: ${matches.sort().join(', ')}`);
            const protocol = matches[0];
            return {
                callee: this.mangleProtocolDispatch(protocol, memberName, info.text),
                returnInfo: this.topLevelProtocolMembers.get(this.protocolMemberKey(protocol, memberName))?.returnInfo ?? null,
            };
        }
        if (matchingEntries.length > 1) {
            const protocols = matchingEntries.map((entry) => entry.protocol).sort().join(', ');
            throw new Error(`Ambiguous protocol method ".${memberName}()" on type "${info.text}" across protocols: ${protocols}`);
        }
        const entry = matchingEntries[0];
        return { callee: this.mangleProtocolDispatch(entry.protocol, entry.member, entry.selfType), returnInfo: entry.returnInfo };
    }

    inferJoinedExprInfo(nodes, ctx) {
        const infos = nodes.map((node) => this.inferExprInfo(node, ctx)).filter(Boolean);
        if (infos.length === 0) return null;
        const [first] = infos;
        return infos.every((info) => sameTypeInfo(info, first)) ? first : first;
    }

    resolveFieldExprInfo(node, ctx) {
        const [baseNode, memberNode] = kids(node);
        const baseInfo = this.inferExprInfo(baseNode, ctx);
        if (!baseInfo?.text || !memberNode) return null;
        if (this.topLevelProtocolNames.has(baseInfo.text))
            return this.topLevelProtocolMembers.get(this.protocolMemberKey(baseInfo.text, memberNode.text))?.returnInfo ?? null;
        const field = this.topLevelStructFieldTypes.get(baseInfo.text)?.get(memberNode.text) ?? null;
        if (field) return field.typeInfo;
        const protocols = [...(this.topLevelTaggedTypeProtocols.get(baseInfo.text) ?? new Set())]
            .filter((protocol) => this.topLevelProtocolMembers.get(this.protocolMemberKey(protocol, memberNode.text))?.getter);
        if (protocols.length !== 1) return null;
        return this.topLevelProtocolMembers.get(this.protocolMemberKey(protocols[0], memberNode.text))?.returnInfo ?? null;
    }

    inferExprInfo(node, ctx) {
        if (!node) return null;
        switch (node.type) {
            case 'identifier':
                return this.resolveValueType(node.text, ctx);
            case 'paren_expr':
                return this.inferExprInfo(kids(node)[0], ctx);
            case 'struct_init':
                return this.describeType(kids(node)[0], ctx);
            case 'field_expr':
                return this.resolveFieldExprInfo(node, ctx);
            case 'index_expr': {
                const objectInfo = this.inferExprInfo(kids(node)[0], ctx);
                const elemText = objectInfo?.text?.startsWith('array[') ? objectInfo.text.slice(6, -1) : null;
                if (!elemText) return null;
                return objectInfo?.text?.startsWith('array[')
                    ? { text: elemText, owner: this.topLevelTypeNames.has(elemText) || this.topLevelProtocolNames.has(elemText) ? elemText : null, namespace: null }
                    : null;
            }
            case 'call_expr':
                return this.inferCallExprInfo(node, ctx);
            case 'promoted_module_call_expr':
                return this.resolveNamespaceValueReturn(this.resolveNamespaceFromModuleRef(node, ctx), childOfType(node, 'identifier')?.text);
            case 'if_expr':
                return this.inferJoinedExprInfo([kids(node)[1], kids(node)[2]].filter(Boolean), ctx);
            case 'else_expr':
                return this.inferExprInfo(kids(node)[1], ctx) ?? this.stripNullable(this.inferExprInfo(kids(node)[0], ctx));
            case 'promote_expr':
                return this.inferExprInfo(kids(node)[2], ctx) ?? this.inferExprInfo(kids(node)[3], ctx) ?? null;
            case 'match_expr':
                return this.inferJoinedExprInfo(childrenOfType(node, 'match_arm').map((arm) => kids(arm).at(-1)), ctx);
            case 'alt_expr':
                return this.inferJoinedExprInfo(childrenOfType(node, 'alt_arm').map((arm) => kids(arm).at(-1)), ctx);
            case 'block_expr':
                return this.inferExprInfo(childOfType(node, 'block'), ctx);
            case 'block': {
                const body = kids(node);
                return body.length ? this.inferExprInfo(body.at(-1), ctx) : null;
            }
            default:
                return null;
        }
    }

    inferCallExprInfo(node, ctx) {
        const callee = kids(node)[0];
        const argNodes = kids(childOfType(node, 'arg_list'));
        if (!callee) return null;
        if (callee.type === 'identifier') return this.resolveFunctionReturn(callee.text, ctx);
        if (callee.type === 'type_member_expr') {
            const protocolCall = this.resolveProtocolTypeMemberCall(callee, argNodes, ctx);
            if (protocolCall) return protocolCall.returnInfo;
            const memberNode = childOfType(callee, 'identifier');
            const ownerNode = kids(callee).find((child) => child !== memberNode);
            return memberNode ? this.resolveAssociatedReturn(ownerNode, memberNode.text, ctx) : null;
        }
        if (callee.type === 'field_expr') {
            const [baseNode, memberNode] = kids(callee);
            if (baseNode?.type === 'identifier' && memberNode && !this.isLocalValue(ctx, baseNode.text)) {
                return this.resolveNamespaceValueReturn(this.resolveMaybeNamespaceName(baseNode.text, ctx), memberNode.text);
            }
            return this.resolveMethodCall(callee, ctx, argNodes.length + 1)?.returnInfo ?? null;
        }
        if (callee.type === 'promoted_module_call_expr') {
            return this.resolveNamespaceValueReturn(this.resolveNamespaceFromModuleRef(callee, ctx), childOfType(callee, 'identifier')?.text);
        }
        return null;
    }

    resolveAssociatedReturn(ownerNode, memberName, ctx) {
        if (!ownerNode) return null;
        if (['qualified_type_ref', 'inline_module_type_path', 'instantiated_module_ref'].includes(ownerNode.type)) {
            const namespace = this.resolveNamespaceFromModuleRef(ownerNode, ctx);
            const ownerName = childOfType(ownerNode, 'type_ident')?.text ?? namespace.promotedTypeName;
            return this.resolveNamespaceAssoc(namespace, ownerName, memberName)?.returnInfo ?? null;
        }
        return this.resolveAssociatedEntry(ownerNode.text, memberName, ctx)?.returnInfo ?? null;
    }
}

installMixin(ModuleExpander, ExpressionsResolutionMixin);
