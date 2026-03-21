export const rootNode = (treeOrNode) => treeOrNode.rootNode ?? treeOrNode;

export const childOfType = (node, type) =>
    node?.namedChildren.find(child => child.type === type) ?? null;

export const childrenOfType = (node, type) =>
    node ? node.namedChildren.filter(child => child.type === type) : [];

export const hasAnon = (node, type) =>
    node.children.some(child => !child.isNamed && child.type === type);

export function walk(node, visit) {
    if (!node) return;
    visit(node);
    for (const child of node.namedChildren) walk(child, visit);
}

export function walkBlock(block, visit) {
    for (const stmt of block?.namedChildren ?? []) walk(stmt, visit);
}

export function stringLiteralValue(node) {
    if (node.type !== 'literal') return null;
    const child = node.namedChildren[0];
    if (!child) return null;
    if (child.type === 'string_lit') return child.text.slice(1, -1);
    if (child.type === 'multiline_string_lit') {
        return childrenOfType(child, 'multiline_string_line')
            .map(line => line.text.slice(2))
            .join('\n');
    }
    return null;
}

export function findAnonBetween(node, leftChild, rightChild) {
    let inGap = false;
    for (const child of node.children) {
        if (child.id === leftChild.id) {
            inGap = true;
            continue;
        }
        if (child.id === rightChild.id) break;
        if (inGap && !child.isNamed) return child.type;
    }
    return '?';
}

export function throwOnParseErrors(node) {
    const errors = [];
    collectParseErrors(node, errors);
    if (!errors.length) return;
    throw new Error(`Parse errors:\n${errors.map(({ message, row, col }) => `  ${message} at ${row + 1}:${col + 1}`).join('\n')}`);
}

function collectParseErrors(node, out) {
    if (node.type === 'ERROR' || node.isMissing) {
        out.push({
            message: node.type === 'ERROR' ? 'Unexpected token' : `Missing ${node.type}`,
            row: node.startPosition.row,
            col: node.startPosition.column,
        });
    }
    for (const child of node.children) collectParseErrors(child, out);
}
