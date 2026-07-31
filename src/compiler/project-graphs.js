// Compatibility projection. Canonical semantic facts live in retained graphs.

import { projectTypeGraph } from './type-graph.js';
import { retainedGraphs } from './graph-store.js';

export function projectGraphs(doc) {
  const graphs = retainedGraphs(doc);
  for (const [id, declaration] of graphs.scope?.resolutions ?? []) {
    const use = graphs.program?.byId.get(id) ?? doc.getElementById(id);
    if (!use?.dataset) continue;
    use.dataset.bindingId = declaration.id;
    use.dataset.bindingOriginId = declaration.dataset.originId ?? declaration.id;
    use.dataset.bindingKind = declaration.localName;
    use.dataset.bindingName = declaration.getAttribute('name')
      ?? declaration.querySelector?.(':scope > ir-fn-name')?.getAttribute('name') ?? '';
  }
  if (graphs.types) {
    projectTypeGraph(graphs.types);
    for (const [node, slot] of graphs.types.slots) {
      if (!node.dataset) continue;
      if (slot.function) {
        node.dataset.fnId = slot.function.id;
        node.dataset.fnOriginId = slot.function.dataset.originId ?? slot.function.id;
        node.dataset.resolvedName = slot.function.getAttribute('name') ?? '';
        if (slot.resolution?.resolvedAs) node.dataset.resolvedAs = slot.resolution.resolvedAs;
        if (node.localName !== 'ir-call' && node.parentElement?.localName !== 'ir-call') {
          node.dataset.resolvedFnId = slot.function.id;
        }
      }
      if (!slot.field) continue;
      node.dataset.fieldIndex = String(slot.field.index);
      if (slot.field.declaration?.id) node.dataset.fieldDeclId = slot.field.declaration.id;
    }
  }
  const runtime = graphs.backend?.runtime;
  const root = doc.body.firstChild;
  if (root && runtime) {
    root.dataset.closureRuntime = JSON.stringify({
      new: runtime.closures.new,
      calls: runtime.closures.calls.map(call => call.field),
    });
    root.dataset.promiseRuntime = JSON.stringify(runtime.promises);
  }
  for (const { node, kind, message, data } of graphs.diagnostics?.facts.values() ?? []) {
    if (!node?.dataset) continue;
    node.dataset.error = node.dataset.errorKind = kind;
    node.dataset.errorMessage = message;
    if (Object.keys(data).length) node.dataset.errorData = JSON.stringify(data);
  }
  for (const [id, suspects] of graphs.diagnostics?.suspects ?? []) {
    const node = graphs.program?.byId.get(id) ?? doc.getElementById(id);
    if (!node?.dataset) continue;
    node.dataset.errorSuspect = 'true';
    node.dataset.errorSuspects = JSON.stringify(suspects);
  }
  return doc;
}
