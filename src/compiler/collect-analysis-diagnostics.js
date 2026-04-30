import { nodeRef } from './diagnostics.js';

export function collectAnalysisDiagnostics(doc) {
  const root = doc?.body?.firstChild;
  if (!root) return [];

  const diagnostics = [];

  if (root.dataset.parseErrors) {
    for (const item of JSON.parse(root.dataset.parseErrors)) {
      diagnostics.push({
        kind: 'parse-error',
        severity: 'error',
        message: item.message,
        primary: {
          file: root.dataset.sourceFile ?? root.dataset.originFile ?? root.dataset.file ?? null,
          row: item.row != null ? item.row + 1 : null,
          col: item.column != null ? item.column + 1 : null,
          endRow: null,
          endCol: null,
          start: item.start ?? null,
          end: item.end ?? null,
          originId: root.dataset.originId ?? root.id ?? null,
          rewritePass: null,
          rewriteKind: null,
          name: null,
          localName: root.localName,
        },
        related: [],
        notes: [],
        fixes: [],
      });
    }
  }

  for (const node of root.querySelectorAll('[data-error-kind]')) {
    diagnostics.push({
      kind: node.dataset.errorKind,
      severity: 'error',
      message: node.dataset.errorMessage ?? node.dataset.errorKind,
      primary: nodeRef(node),
      related: parseJson(node.dataset.errorData)?.related ?? [],
      notes: [],
      fixes: [],
      data: parseJson(node.dataset.errorData),
    });
  }

  return diagnostics;
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
