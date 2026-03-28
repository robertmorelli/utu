import { clamp, toSourceDocument } from './text-document.js';

export const offsetRangeFromNode = (node) => ({ start: node.startIndex, end: node.endIndex });
export const offsetRangeFromOffsets = (start, end) => ({ start, end });
export const spanFromNode = (documentOrSource, node) => spanFromOffsets(documentOrSource, node.startIndex, node.endIndex);
export const rangeFromNode = (documentOrSource, node) => spanFromNode(documentOrSource, node).range;
export const rangeFromOffsets = (documentOrSource, startOffset, endOffset) => spanFromOffsets(documentOrSource, startOffset, endOffset).range;

export function spanFromOffsets(documentOrSource, startOffset, endOffset) {
    const document = toSourceDocument(documentOrSource);
    const sourceLength = document.getText().length;
    const start = clamp(startOffset, 0, sourceLength);
    const end = clamp(endOffset, 0, sourceLength);
    const startPosition = document.positionAt(start);
    const endPosition = document.positionAt(end);
    return {
        range: startPosition.line < endPosition.line
            || startPosition.line === endPosition.line && startPosition.character < endPosition.character
            ? { start: startPosition, end: endPosition }
            : {
                start: startPosition,
                end: {
                    line: startPosition.line,
                    character: Math.min(startPosition.character + 1, document.lineAt(startPosition.line).text.length),
                },
            },
        offsetRange: { start, end },
    };
}
