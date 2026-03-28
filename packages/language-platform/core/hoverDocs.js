import { BUILTIN_DOCS, BUILTIN_NAMESPACE_DOCS, BUILTIN_RETURN_TYPES, CORE_TYPE_DOCS, KEYWORD_DOCS, LITERAL_DOCS } from '../../language-spec/index.js';
export { BUILTIN_METHODS, CORE_TYPE_COMPLETIONS, KEYWORD_COMPLETIONS, LITERAL_COMPLETIONS, isBuiltinNamespace } from '../../language-spec/index.js';
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
