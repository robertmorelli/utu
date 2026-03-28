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
