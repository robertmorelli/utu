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
    knownType, planCoercions, valueForDiagnostic,
  } = operations;
  const display = text => text.replace(/Foreign\d+T\d+/g, name => graph.typeIndex.get(name)?.decl?.dataset.displayName ?? name);
  const ctx = { typeIndex: graph.typeIndex };
  planCoercions(graph);
  const reports = [];
  for (const edge of graph.expectations) {
    const expected = edge.read();
    const actualType = actual(graph, edge.value);
    if (!expected || !actualType || compatible(edge.mode, actualType, expected, ctx)) continue;
    // An unknown type is already its own diagnostic; comparing against it only adds noise.
    if (!knownType(graph, expected) || !knownType(graph, actualType)) continue;

    const primary = valueForDiagnostic(edge.value);
    const label = edge.label?.(expected) ?? (SITE_LABEL[edge.site]?.(expected) ?? `expected ${expected}`);
    const origin = actualOrigin(graph, edge.value);
    const source = edgeSource(edge);
    const related = source ? [{ node: source, label }] : [];
    if (origin && origin !== primary && origin !== source) {
      related.push({ node: origin, label: `actual type ${actualType} comes from here` });
    }
    reports.push({ node: primary, cause: edge.value, kind: DIAGNOSTIC_KINDS.TYPE_MISMATCH,
      message: display(`Type mismatch: expected ${expected}, got ${actualType}`),
      data: { expected, actual: actualType, site: edge.site, relatedNodes: related } });
  }
  collectFailures(graph);
  for (const failure of graph.failures) {
    reports.push({ node: failure.node, cause: failure.node, kind: failure.kind, message: display(failure.message), data: failure.data });
  }
  for (const { root, folded } of foldReports(graph, reports)) {
    const data = folded.length ? { ...root.data, folded: folded.length,
      relatedNodes: [...(root.data?.relatedNodes ?? []), ...folded.map(report => ({ node: report.node, label: report.message }))] } : root.data;
    stampDiagnostic(root.node, root.kind, folded.length ? `${root.message} (+${folded.length} caused by this)` : root.message, data);
  }
  return graph;
}

/**
 * Group diagnostics that share a cause. A report whose type was derived from
 * another report's node (through the solver's dependency edges) joins that
 * report's group; each group is reported once, at its upstream-most report,
 * with the others folded underneath.
 */
function foldReports(graph, reports) {
  const parent = reports.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const at = new Map();
  reports.forEach((report, i) => {
    for (const node of new Set([report.node, report.cause])) {
      if (!at.has(node)) at.set(node, []);
      at.get(node).push(i);
    }
  });
  const downstream = new Set();
  reports.forEach((report, i) => {
    // Everything this report's type was computed from.
    const seen = new Set([report.cause]), queue = [report.cause];
    for (let k = 0; k < queue.length && k < 4000; k++) {
      for (const dep of graph.slots.get(queue[k])?.rule?.deps ?? []) {
        if (seen.has(dep)) continue;
        seen.add(dep); queue.push(dep);
        for (const j of at.get(dep) ?? []) {
          if (j === i) continue;
          parent[find(i)] = find(j);
          downstream.add(i);
        }
      }
    }
  });
  const groups = new Map();
  reports.forEach((report, i) => {
    const key = find(i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  const position = i => Number(reports[i].node?.dataset?.start ?? Infinity);
  return [...groups.values()].map(members => {
    const causes = members.filter(i => !downstream.has(i));
    const rootIndex = (causes.length ? causes : members).sort((a, b) => position(a) - position(b))[0];
    return { root: reports[rootIndex], folded: members.filter(i => i !== rootIndex).map(i => reports[i]) };
  });
}
