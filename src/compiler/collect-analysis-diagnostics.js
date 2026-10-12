import { compressedSourceWarnings, unknownIslandWarnings } from './source-warnings.js';
import { diagnosticFacts, nodeRef } from './diagnostics.js';

export function collectAnalysisDiagnostics(doc) {
  const root = doc?.body?.firstChild;
  if (!root) return [];

  const diagnostics = [];
  const sources = doc.__utuSourceTexts ?? new Map([
    [root.dataset.sourceFile ?? root.dataset.file ?? '', doc.__utuSourceText ?? ''],
  ]);
  for (const [file, source] of sources) {
    if (!/^(std|node|npm):/.test(file)) diagnostics.push(...compressedSourceWarnings(source, file));
  }
  diagnostics.push(...unknownIslandWarnings(sources));

  // Syntax errors: the entry file's own, then any from imported files.
  const parseErrorGroups = [];
  if (root.dataset.parseErrors) {
    const file = root.dataset.sourceFile ?? root.dataset.originFile ?? root.dataset.file ?? null;
    parseErrorGroups.push({ file, errors: JSON.parse(root.dataset.parseErrors) });
  }
  if (root.dataset.importedParseErrors) parseErrorGroups.push(...JSON.parse(root.dataset.importedParseErrors));
  for (const { file, errors } of parseErrorGroups) {
    for (const item of errors) {
      diagnostics.push({
        kind: 'parse-error',
        severity: 'error',
        message: item.message,
        primary: {
          file,
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

  const facts = diagnosticFacts(doc);
  for (const node of root.querySelectorAll('[data-error-kind]')) {
    if (!facts.has(node.id)) facts.set(node.id, {
      node,
      kind: node.dataset.errorKind,
      message: node.dataset.errorMessage ?? node.dataset.errorKind,
      data: parseJson(node.dataset.errorData) ?? {},
    });
  }
  const reportedParseErrors = new Set(diagnostics.filter(d => d.kind === 'parse-error').map(d => d.primary.start));
  for (const { node, kind, message, data } of facts.values()) {
    // A file root's "N parse error(s)" summary, or a recovered node at an
    // offset already listed above, duplicates the syntax errors.
    if (kind === 'parse-error' && (node.dataset?.parseErrors || reportedParseErrors.has(Number(node.dataset?.start)))) continue;
    diagnostics.push({
      kind,
      severity: 'error',
      message,
      primary: nodeRef(node),
      context: nearestDiagnosticContext(node),
      related: data.related ?? [],
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
