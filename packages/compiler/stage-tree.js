function clonePoint(point) {
    return point
        ? { row: point.row, column: point.column }
        : null;
}

function cloneStageNode(node) {
    const children = Array.from(node.children ?? [], cloneStageNode);
    return {
        id: node.id ?? null,
        type: node.type,
        text: node.text,
        isNamed: Boolean(node.isNamed),
        hasError: Boolean(node.hasError),
        isMissing: Boolean(node.isMissing),
        startIndex: node.startIndex ?? null,
        endIndex: node.endIndex ?? null,
        startPosition: clonePoint(node.startPosition),
        endPosition: clonePoint(node.endPosition),
        children,
        namedChildren: children.filter((child) => child?.isNamed),
    };
}

const EMPTY = [];

export const rootNode = (node) => node?.rootNode ?? node;
export const namedChildren = (node) => {
    const children = node?.namedChildren ?? EMPTY;
    return children.some((child) => child.type === "comment")
        ? children.filter((child) => child.type !== "comment")
        : children;
};
export const childOfType = (node, type) => {
    for (const child of node?.namedChildren ?? EMPTY) {
        if (child.type === type) return child;
    }
    return null;
};
export const childrenOfType = (node, type) => {
    const matches = [];
    for (const child of node?.namedChildren ?? EMPTY) {
        if (child.type === type) matches.push(child);
    }
    return matches;
};
export const hasAnon = (node, type) => (node?.children ?? []).some((child) => !child.isNamed && child.type === type);
export const walk = (node, visit) => {
    if (!node) return;
    visit(node);
    for (const child of node.namedChildren ?? EMPTY) {
        if (child.type !== "comment") walk(child, visit);
    }
};
export const walkBlock = (block, visit) => {
    for (const statement of block?.namedChildren ?? EMPTY) {
        if (statement.type !== "comment") walk(statement, visit);
    }
};

export const stringLiteralValue = (node) => {
    const child = node?.type === "literal" ? (node.namedChildren ?? EMPTY)[0] ?? null : null;
    return child?.type === "string_lit"
        ? child.text.slice(1, -1)
        : child?.type === "multiline_string_lit"
            ? childrenOfType(child, "multiline_string_line").map((line) => line.text.slice(2)).join("\n")
            : null;
};

export function findAnonBetween(node, left, right) {
    let gap = 0;
    for (const child of node?.children ?? []) {
        if (child.id === left.id) gap = 1;
        else if (child.id === right.id) break;
        else if (gap && !child.isNamed) return child.type;
    }
    return "?";
}

export function throwOnParseErrors(node) {
    if (!node?.hasError) return;
    const errors = [];
    const collect = (child) => {
        if (child?.type === "ERROR" || child?.isMissing) {
            errors.push(`  ${child.type === "ERROR" ? "Unexpected token" : `Missing ${child.type}`} at ${child.startPosition.row + 1}:${child.startPosition.column + 1}`);
        }
        child?.children?.forEach(collect);
    };
    collect(node);
    if (errors.length) throw new Error(`Parse errors:\n${errors.join("\n")}`);
}

// e1.4 Build Stage Tree:
// freeze the public stage-tree contract into a dedicated compiler-owned edit boundary.
export async function runE14BuildStageTree(context) {
    return context.tree ? cloneStageNode(context.tree) : null;
}
