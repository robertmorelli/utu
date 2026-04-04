import { childOfType, childrenOfType, hasAnon, kids } from '../core.js';
import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class DeclarationTypesMixin {
    emitStructDecl(node, ctx, inModule) {
        const nameNode = childOfType(node, 'type_ident');
        const typeName = inModule ? ctx.namespace.typeNames.get(nameNode.text) : nameNode.text;
        const fields = childrenOfType(childOfType(node, 'field_list'), 'field').map((field) => this.emitField(field, ctx));
        const rec = hasAnon(node, 'rec') ? 'rec ' : '';
        const tag = hasAnon(node, 'tag') ? 'tag ' : '';
        const protocols = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident')
            .map((child) => inModule ? ctx.namespace.typeNames.get(child.text) ?? child.text : child.text);
        const protocolClause = protocols.length ? `: ${protocols.join(', ')}` : '';
        return `${rec}${tag}struct ${typeName}${protocolClause} {\n${fields.map((field) => `    ${field},`).join('\n')}\n};`;
    }

    emitField(node, ctx) {
        const [nameNode, typeNode] = kids(node);
        return `${hasAnon(node, 'mut') ? 'mut ' : ''}${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
    }

    emitProtoDecl(node, ctx, inModule) {
        const nameNode = childOfType(node, 'type_ident');
        const protocolName = inModule ? ctx.namespace.typeNames.get(nameNode.text) : nameNode.text;
        const typeParams = childrenOfType(childOfType(node, 'module_type_param_list'), 'type_ident').map((child) => child.text);
        const memberList = childOfType(node, 'proto_member_list');
        const methods = memberList
            ? childrenOfType(memberList, 'proto_member')
                .map((member) => kids(member)[0])
                .filter((member) => ['proto_method', 'proto_getter', 'proto_setter'].includes(member?.type))
                .map((member) => this.emitProtoMember(member, ctx))
            : [];
        const typeParamList = typeParams.length ? `[${typeParams.join(', ')}]` : '';
        return `proto ${protocolName}${typeParamList} {\n${methods.map((method) => `    ${method},`).join('\n')}\n};`;
    }

    emitProtoMember(node, ctx) {
        return node.type === 'proto_getter'
            ? this.emitProtoGetter(node, ctx)
            : node.type === 'proto_setter'
                ? this.emitProtoSetter(node, ctx)
                : this.emitProtoMethod(node, ctx);
    }

    emitProtoMethod(node, ctx) {
        const nameNode = childOfType(node, 'identifier');
        const params = kids(childOfType(node, 'type_list')).map((child) => this.emitType(child, ctx)).join(', ');
        return `${nameNode.text}(${params}) ${this.emitReturnType(childOfType(node, 'return_type'), ctx)}`;
    }

    emitProtoGetter(node, ctx) {
        const nameNode = childOfType(node, 'identifier');
        const typeNode = kids(node).at(-1);
        return `get ${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
    }

    emitProtoSetter(node, ctx) {
        const nameNode = childOfType(node, 'identifier');
        const typeNode = kids(node).at(-1);
        return `set ${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
    }

    emitTypeDecl(node, ctx, inModule) {
        const typeNameNode = childOfType(node, 'type_ident');
        const typeName = inModule ? ctx.namespace.typeNames.get(typeNameNode.text) : typeNameNode.text;
        const variants = childrenOfType(childOfType(node, 'variant_list'), 'variant').map((variant) => this.emitVariant(variant, ctx, inModule));
        const rec = hasAnon(node, 'rec') ? 'rec ' : '';
        const tagged = hasAnon(node, 'tag') ? 'tag ' : '';
        const protocols = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident')
            .map((child) => inModule ? ctx.namespace.typeNames.get(child.text) ?? child.text : child.text);
        const protocolClause = protocols.length ? `: ${protocols.join(', ')}` : '';
        return `${rec}${tagged}type ${typeName}${protocolClause} = ${variants.map((variant) => `| ${variant}`).join(' ')}`;
    }

    emitVariant(node, ctx, inModule) {
        const nameNode = childOfType(node, 'type_ident');
        const name = inModule ? ctx.namespace.typeNames.get(nameNode.text) : nameNode.text;
        const fields = childrenOfType(childOfType(node, 'field_list'), 'field').map((field) => this.emitField(field, ctx));
        return fields.length ? `${name} { ${fields.join(', ')} }` : name;
    }
}

installMixin(ModuleExpander, DeclarationTypesMixin);
