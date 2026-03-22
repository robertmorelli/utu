export function copyPosition(position) {
    return { line: position.line, character: position.character };
}
export function copyRange(range) {
    return { start: copyPosition(range.start), end: copyPosition(range.end) };
}
export function comparePositions(left, right) {
    return left.line - right.line || left.character - right.character;
}
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
export function rangeContains(range, position) {
    return comparePositions(range.start, position) <= 0
        && comparePositions(position, range.end) <= 0;
}
export function rangeLength(range) {
    const lineDelta = range.end.line - range.start.line;
    return lineDelta * 10_000 + (range.end.character - range.start.character);
}
export function rangeKey(range) {
    return `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
}
export function getDocumentUri(document) {
    return typeof document.uri === 'string' ? document.uri : document.uri.toString();
}
