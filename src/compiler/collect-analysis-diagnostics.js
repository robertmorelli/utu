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
    const data = parseJson(node.dataset.errorData);
    diagnostics.push({
      kind: node.dataset.errorKind,
      severity: 'error',
      message: node.dataset.errorMessage ?? node.dataset.errorKind,
      primary: nodeRef(node),
      context: nearestDiagnosticContext(node),
      related: data?.related ?? [],
      notes: [],
      fixes: [],
      data,
    });
  }

  return diagnostics;
}

function nearestDiagnosticContext(node) {
  for (let cur = node; cur; cur = cur.parentElement) {
    if (isLargeConstruct(cur)) {
      return {
        ...nodeRef(cur),
        label: contextLabel(cur),
      };
    }
  }
  return null;
}

function isLargeConstruct(node) {
  switch (node?.localName) {
    case 'ir-fn':
    case 'ir-test':
    case 'ir-bench':
    case 'ir-module':
    case 'ir-struct':
    case 'ir-enum':
    case 'ir-protocol':
    case 'ir-impl':
    case 'ir-export-main':
    case 'ir-export-lib':
      return true;
    default:
      return false;
  }
}

function contextLabel(node) {
  const tag = node.localName?.replace(/^ir-/, '') ?? 'context';
  const name = node.getAttribute?.('name') || node.getAttribute?.('label') || '';
  return name ? `${tag} ${name}` : tag;
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
