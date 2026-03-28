const EMPTY = [];

export const rootNode = n => n?.rootNode ?? n;
export const namedChildren = n => {
    const children = n?.namedChildren ?? EMPTY;
    return children.some(c => c.type === 'comment') ? children.filter(c => c.type !== 'comment') : children;
};
export const childOfType = (n, t) => {
    for (const child of n?.namedChildren ?? EMPTY) {
        if (child.type === t) return child;
    }
    return null;
};
export const childrenOfType = (n, t) => {
    const matches = [];
    for (const child of n?.namedChildren ?? EMPTY) {
        if (child.type === t) matches.push(child);
    }
    return matches;
};
export const hasAnon = (n, t) => (n?.children ?? []).some(c => !c.isNamed && c.type === t);
export const walk = (n, v) => {
    if (!n) return;
    v(n);
    for (const child of n.namedChildren ?? EMPTY) {
        if (child.type !== 'comment') walk(child, v);
    }
};
export const walkBlock = (b, v) => {
    for (const stmt of b?.namedChildren ?? EMPTY) {
        if (stmt.type !== 'comment') walk(stmt, v);
    }
};

export const stringLiteralValue = n => {
    const c = n?.type === 'literal' ? (n.namedChildren ?? EMPTY)[0] ?? null : null;
    return c?.type === 'string_lit' ? c.text.slice(1, -1)
        : c?.type === 'multiline_string_lit' ? childrenOfType(c, 'multiline_string_line').map(l => l.text.slice(2)).join('\n')
        : null;
};

export function findAnonBetween(n, l, r) {
    let gap = 0;
    for (const c of n?.children ?? []) {
        if (c.id === l.id) gap = 1;
        else if (c.id === r.id) break;
        else if (gap && !c.isNamed) return c.type;
    }
    return '?';
}

export function throwOnParseErrors(n) {
    if (!n?.hasError) return;
    const errs = [];
    const collect = c => {
        if (c?.type === 'ERROR' || c?.isMissing) {
            errs.push(`  ${c.type === 'ERROR' ? 'Unexpected token' : `Missing ${c.type}`} at ${c.startPosition.row + 1}:${c.startPosition.column + 1}`);
        }
        c?.children?.forEach(collect);
    };
    collect(n);
    if (errs.length) throw new Error(`Parse errors:\n${errs.join('\n')}`);
}
