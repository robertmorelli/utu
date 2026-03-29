import {
    BUILTIN_METHOD_RETURN_INFO,
    ModuleExpander,
    childOfType,
    childrenOfType,
    findAnonBetween,
    hasAnon,
    kids,
    namedChildren,
    splitProtocolMemberKey,
} from "./shared.js";

const DeclarationEmitterMixin = class {
    emitItem(node, ctx, inModule) {
        if (inModule && ['module_decl', 'file_import_decl', 'construct_decl', 'library_decl', 'test_decl', 'bench_decl'].includes(node.type)) {
            const label = {
                module_decl: 'nested modules',
                file_import_decl: 'file imports',
                construct_decl: 'construct declarations',
                library_decl: 'library declarations',
                test_decl: 'test declarations',
                bench_decl: 'bench declarations',
            }[node.type];
            throw new Error(`${label} are not supported inside modules in v1`);
        }
        switch (node.type) {
            case 'module_decl':
                return '';
            case 'file_import_decl':
                return '';
            case 'construct_decl':
                return '';
            case 'struct_decl':
                return this.emitStructDecl(node, ctx, inModule);
            case 'proto_decl':
                return this.emitProtoDecl(node, ctx, inModule);
            case 'type_decl':
                return `${this.emitTypeDecl(node, ctx, inModule)};`;
            case 'fn_decl':
                return this.emitFnDecl(node, ctx, inModule);
            case 'global_decl':
                return `${this.emitGlobalDecl(node, ctx, inModule)};`;
            case 'import_decl':
                return `${this.emitImportDecl(node, ctx, inModule)};`;
            case 'jsgen_decl':
                return `${this.emitJsgenDecl(node, ctx, inModule)};`;
            case 'library_decl':
                return inModule ? '' : this.emitLibraryDecl(node, ctx);
            case 'test_decl':
                return inModule ? '' : this.emitTestDecl(node, ctx);
            case 'bench_decl':
                return inModule ? '' : this.emitBenchDecl(node, ctx);
            default:
                return '';
        }
    }

    emitStructDecl(node, ctx, inModule) {
        const nameNode = childOfType(node, 'type_ident');
        const typeName = inModule ? ctx.namespace.typeNames.get(nameNode.text) : nameNode.text;
        const fields = childrenOfType(childOfType(node, 'field_list'), 'field').map((field) => this.emitField(field, ctx));
        const rec = hasAnon(node, 'rec') ? 'rec ' : '';
        const tag = hasAnon(node, 'tag') ? 'tag ' : '';
        const protocols = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident').map((child) => inModule ? ctx.namespace.typeNames.get(child.text) ?? child.text : child.text);
        const protocolClause = protocols.length ? `: ${protocols.join(', ')}` : '';
        return `${rec}${tag}struct ${typeName}${protocolClause} {\n${fields.map((field) => `    ${field},`).join('\n')}\n};`;
    }

    emitField(node, ctx) {
        const [nameNode, typeNode] = kids(node);
        return `${hasAnon(node, 'mut') ? 'mut ' : ''}${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
    }

    emitProtoDecl(node, ctx, inModule) {
        if (inModule) throw new Error('proto declarations are not supported inside modules in v1');
        const nameNode = childOfType(node, 'type_ident');
        const typeParams = childrenOfType(childOfType(node, 'module_type_param_list'), 'type_ident').map((child) => child.text);
        const memberList = childOfType(node, 'proto_member_list');
        const methods = memberList
            ? childrenOfType(memberList, 'proto_member')
                .map((member) => kids(member)[0])
                .filter((member) => ['proto_method', 'proto_getter', 'proto_setter'].includes(member?.type))
                .map((member) => this.emitProtoMember(member, ctx))
            : [];
        const typeParamList = typeParams.length ? `[${typeParams.join(', ')}]` : '';
        return `proto ${nameNode.text}${typeParamList} {\n${methods.map((method) => `    ${method},`).join('\n')}\n};`;
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
        const protocols = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident').map((child) => inModule ? ctx.namespace.typeNames.get(child.text) ?? child.text : child.text);
        const protocolClause = protocols.length ? `: ${protocols.join(', ')}` : '';
        return `${rec}${tagged}type ${typeName}${protocolClause} = ${variants.map((variant) => `| ${variant}`).join(' ')}`;
    }

    emitVariant(node, ctx, inModule) {
        const nameNode = childOfType(node, 'type_ident');
        const name = inModule ? ctx.namespace.typeNames.get(nameNode.text) : nameNode.text;
        const fields = childrenOfType(childOfType(node, 'field_list'), 'field').map((field) => this.emitField(field, ctx));
        return fields.length ? `${name} { ${fields.join(', ')} }` : name;
    }

    emitFnDecl(node, ctx, inModule) {
        const assocNode = childOfType(node, 'associated_fn_name');
        const protocolOwner = assocNode ? kids(assocNode)[0]?.text ?? null : null;
        const name = assocNode
            ? this.topLevelProtocolNames.has(protocolOwner)
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

    emitProtocolImplName(node, ctx, inModule) {
        if (inModule) throw new Error('protocol implementations are not supported inside modules in v1');
        const assocNode = childOfType(node, 'associated_fn_name');
        const [ownerNode, nameNode] = kids(assocNode);
        return `${ownerNode.text}.${nameNode.text}`;
    }

    emitAssociatedFnName(node, ctx, inModule) {
        const [ownerNode, nameNode] = kids(node);
        if (inModule) {
            return ctx.namespace.assocNames.get(`${ownerNode.text}.${nameNode.text}`);
        }
        const key = `${ownerNode.text}.${nameNode.text}`;
        return this.topLevelAssocNames.get(key);
    }

    emitParam(node, ctx) {
        const [nameNode, typeNode] = kids(node);
        return `${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
    }

    emitReturnType(node, ctx) {
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

    emitGlobalDecl(node, ctx, inModule) {
        const [nameNode, typeNode, valueNode] = kids(node);
        const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
        return `let ${name}: ${this.emitType(typeNode, ctx)} = ${this.emitExpr(valueNode, ctx)}`;
    }

    emitImportDecl(node, ctx, inModule) {
        return this.emitExternDecl('escape', childOfType(node, 'string_lit').text, node, ctx, inModule);
    }

    emitImportParamList(node, ctx) {
        return kids(node).map((child) => child.type === 'param' ? this.emitParam(child, ctx) : this.emitType(child, ctx)).join(', ');
    }

    emitJsgenDecl(node, ctx, inModule) {
        return this.emitExternDecl('escape', childOfType(node, 'jsgen_lit').text, node, ctx, inModule);
    }

    emitExternDecl(keyword, sourceText, node, ctx, inModule) {
        const nameNode = childOfType(node, 'identifier');
        const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
        const returnTypeNode = childOfType(node, 'return_type');
        return returnTypeNode
            ? `${keyword} ${sourceText} ${name}(${this.emitImportParamList(childOfType(node, 'import_param_list'), ctx)}) ${this.emitReturnType(returnTypeNode, ctx)}`
            : `${keyword} ${sourceText} ${name}: ${this.emitType(kids(node).at(-1), ctx)}`;
    }

    emitTestDecl(node, ctx) {
        return `test ${childOfType(node, 'string_lit').text} ${this.emitBlock(childOfType(node, 'block'), this.pushScope(ctx), true)}`;
    }

    emitBenchDecl(node, ctx) {
        return `bench ${childOfType(node, 'string_lit').text} { ${this.emitSetupDecl(childOfType(node, 'setup_decl'), this.pushScope(ctx))} }`;
    }

    emitSetupDecl(node, ctx) {
        const parts = [];
        for (const child of kids(node)) {
            if (child.type === 'measure_decl') {
                parts.push(`measure ${this.emitBlock(childOfType(child, 'block'), this.pushScope(ctx), true)}`);
                continue;
            }
            parts.push(`${this.emitExpr(child, ctx)};`);
        }
        return `setup { ${parts.join(' ')} }`;
    }

    emitLibraryDecl(node, ctx) {
        const parts = [];
        for (const child of kids(node)) {
            if (child.type === 'construct_decl') {
                this.applyConstruct(child, ctx);
                continue;
            }
            const emitted = this.emitItem(child, ctx, false);
            if (emitted) parts.push(emitted);
        }
        return `library {\n${parts.map((part) => indentBlock(part)).join('\n\n')}\n}`;
    }

    describeBareType(name, ctx) {
        if (ctx.typeParams.has(name)) return { text: ctx.typeParams.get(name), owner: name, namespace: ctx.namespace };
        if (ctx.namespace?.typeNames.has(name)) return { text: ctx.namespace.typeNames.get(name), owner: name, namespace: ctx.namespace };
        if (this.topLevelTypeNames.has(name)) return { text: name, owner: name, namespace: null };
        if (this.topLevelProtocolNames.has(name)) return { text: name, owner: name, namespace: null };
        if (ctx.openTypes.has(name)) {
            const namespace = ctx.openTypes.get(name);
            return { text: namespace.typeNames.get(name), owner: name, namespace };
        }
        const namespace = this.resolveMaybeNamespaceName(name, ctx);
        return namespace?.promotedType
            ? { text: namespace.promotedType, owner: namespace.promotedTypeName, namespace }
            : { text: name, owner: null, namespace: null };
    }

    describeType(node, ctx) {
        if (!node) return null;
        switch (node.type) {
            case 'scalar_type':
                return { text: node.text, owner: null, namespace: null };
            case 'type_ident':
                return this.describeBareType(node.text, ctx);
            case 'instantiated_module_ref': {
                const namespace = this.resolveNamespaceFromModuleRef(node, ctx);
                return { text: this.resolvePromotedType(namespace), owner: namespace.promotedTypeName, namespace };
            }
            case 'qualified_type_ref': {
                const moduleRef = childOfType(node, 'module_ref') ?? childOfType(node, 'instantiated_module_ref');
                const typeNode = childOfType(node, 'type_ident');
                const namespace = this.resolveNamespaceFromModuleRef(moduleRef, ctx);
                return { text: namespace.typeNames.get(typeNode.text), owner: typeNode.text, namespace };
            }
            case 'nullable_type': {
                const info = this.describeType(kids(node)[0], ctx);
                return info ? { ...info, text: `?${info.text}` } : { text: this.emitType(node, ctx), owner: null, namespace: null };
            }
            case 'ref_type': {
                if (node.children[0]?.type === 'array') return { text: this.emitType(node, ctx), owner: null, namespace: null };
                const child = kids(node)[0];
                return child ? this.describeType(child, ctx) : { text: node.text, owner: null, namespace: null };
            }
            case 'paren_type': {
                const info = this.describeType(kids(node)[0], ctx);
                return info ? { ...info, text: `(${info.text})` } : { text: this.emitType(node, ctx), owner: null, namespace: null };
            }
            default:
                return { text: this.emitType(node, ctx), owner: null, namespace: null };
        }
    }

    describeReturn(node, ctx) {
        if (!node || childOfType(node, 'void_type')) return null;
        const info = this.describeType(namedChildren(node)[0], ctx);
        if (!info) return null;
        return node.children.some((child) => child.type === ',')
            ? { text: this.emitReturnType(node, ctx), owner: null, namespace: null }
            : { ...info, text: this.emitReturnType(node, ctx) };
    }

    stripNullable(info) {
        return info?.text.startsWith('?')
            ? { ...info, text: info.text.slice(1) }
            : info;
    }

    emitType(node, ctx) {
        if (!node) return 'void';
        switch (node.type) {
            case 'scalar_type':
                return node.text;
            case 'type_ident':
                return this.resolveBareType(node.text, ctx);
            case 'instantiated_module_ref':
                return this.resolvePromotedType(this.resolveNamespaceFromModuleRef(node, ctx));
            case 'qualified_type_ref':
                return this.describeType(node, ctx).text;
            case 'nullable_type':
                return `?${this.emitType(kids(node)[0], ctx)}`;
            case 'ref_type': {
                if (node.children[0]?.type === 'array') return `array[${this.emitType(kids(node)[0], ctx)}]`;
                const child = kids(node)[0];
                return child ? this.emitType(child, ctx) : node.text;
            }
            case 'func_type':
                throw new Error('First-class function reference types are not supported yet');
            case 'paren_type':
                return `(${this.emitType(kids(node)[0], ctx)})`;
            default:
                return node.text;
        }
    }

    resolveBareType(name, ctx) {
        return this.describeBareType(name, ctx).text;
    }

    resolvePromotedType(namespace) {
        return namespace.promotedType;
    }

};

function indentBlock(source) {
    return source
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n');
}

for (const name of Object.getOwnPropertyNames(DeclarationEmitterMixin.prototype)) {
    if (name !== 'constructor') ModuleExpander.prototype[name] = DeclarationEmitterMixin.prototype[name];
}
