import {
    rootNode,
    namedChildren,
    childOfType,
    childrenOfType,
    hasAnon,
    findAnonBetween,
    throwOnParseErrors,
} from './header-snapshot.js';

export { rootNode, namedChildren, childOfType, childrenOfType, hasAnon, findAnonBetween, throwOnParseErrors };

export const kids = namedChildren;

export function pascalCase(value) {
    const parts = String(value).match(/[A-Za-z0-9]+/g) ?? ['X'];
    return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join('');
}

export function snakeCase(value) {
    const normalized = String(value)
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
    return normalized || 'x';
}

export function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0).toString(36);
}

export const BUILTIN_METHOD_RETURN_INFO = new Map([
    ['array.len', { text: 'i32', owner: null, namespace: null }],
]);

export const MODULE_FEATURE_NODES = new Set([
    'file_import_decl',
    'module_decl',
    'construct_decl',
    'proto_decl',
    'associated_fn_name',
    'qualified_type_ref',
    'type_member_expr',
]);

export function containsModuleFeature(node) {
    if (!node) return false;
    if (MODULE_FEATURE_NODES.has(node.type)) return true;
    if (node.type === 'call_expr') {
        const callee = namedChildren(node)[0];
        if (callee?.type === 'field_expr' || callee?.type === 'type_member_expr') return true;
    }
    return (node.children ?? []).some(containsModuleFeature);
}

export function moduleNameNode(node) {
    const wrapper = childOfType(node, 'module_name');
    if (wrapper) return moduleNameNode(wrapper);
    const moduleRef = childOfType(node, 'module_ref');
    if (moduleRef) return moduleNameNode(moduleRef);
    return node?.type === 'identifier' || node?.type === 'type_ident'
        ? node
        : childOfType(node, 'identifier') ?? childOfType(node, 'type_ident');
}

export function splitProtocolMemberKey(key) {
    const index = key.indexOf('.');
    return index === -1 ? [key, ''] : [key.slice(0, index), key.slice(index + 1)];
}

export function sameTypeInfo(left, right) {
    return (left?.text ?? null) === (right?.text ?? null);
}
