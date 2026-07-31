// Stable query facade for compiler analysis output.
//
// The compiler may use DOM IR, treaps, arrays, or other indexes internally.
// Consumers should ask this snapshot questions instead of holding live nodes
// or depending on the storage shape.

import { ANALYSIS_TOKENS } from './analysis-tokens.js';
import { buildRangeIndex, queryRangeIndex, smallestRangeAt } from './range-index.js';
import { retainGraph, retainedGraphs } from './graph-store.js';
import { createAnalysisQueries } from './analysis-queries.js';

/**
 * Create an immutable analysis snapshot from a compiled IR document and the
 * compiler artifact bundle.
 *
 * @param {Document | null} doc
 * @param {{ diagnostics?: Array<object> }} [artifacts]
 */
export function createAnalysisSnapshot(doc, artifacts = {}) {
  const diagnostics = Object.freeze([...(artifacts.diagnostics ?? [])]);
  const entries = collectRangeEntries(doc, diagnostics).map(entry => Object.freeze(entry));
  const index = buildRangeIndex(entries);
  if (doc) retainGraph(doc, 'ranges', { kind: 'source-ranges', entries, index });
  const graphs = Object.freeze({ ...retainedGraphs(doc) });
  const rangeQuery = (file, start, end, opts) => queryRangeIndex(index, file, start, end, opts);
  const queries = createAnalysisQueries(doc, graphs, rangeQuery,
    (file, start, end) => sourceSnippet(doc, rangeQuery, file, start, end));

  return Object.freeze({
    entries: Object.freeze(entries),
    diagnostics,
    graphs,
    ...queries,

    ranges(file, start, end, opts = {}) {
      return queryRangeIndex(index, file, start, end, opts);
    },

    nodeAt(file, offset, opts = {}) {
      return smallestRangeAt(index, file, offset, opts);
    },

    diagnosticsForFile(file) {
      return diagnostics.filter(diagnostic => diagnosticFile(diagnostic) === file);
    },
  });
}

/**
 * @param {Document | null} doc
 * @param {Array<object>} diagnostics
 * @returns {Array<object>}
 */
export function collectRangeEntries(doc, diagnostics = []) {
  const entries = [];
  collectSyntaxEntries(doc, entries);
  collectDomEntries(doc, entries);
  collectDiagnosticEntries(diagnostics, entries);
  return entries;
}

function sourceSnippet(doc, rangeQuery, file, start, end) {
  const source = doc?.__utuSourceTexts?.get(file)
    ?? (doc?.__utuSourceFile === file ? doc.__utuSourceText : null);
  if (typeof source !== 'string' || !Number.isFinite(start)) return null;
  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  // A reference may cover an entire function or generated declaration. The
  // inspector needs the source line containing its start, not the full range.
  const newline = source.indexOf('\n', start);
  const lineEnd = newline < 0 ? source.length : newline;
  const text = source.slice(lineStart, lineEnd);
  const tokens = rangeQuery(file, lineStart, Math.max(lineStart + 1, lineEnd))
    .filter(entry => entry.kind === 'syntax' || entry.kind === 'semantic')
    .map(entry => ({
      start: Math.max(0, entry.start - lineStart),
      end: Math.min(text.length, entry.end - lineStart),
      role: entry.role,
      semantic: entry.kind === 'semantic',
    })).filter(token => token.end > token.start);
  return Object.freeze({
    text,
    line: source.slice(0, lineStart).split('\n').length,
    focusStart: Math.max(0, Math.min(text.length, start - lineStart)),
    focusEnd: Math.max(0, Math.min(text.length, (end ?? start) - lineStart)),
    tokens: Object.freeze(tokens),
  });
}

function collectSyntaxEntries(doc, entries) {
  for (const token of doc?.[ANALYSIS_TOKENS] ?? []) entries.push(token);
}

function collectDomEntries(doc, entries) {
  const root = doc?.body?.firstChild;
  if (!root) return;

  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node?.nodeType !== 1) continue;

    const entry = domRangeEntry(node);
    if (entry) entries.push(entry);
    collectSemanticSubranges(node, entries);
    collectSuspectedInvolvement(node, entries);

    for (let child = node.lastElementChild; child; child = child.previousElementSibling) {
      stack.push(child);
    }
  }
}

function collectSemanticSubranges(node, entries) {
  const file = node.dataset?.originFile || node.dataset?.file;
  if (!file) return;

  const nameStart = numberValue(node.dataset?.nameStart);
  const nameEnd = numberValue(node.dataset?.nameEnd);
  if (nameStart != null && nameEnd != null) {
    const role = declarationNameRole(node);
    if (role) entries.push({ file, start: nameStart, end: nameEnd, kind: 'semantic', role, tag: node.tagName.toLowerCase(), name: node.getAttribute?.('name') || 'main' });
  }

  for (const [key, role, attribute, include] of [
    ['label', 'string', 'label', true],
    ['method', 'function', 'method', Boolean(node.dataset?.fnId)],
    ['field', 'function', 'field', node.dataset?.resolvedAs === 'method'],
  ]) {
    const start = numberValue(node.dataset?.[`${key}Start`]);
    const end = numberValue(node.dataset?.[`${key}End`]);
    if (include && start != null && end != null) entries.push({
      file, start, end, kind: 'semantic', role, tag: node.tagName.toLowerCase(),
      name: node.getAttribute?.(attribute) || '',
    });
  }
}

function declarationNameRole(node) {
  const tag = node.tagName.toLowerCase();
  if (tag === 'ir-export-main') return 'function';
  if (tag !== 'ir-let' && tag !== 'ir-global') return '';
  if (node.dataset?.typeName?.startsWith('fun(')) return 'function';
  if (node.querySelector?.(':scope > ir-type-fn')) return 'function';
  if (tag === 'ir-global') return 'constant';
  return 'variable';
}

function domRangeEntry(node) {
  const file = node.dataset?.originFile || node.dataset?.file;
  const start = numberAttr(node, 'start');
  const end = numberAttr(node, 'end');
  if (!file || start == null || end == null) return null;

  return {
    file,
    start,
    end,
    kind: 'ir',
    id: node.id || node.dataset?.originId || '',
    tag: node.tagName.toLowerCase(),
    role: rangeRole(node),
    name: node.getAttribute?.('name') || '',
    bindingKind: node.dataset?.bindingKind || '',
    bindingName: node.dataset?.bindingName || '',
    literalKind: node.getAttribute?.('kind') || '',
    originId: node.dataset?.originId || '',
    rewriteOf: node.dataset?.rewriteOf || '',
    rewritePass: node.dataset?.rewritePass || '',
    rewriteKind: node.dataset?.rewriteKind || '',
  };
}

function rangeRole(node) {
  const tag = node.tagName.toLowerCase();
  if (tag === 'ir-fn-name') return 'function';
  if (tag === 'ir-type-ref' || tag === 'ir-type-nullable' || tag === 'ir-type-fn' || tag === 'ir-type-void') return 'type';
  if (tag === 'ir-lit') return literalRole(node.getAttribute?.('kind'));
  if (tag === 'ir-dsl') return 'attribute';
  if (tag === 'ir-null-ref') return 'constant.builtin';
  if (tag === 'ir-field-access') return 'property';
  if (tag === 'ir-ident') {
    const bindingKind = node.dataset?.bindingKind || '';
    if (bindingKind === 'ir-fn' || bindingKind === 'ir-extern-fn') return 'function';
    if (bindingKind === 'ir-global') return 'constant';
    return 'variable';
  }
  return '';
}

function literalRole(kind) {
  if (kind === 'string' || kind === 'string-multi') return 'string';
  if (kind === 'bool' || kind === 'null') return 'constant.builtin';
  return 'constant.numeric';
}

function collectSuspectedInvolvement(node, entries) {
  if (node.dataset?.errorSuspect !== 'true') return;
  const file = node.dataset?.originFile || node.dataset?.file;
  const start = numberAttr(node, 'start');
  const end = numberAttr(node, 'end');
  if (!file || start == null || end == null) return;
  const suspects = parseJsonArray(node.dataset.errorSuspects);
  entries.push({
    file,
    start,
    end,
    kind: 'diagnostic-suspect',
    id: `suspect:${node.id || node.dataset?.originId || ''}`,
    tag: node.tagName.toLowerCase(),
    role: 'diagnostic-suspect',
    message: suspects.map(item => item.label).filter(Boolean).join('; '),
    suspects,
  });
}

function collectDiagnosticEntries(diagnostics, entries) {
  for (let i = 0; i < diagnostics.length; i++) {
    const diagnostic = diagnostics[i];
    collectDiagnosticRef(entries, diagnostic?.primary, diagnostic, i, 'diagnostic');
    for (let j = 0; j < (diagnostic?.related ?? []).length; j++) {
      collectDiagnosticRef(entries, diagnostic.related[j], diagnostic, i, 'diagnostic-related', j);
    }
  }
}

function collectDiagnosticRef(entries, ref, diagnostic, i, kind, relatedIndex = -1) {
  if (!ref) return;
  const file = ref.file || ref.originFile;
  const start = numberValue(ref.start);
  const end = numberValue(ref.end);
  if (!file || start == null || end == null) return;

  entries.push({
    file,
    start,
    end,
    kind,
    id: relatedIndex >= 0 ? `diagnostic:${i}:related:${relatedIndex}` : (diagnostic.code ? `diagnostic:${diagnostic.code}:${i}` : `diagnostic:${i}`),
    severity: diagnostic.severity || 'error',
    code: diagnostic.code || '',
    message: relatedIndex >= 0 ? (ref.label || diagnostic.message || '') : (diagnostic.message || ''),
  });
}

function diagnosticFile(diagnostic) {
  return diagnostic?.primary?.file || diagnostic?.primary?.originFile || '';
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

function numberAttr(node, name) {
  const value = node.getAttribute?.(name) ?? node.dataset?.[name];
  return numberValue(value);
}

function numberValue(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
