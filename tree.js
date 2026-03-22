const COMMENT_NODE_TYPE = 'comment';

export const rootNode = (treeOrNode) => treeOrNode?.rootNode ?? treeOrNode;
export const namedChildren = (node) => (node?.namedChildren ?? []).filter(child => child.type !== COMMENT_NODE_TYPE);
export const childOfType = (node, type) => namedChildren(node).find(child => child.type === type) ?? null;
export const childrenOfType = (node, type) => namedChildren(node).filter(child => child.type === type);
export const hasAnon = (node, type) => (node?.children ?? []).some(child => !child.isNamed && child.type === type);
export const walk = (node, visit) => node && (visit(node), namedChildren(node).forEach(child => walk(child, visit)));
export const walkBlock = (block, visit) => namedChildren(block).forEach(stmt => walk(stmt, visit));

export function stringLiteralValue(node) {
    if (node?.type !== 'literal') return null;
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
    for (const child of node?.children ?? []) {
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
    if (!node) return;
    if (node.type === 'ERROR' || node.isMissing) out.push({
        message: node.type === 'ERROR' ? 'Unexpected token' : `Missing ${node.type}`,
        row: node.startPosition.row,
        col: node.startPosition.column,
    });
    for (const child of node.children ?? []) collectParseErrors(child, out);
};
