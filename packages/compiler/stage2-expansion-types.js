import { childOfType, kids, namedChildren } from './stage2-expansion-shared.js';

export function describeBareType(name, ctx) {
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

export function describeType(node, ctx) {
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

export function describeReturn(node, ctx) {
    if (!node || childOfType(node, 'void_type')) return null;
    const info = this.describeType(namedChildren(node)[0], ctx);
    if (!info) return null;
    return node.children.some((child) => child.type === ',')
        ? { text: this.emitReturnType(node, ctx), owner: null, namespace: null }
        : { ...info, text: this.emitReturnType(node, ctx) };
}

export function stripNullable(info) {
    return info?.text.startsWith('?')
        ? { ...info, text: info.text.slice(1) }
        : info;
}

export function emitType(node, ctx) {
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

export function resolveBareType(name, ctx) {
    return this.describeBareType(name, ctx).text;
}

export function resolvePromotedType(namespace) {
    return namespace.promotedType;
}
