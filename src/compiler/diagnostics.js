export const DIAGNOSTIC_KINDS = {
  PARSE_ERROR: 'parse-error',
  IMPORT_CYCLE: 'import-cycle',
  UNKNOWN_IMPORT: 'unknown-import',
  ENTRY_SURFACE_CONFLICT: 'entry-surface-conflict',
  MODULE_VARIANCE: 'module-variance',
  UNKNOWN_TYPE: 'unknown-type',
  UNKNOWN_VARIABLE: 'unknown-variable',
  UNKNOWN_FIELD: 'unknown-field',
  UNKNOWN_METHOD: 'unknown-method',
  WRONG_ARITY: 'wrong-arity',
  TYPE_MISMATCH: 'type-mismatch',
  INVALID_ASSIGNMENT_TARGET: 'invalid-assignment-target',
  ASSIGNMENT_TO_IMMUTABLE: 'assignment-to-immutable',
  NULLABLE_ACCESS: 'nullable-access',
  MISSING_FIELD: 'missing-field',
  DUPLICATE_FIELD: 'duplicate-field',
  RECURSIVE_TYPE: 'recursive-type',
  NON_EXHAUSTIVE_MATCH: 'non-exhaustive-match',
  IMPLICIT_STRUCT_INIT: 'implicit-struct-init',
  REWRITE_INVARIANT: 'rewrite-invariant',
  INVALID_DSL_USAGE: 'invalid-dsl-usage',
};

export function stampDiagnostic(node, kind, message, extra = {}) {
  if (!node?.dataset) return node;
  node.dataset.error = kind;
  node.dataset.errorKind = kind;
  node.dataset.errorMessage = message;
  const normalized = normalizeDiagnosticExtra(extra, { kind, message });
  if (Object.keys(normalized).length) node.dataset.errorData = JSON.stringify(normalized);
  return node;
}

export function suspect(node, label = '') {
  stampSuspectedInvolvement(node, label);
  return { label, ...nodeRef(node) };
}

export function stampSuspectedInvolvement(node, label = '', extra = {}) {
  if (!node?.dataset) return node;
  const current = parseJsonArray(node.dataset.errorSuspects);
  current.push({ label, ...extra });
  node.dataset.errorSuspect = 'true';
  node.dataset.errorSuspects = JSON.stringify(current);
  return node;
}

function normalizeDiagnosticExtra(extra, diagnostic) {
  const out = { ...extra };
  if (Array.isArray(out.relatedNodes)) {
    out.related = [...(Array.isArray(out.related) ? out.related : [])];
    for (const item of out.relatedNodes) {
      const node = item?.node ?? item;
      const label = item?.label ?? '';
      stampSuspectedInvolvement(node, label, { kind: diagnostic.kind, message: diagnostic.message });
      out.related.push({ label, ...nodeRef(node) });
    }
    delete out.relatedNodes;
  }
  return out;
}

function parseJsonArray(text) {
  if (!text) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function compilerError(kind, message, node, extra = {}) {
  const error = new Error(message);
  error.diagnostic = {
    kind,
    message,
    primary: nodeRef(node),
    ...extra,
  };
  return error;
}

export function related(node, label = '') {
  return { label, ...nodeRef(node) };
}

export function nodeRef(node) {
  if (!node) return null;
  return {
    id: node.id || null,
    originId: node.dataset?.originId ?? node.id ?? null,
    file: node.dataset?.sourceFile ?? node.dataset?.originFile ?? node.dataset?.file ?? null,
    row: toNum(node.dataset?.row),
    col: toNum(node.dataset?.col),
    endRow: toNum(node.dataset?.endRow),
    endCol: toNum(node.dataset?.endCol),
    start: toNum(node.dataset?.start),
    end: toNum(node.dataset?.end),
    rewritePass: node.dataset?.rewritePass ?? null,
    rewriteKind: node.dataset?.rewriteKind ?? null,
    name: node.getAttribute?.('name') ?? null,
    localName: node.localName ?? null,
  };
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
