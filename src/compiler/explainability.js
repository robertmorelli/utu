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
    typeName: node?.dataset?.typeName ?? null,
    typeRepr: node?.dataset?.typeRepr ?? null,
    inferenceSource: node?.dataset?.inferenceSource ?? null,
    expectedType: node?.dataset?.expect ?? null,
    expectationSourceId: node?.dataset?.expectFrom ?? null,
    bindingId: node?.dataset?.bindingId ?? null,
    bindingOriginId: node?.dataset?.bindingOriginId ?? null,
    resolvesToId: node?.dataset?.resolvesToId ?? null,
    resolvesToOriginId: node?.dataset?.resolvesToOriginId ?? null,
    fnId: node?.dataset?.fnId ?? null,
    fnOriginId: node?.dataset?.fnOriginId ?? null,
    fieldIndex: node?.dataset?.fieldIndex ?? null,
    fieldDeclarationId: node?.dataset?.fieldDeclId ?? null,
  };
}

export function loweringTrace(node) {
  if (!node?.dataset) return [];
  const trace = [];
  const push = (label, value) => value && trace.push({ label, value });
  push('originId', node.dataset.originId);
  push('rewriteOf', node.dataset.rewriteOf);
  push('rewritePass', node.dataset.rewritePass);
  push('rewriteKind', node.dataset.rewriteKind);
  push('importedFrom', node.dataset.importedFrom);
  push('instantiatedFrom', node.dataset.instantiatedFrom);
  push('instantiatedAs', node.dataset.instantiatedAs);
  const substitution = retainedGraphs(node.ownerDocument).elaboration?.edges
    .find(edge => edge.kind === 'substitutes' && edge.from === node.id);
  push('substitutedTypeParam', node.dataset.substitutedTypeParam ?? substitution?.parameter);
  push('substitutedFrom', node.dataset.substitutedFrom ?? substitution?.to);
  push('dslName', node.dataset.dslName);
  return trace;
}
