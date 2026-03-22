const COMMENT_NODE_TYPE = 'comment';
const RAW_NODE = Symbol('utu.rawNode');
const wrappedNodes = new WeakMap();

const rawNode = (node) => node?.[RAW_NODE] ?? node;
const rawNamedChildren = (node) => rawNode(node)?.namedChildren ?? [];
const isCommentNode = (node) => node?.type === COMMENT_NODE_TYPE;

function wrapNode(node) {
    if (!node || typeof node !== 'object') return node;

    const raw = rawNode(node);
    const cached = wrappedNodes.get(raw);
    if (cached) return cached;

    const wrapped = new Proxy(raw, {
        get(target, prop) {
            if (prop === RAW_NODE) return target;
            if (prop === 'namedChildren')
                return rawNamedChildren(target)
                    .filter(child => !isCommentNode(child))
                    .map(wrapNode);

            const value = Reflect.get(target, prop, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });

    wrappedNodes.set(raw, wrapped);
    return wrapped;
}

export const rootNode = (treeOrNode) => wrapNode(treeOrNode.rootNode ?? treeOrNode);
export const namedChildren = (node) => wrapNode(node)?.namedChildren ?? [];
export const childOfType = (node, type) => namedChildren(node).find(child => child.type === type) ?? null;
export const childrenOfType = (node, type) => namedChildren(node).filter(child => child.type === type);
export const hasAnon = (node, type) => rawNode(node)?.children.some(child => !child.isNamed && child.type === type);
export const walk = (node, visit) => node && (visit(node), namedChildren(node).forEach(child => walk(child, visit)));
export const walkBlock = (block, visit) => namedChildren(block).forEach(stmt => walk(stmt, visit));

export function stringLiteralValue(node) {
    if (node.type !== 'literal') return null;
    const child = namedChildren(node)[0];
    if (!child) return null;
    return child.type === 'string_lit'
        ? child.text.slice(1, -1)
        : child.type === 'multiline_string_lit'
            ? childrenOfType(child, 'multiline_string_line').map(line => line.text.slice(2)).join('\n')
            : null;
}

export function findAnonBetween(node, leftChild, rightChild) {
    let inGap = false;
    for (const child of rawNode(node)?.children ?? []) {
        if (child.id === leftChild.id) { inGap = true; continue; }
        if (child.id === rightChild.id) break;
        if (inGap && !child.isNamed) return child.type;
    }
    return '?';
}

export function throwOnParseErrors(node) {
    const errors = [];
    collectParseErrors(node, errors);
    if (errors.length) throw new Error(`Parse errors:\n${errors.map(({ message, row, col }) => `  ${message} at ${row + 1}:${col + 1}`).join('\n')}`);
}

const collectParseErrors = (node, out) => {
    if (node.type === 'ERROR' || node.isMissing) out.push({
        message: node.type === 'ERROR' ? 'Unexpected token' : `Missing ${node.type}`,
        row: node.startPosition.row,
        col: node.startPosition.column,
    });
    node.children.forEach(child => collectParseErrors(child, out));
};
