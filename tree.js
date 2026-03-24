export const rootNode = n => n?.rootNode ?? n;
export const namedChildren = n => (n?.namedChildren ?? []).filter(c => c.type !== 'comment');
export const childOfType = (n, t) => namedChildren(n).find(c => c.type === t) ?? null;
export const childrenOfType = (n, t) => namedChildren(n).filter(c => c.type === t);
export const hasAnon = (n, t) => (n?.children ?? []).some(c => !c.isNamed && c.type === t);
export const walk = (n, v) => n && (v(n), namedChildren(n).forEach(c => walk(c, v)));
export const walkBlock = (b, v) => namedChildren(b).forEach(s => walk(s, v));

export const stringLiteralValue = n => {
    const c = n?.type === 'literal' ? namedChildren(n)[0] : null;
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
