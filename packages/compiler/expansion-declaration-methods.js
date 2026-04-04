import { cloneStageTree, readCompilerArtifact } from "./compiler-stage-runtime.js";
import { childOfType, childrenOfType, hasAnon, kids } from "./expansion-shared.js";

export function emitStructDecl(node, ctx, inModule) {
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

export function emitField(node, ctx) {
    const [nameNode, typeNode] = kids(node);
    return `${hasAnon(node, 'mut') ? 'mut ' : ''}${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
}

export function emitProtoDecl(node, ctx, inModule) {
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

export function emitProtoMember(node, ctx) {
    return node.type === 'proto_getter'
        ? this.emitProtoGetter(node, ctx)
        : node.type === 'proto_setter'
            ? this.emitProtoSetter(node, ctx)
            : this.emitProtoMethod(node, ctx);
}

export function emitProtoMethod(node, ctx) {
    const nameNode = childOfType(node, 'identifier');
    const params = kids(childOfType(node, 'type_list')).map((child) => this.emitType(child, ctx)).join(', ');
    return `${nameNode.text}(${params}) ${this.emitReturnType(childOfType(node, 'return_type'), ctx)}`;
}

export function emitProtoGetter(node, ctx) {
    const nameNode = childOfType(node, 'identifier');
    const typeNode = kids(node).at(-1);
    return `get ${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
}

export function emitProtoSetter(node, ctx) {
    const nameNode = childOfType(node, 'identifier');
    const typeNode = kids(node).at(-1);
    return `set ${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
}

export function emitTypeDecl(node, ctx, inModule) {
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

export function emitVariant(node, ctx, inModule) {
    const nameNode = childOfType(node, 'type_ident');
    const name = inModule ? ctx.namespace.typeNames.get(nameNode.text) : nameNode.text;
    const fields = childrenOfType(childOfType(node, 'field_list'), 'field').map((field) => this.emitField(field, ctx));
    return fields.length ? `${name} { ${fields.join(', ')} }` : name;
}

export function emitFnDecl(node, ctx, inModule) {
    const assocNode = childOfType(node, 'associated_fn_name');
    const protocolOwner = assocNode ? kids(assocNode)[0]?.text ?? null : null;
    const resolvedProtocolOwner = protocolOwner ? this.resolveProtocolOwnerName(protocolOwner, ctx) : null;
    const name = assocNode
        ? resolvedProtocolOwner
            ? this.emitProtocolImplName(node, ctx, inModule)
            : this.emitAssociatedFnName(assocNode, ctx, inModule)
        : inModule
            ? ctx.namespace.freeValueNames.get(childOfType(node, 'identifier').text)
            : childOfType(node, 'identifier').text;
    const params = childrenOfType(childOfType(node, 'param_list'), 'param');
    const fnCtx = this.pushScope(ctx);
    for (const param of params) {
        this.declareLocal(fnCtx, childOfType(param, 'identifier').text, this.describeType(kids(param)[1], ctx));
    }
    return `fun ${name}(${params.map((param) => this.emitParam(param, ctx)).join(', ')}) ${this.emitReturnType(childOfType(node, 'return_type'), ctx)} ${this.emitBlock(childOfType(node, 'block'), fnCtx, true)}`;
}

export function emitProtocolImplName(node, ctx, inModule) {
    const assocNode = childOfType(node, 'associated_fn_name');
    const [ownerNode, nameNode] = kids(assocNode);
    if (inModule) {
        return `${ctx.namespace.typeNames.get(ownerNode.text) ?? ownerNode.text}.${nameNode.text}`;
    }
    return `${ownerNode.text}.${nameNode.text}`;
}

export function emitAssociatedFnName(node, ctx, inModule) {
    const [ownerNode, nameNode] = kids(node);
    if (inModule) {
        return ctx.namespace.assocNames.get(`${ownerNode.text}.${nameNode.text}`);
    }
    const key = `${ownerNode.text}.${nameNode.text}`;
    return this.topLevelAssocNames.get(key);
}

export function emitParam(node, ctx) {
    const [nameNode, typeNode] = kids(node);
    return `${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
}

export function emitImportParamList(node, ctx) {
    if (!node) return '';
    return kids(node)
        .map((child) => child.type === 'param'
            ? this.emitParam(child, ctx)
            : this.emitType(child, ctx))
        .join(', ');
}

export function emitReturnType(node, ctx) {
    if (!node || childOfType(node, 'void_type')) return 'void';
    const parts = [];
    for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index];
        if (!child.isNamed || child.type === 'void_type') continue;
        let part = this.emitType(child, ctx);
        if (node.children[index + 1]?.type === '#') {
            const errorType = node.children[index + 2]?.isNamed ? this.emitType(node.children[index + 2], ctx) : 'null';
            part += ` # ${errorType}`;
            index += node.children[index + 2]?.isNamed ? 2 : 1;
        }
        parts.push(part);
    }
    return parts.join(', ');
}

export function emitGlobalDecl(node, ctx, inModule) {
    const [nameNode, typeNode, valueNode] = kids(node);
    const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
    return `let ${name}: ${this.emitType(typeNode, ctx)} = ${this.emitExpr(valueNode, ctx)}`;
}

export function emitImportDecl(node, ctx, inModule) {
    return this.emitExternDecl('escape', childOfType(node, 'string_lit')?.text ?? '', node, ctx, inModule);
}

export function emitJsgenDecl(node, ctx, inModule) {
    return this.emitExternDecl('escape', childOfType(node, 'jsgen_lit').text, node, ctx, inModule);
}

export function emitExternDecl(keyword, sourceText, node, ctx, inModule) {
    const nameNode = childOfType(node, 'identifier');
    const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
    const returnTypeNode = childOfType(node, 'return_type');
    const prefix = sourceText ? `${keyword} ${sourceText} ${name}` : `${keyword} ${name}`;
    return returnTypeNode
        ? `${prefix}(${this.emitImportParamList(childOfType(node, 'import_param_list'), ctx)}) ${this.emitReturnType(returnTypeNode, ctx)}`
        : `${prefix}: ${this.emitType(kids(node).at(-1), ctx)}`;
}

// make declaration-emission helpers an explicit edit boundary before unit
// emission passes consume them.
export async function runPrepareDeclarationEmission(context) {
    const expansionState = readCompilerArtifact(context, "expansionSession");
    return {
        tree: cloneStageTree(context.tree),
        artifacts: {
            expansionDeclarationEmission: {
                ready: Boolean(expansionState?.shouldExpand),
                recovered: Boolean(expansionState?.recovered),
                diagnostics: [...(expansionState?.diagnostics ?? [])],
            },
        },
    };
}
