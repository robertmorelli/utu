import { nodeRef } from './diagnostics.js';

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
    bindingId: node?.dataset?.bindingId ?? null,
    bindingOriginId: node?.dataset?.bindingOriginId ?? null,
    resolvesToId: node?.dataset?.resolvesToId ?? null,
    resolvesToOriginId: node?.dataset?.resolvesToOriginId ?? null,
    fnId: node?.dataset?.fnId ?? null,
    fnOriginId: node?.dataset?.fnOriginId ?? null,
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
  push('substitutedTypeParam', node.dataset.substitutedTypeParam);
  push('dslName', node.dataset.dslName);
  return trace;
}
