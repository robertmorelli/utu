import { nodeRef } from './diagnostics.js';
import { retainedGraphs } from './graph-store.js';

export function createExplainabilityArtifacts() {
  return {
    diagnostics: [],
    lowerings: [],
    sizes: [],
    profiles: [],
  };
}

export function pushDiagnostic(artifacts, diagnostic) {
  if (diagnostic) artifacts.diagnostics.push(diagnostic);
  return artifacts;
}

export function pushLowering(artifacts, kind, node, extra = {}) {
  artifacts.lowerings.push({
    kind,
    node: nodeRef(node),
    ...extra,
  });
  return artifacts;
}

export function pushSizeFact(artifacts, kind, bytes, node, extra = {}) {
  artifacts.sizes.push({
    kind,
    bytes,
    node: nodeRef(node),
    ...extra,
  });
  return artifacts;
}

export function pushProfileFact(artifacts, kind, node, extra = {}) {
  artifacts.profiles.push({
    kind,
    node: nodeRef(node),
    ...extra,
  });
  return artifacts;
}

export function explainNode(node) {
  return {
    ...nodeRef(node),
    typeName: node?.attr?.('data-type-name') ?? null,
    typeRepr: node?.attr?.('data-type-repr') ?? null,
    inferenceSource: node?.attr?.('data-inference-source') ?? null,
    expectedType: node?.attr?.('data-expect') ?? null,
    expectationSourceId: node?.attr?.('data-expect-from') ?? null,
    bindingId: node?.attr?.('data-binding-id') ?? null,
    bindingOriginId: node?.attr?.('data-binding-origin-id') ?? null,
    resolvesToId: node?.attr?.('data-resolves-to-id') ?? null,
    resolvesToOriginId: node?.attr?.('data-resolves-to-origin-id') ?? null,
    fnId: node?.attr?.('data-fn-id') ?? null,
    fnOriginId: node?.attr?.('data-fn-origin-id') ?? null,
    fieldIndex: node?.attr?.('data-field-index') ?? null,
    fieldDeclarationId: node?.attr?.('data-field-decl-id') ?? null,
  };
}

export function loweringTrace(node) {
  if (node?.nodeType !== 1) return [];
  const trace = [];
  const push = (label, value) => value && trace.push({ label, value });
  push('originId', node.attr('data-origin-id'));
  push('rewriteOf', node.attr('data-rewrite-of'));
  push('rewritePass', node.attr('data-rewrite-pass'));
  push('rewriteKind', node.attr('data-rewrite-kind'));
  push('importedFrom', node.attr('data-imported-from'));
  push('instantiatedFrom', node.attr('data-instantiated-from'));
  push('instantiatedAs', node.attr('data-instantiated-as'));
  const substitution = retainedGraphs(node.ownerDocument).elaboration?.edges
    .find(edge => edge.kind === 'substitutes' && edge.from === node.id);
  push('substitutedTypeParam', node.attr('data-substituted-type-param') ?? substitution?.parameter);
  push('substitutedFrom', node.attr('data-substituted-from') ?? substitution?.to);
  push('dslName', node.attr('data-dsl-name'));
  return trace;
}
