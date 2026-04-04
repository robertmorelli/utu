import { childOfType, childrenOfType, kids } from '../core.js';
import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class CollectTopLevelMixin {
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
}

installMixin(ModuleExpander, CollectTopLevelMixin);
