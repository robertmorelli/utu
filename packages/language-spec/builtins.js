import { BUILTIN_DOCS, BUILTIN_RETURN_TYPES, BUILTIN_NAMESPACE_DOCS } from './docs.js';

export const BUILTIN_METHODS = groupBuiltinMethods(BUILTIN_DOCS);
export { BUILTIN_DOCS, BUILTIN_RETURN_TYPES, BUILTIN_NAMESPACE_DOCS };

export function isBuiltinNamespace(name) {
    return Object.hasOwn(BUILTIN_METHODS, name);
}

function groupBuiltinMethods(docs) {
    const methods = {};
    for (const key of Object.keys(docs)) {
        const [namespace, method] = key.split('.');
        (methods[namespace] ??= []).push(method);
    }
    return methods;
}
