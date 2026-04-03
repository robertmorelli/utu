import { findNamedChild } from '../document/index.js';

export function findModuleNameNode(node) {
    return findNamedChild(findNamedChild(node, 'module_name'), 'identifier')
        ?? findNamedChild(findNamedChild(node, 'module_name'), 'type_ident')
        ?? findNamedChild(node, 'identifier')
        ?? findNamedChild(node, 'type_ident');
}

export function sameNode(left, right) {
    return Boolean(left && right)
        && left.type === right.type
        && left.startIndex === right.startIndex
        && left.endIndex === right.endIndex;
}
