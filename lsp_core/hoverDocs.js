import docs from '../jsondata/hoverDocs.data.json' with { type: 'json' };

const BUILTIN_DOCS = docs.builtinDocs;
const BUILTIN_RETURN_TYPES = docs.builtinReturnTypes;
const BUILTIN_NAMESPACE_DOCS = docs.builtinNamespaceDocs;
const CORE_TYPE_DOCS = docs.coreTypeDocs;
const LITERAL_DOCS = docs.literalDocs;
const KEYWORD_DOCS = docs.keywordDocs;
export const KEYWORD_COMPLETIONS = Object.keys(KEYWORD_DOCS);
export const CORE_TYPE_COMPLETIONS = Object.keys(CORE_TYPE_DOCS)
    .filter((word) => word !== 'null');
export const LITERAL_COMPLETIONS = Object.keys(LITERAL_DOCS);
export const BUILTIN_METHODS = groupBuiltinMethods(BUILTIN_DOCS);
export function getBuiltinHover(key) {
    return lookupHover(BUILTIN_DOCS, key);
}
export function getBuiltinReturnType(key, typeText) {
    const value = BUILTIN_RETURN_TYPES[key];
    if (!value || typeof value === 'string')
        return value;
    if (value.kind === 'array_new_default')
        return typeText ? `array[${typeText}]` : 'array[T]';
    if (value.kind === 'ref_null')
        return typeText ? `?${typeText}` : undefined;
    return undefined;
}
export const getCoreTypeHover = (word) => lookupHover(CORE_TYPE_DOCS, word);
export const getLiteralHover = (word) => lookupHover(LITERAL_DOCS, word);
export const getKeywordHover = (word) => lookupHover(KEYWORD_DOCS, word);
export const getBuiltinNamespaceHover = (word) =>
    lookupHover(BUILTIN_NAMESPACE_DOCS, word);
export function isBuiltinNamespace(name) {
    return Object.hasOwn(BUILTIN_METHODS, name);
}
function toMarkdown(doc) {
    return {
        kind: 'markdown',
        value: `\`\`\`utu\n${doc.signature}\n\`\`\`\n${doc.description}`,
    };
}
function lookupHover(docs, key) {
    const doc = docs[key];
    return doc ? toMarkdown(doc) : undefined;
}
function groupBuiltinMethods(docs) {
    const methods = {};
    for (const key of Object.keys(docs)) {
        const [namespace, method] = key.split('.');
        (methods[namespace] ??= []).push(method);
    }
    return methods;
}
