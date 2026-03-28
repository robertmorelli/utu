import { copyRange } from './types.js';
import { SYMBOL_METADATA } from '../../language-spec/index.js';

export function findOccurrenceAtPosition(index, position) {
    return findBestRangeMatch(index.occurrences, position);
}

export function findSymbolAtPosition(index, position) {
    const occurrence = findOccurrenceAtPosition(index, position);
    return occurrence?.symbolKey
        ? index.symbolByKey.get(occurrence.symbolKey)
        : findBestRangeMatch(index.symbols, position);
}

export function getSemanticTokenType(symbol) {
    return SYMBOL_METADATA[symbol.kind].semanticTokenType;
}

export function collectWorkspaceSymbols(symbols) {
    return symbols.map((symbol) => ({
        name: symbol.name,
        detail: symbol.detail,
        kind: SYMBOL_METADATA[symbol.kind].documentSymbolKind,
        location: { uri: symbol.uri, range: copyRange(symbol.range) },
    }));
}

export function cloneWorkspaceSymbol(symbol) {
    return {
        ...symbol,
        location: { uri: symbol.location.uri, range: copyRange(symbol.location.range) },
    };
}

function findBestRangeMatch(values, position) {
    let best;
    for (const value of values) {
        if (!rangeContains(value.range, position))
            continue;
        if (!best
            || rangeLength(value.range) < rangeLength(best.range)
            || (rangeLength(value.range) === rangeLength(best.range)
                && comparePositions(value.range.start, best.range.start) < 0)) {
            best = value;
        }
    }
    return best;
}

function rangeContains(range, position) {
    return !(comparePositions(position, range.start) < 0 || comparePositions(position, range.end) > 0);
}

function rangeLength(range) {
    return (range.end.line - range.start.line) * 1_000_000 + (range.end.character - range.start.character);
}

function comparePositions(left, right) {
    return left.line - right.line || left.character - right.character;
}
