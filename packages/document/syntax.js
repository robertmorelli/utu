import { spanFromNode } from './spans.js';
import { toSourceDocument } from './text-document.js';

export const findNamedChild = (node, type) => node?.namedChildren.find((child) => child.type === type);
export const findNamedChildren = (node, type) => node?.namedChildren.filter((child) => child.type === type) ?? [];
export const walkNamedChildren = (node, visit) => node.namedChildren.forEach(visit);
export const stringLiteralName = (node) => node.text.startsWith('"') && node.text.endsWith('"') ? node.text.slice(1, -1) : node.text;

export function collectParseDiagnostics(rootNode, documentOrSource) {
    const document = toSourceDocument(documentOrSource);
    const diagnostics = [];
    const seen = new Set();
    const pushDiagnostic = (message, node) => {
        const span = spanFromNode(document, node);
        const { start, end } = span.range;
        const key = `${message}:${start.line}:${start.character}:${end.line}:${end.character}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        diagnostics.push({
            message,
            range: span.range,
            offsetRange: span.offsetRange,
            severity: 'error',
            source: 'utu',
        });
    };
    const visit = (node) => {
        if (node.isError) {
            pushDiagnostic('Unexpected token', node);
        }
        if (node.isMissing) {
            pushDiagnostic(`Missing ${node.type}`, node);
        }
        node.children.forEach(visit);
    };
    visit(rootNode);
    return diagnostics.sort((left, right) => left.range.start.line - right.range.start.line || left.range.start.character - right.range.start.character);
}
