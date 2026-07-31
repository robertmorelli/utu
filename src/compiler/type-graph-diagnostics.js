// Diagnostic reporting for a settled type graph. Constraint construction and
// solving live in type-graph.js; this module owns comparison output.

import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';

const SITE_LABEL = {
  binding: type => `declared type is ${type}`,
  assign: type => `assignment target is typed ${type}`,
  argument: type => `parameter expects ${type}`,
  field: type => `field is declared as ${type}`,
  return: type => `function return type is ${type}`,
};

/** Report expectation mismatches and failed transforms from a settled graph. */
export function reportTypeGraphDiagnostics(graph, operations) {
  const {
    actual, actualOrigin, collectFailures, compatible, edgeSource,
    planCoercions, valueForDiagnostic,
  } = operations;
  const ctx = { typeIndex: graph.typeIndex };
  planCoercions(graph);
  for (const edge of graph.expectations) {
    const expected = edge.read();
    const actualType = actual(graph, edge.value);
    if (!expected || !actualType || compatible(edge.mode, actualType, expected, ctx)) continue;

    const primary = valueForDiagnostic(edge.value);
    const label = edge.label?.(expected) ?? (SITE_LABEL[edge.site]?.(expected) ?? `expected ${expected}`);
    const origin = actualOrigin(graph, edge.value);
    const source = edgeSource(edge);
    const related = source ? [{ node: source, label }] : [];
    if (origin && origin !== primary && origin !== source) {
      related.push({ node: origin, label: `actual type ${actualType} comes from here` });
    }
    stampDiagnostic(primary, DIAGNOSTIC_KINDS.TYPE_MISMATCH,
      `Type mismatch: expected ${expected}, got ${actualType}`, {
        expected, actual: actualType, site: edge.site, relatedNodes: related,
      });
  }
  collectFailures(graph);
  for (const failure of graph.failures) {
    stampDiagnostic(failure.node, failure.kind, failure.message, failure.data);
  }
  return graph;
}
