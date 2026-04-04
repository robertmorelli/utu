export function cloneDiagnostic(diagnostic) {
    return {
        ...diagnostic,
        range: copyRange(diagnostic.range),
        offsetRange: diagnostic.offsetRange ? { ...diagnostic.offsetRange } : undefined,
    };
}

export function cloneSymbol(symbol) {
    return {
        ...symbol,
        range: copyRange(symbol.range),
        offsetRange: symbol.offsetRange ? { ...symbol.offsetRange } : undefined,
    };
}

export function cloneOccurrence(occurrence) {
    return {
        ...occurrence,
        range: copyRange(occurrence.range),
        offsetRange: occurrence.offsetRange ? { ...occurrence.offsetRange } : undefined,
    };
}

function copyRange(range) {
    return range ? {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
    } : range;
}
