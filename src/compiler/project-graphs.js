// Compatibility projection. Canonical semantic facts live in retained graphs.

import { projectTypeGraph } from './type-graph.js';
import { retainedGraphs } from './graph-store.js';
import { setData } from './ir-helpers.js';

export function projectGraphs(doc) {
  const graphs = retainedGraphs(doc);
  for (const [id, declaration] of graphs.scope?.resolutions ?? []) {
    const use = graphs.program?.byId.get(id) ?? doc.getElementById(id);
    if (use?.nodeType !== 1) continue;
    setData(use, 'data-binding-id', declaration.id);
    setData(use, 'data-binding-origin-id', declaration.getAttribute('data-origin-id') ?? declaration.id);
    setData(use, 'data-binding-kind', declaration.localName);
    setData(use, 'data-binding-name', declaration.getAttribute('name')
      ?? declaration.querySelector?.(':scope > ir-fn-name')?.getAttribute('name') ?? '');
  }
  if (graphs.types) {
    projectTypeGraph(graphs.types);
    for (const [node, slot] of graphs.types.slots) {
      if (node.nodeType !== 1) continue;
      if (slot.function) {
        setData(node, 'data-fn-id', slot.function.id);
        setData(node, 'data-fn-origin-id', slot.function.getAttribute('data-origin-id') ?? slot.function.id);
        setData(node, 'data-resolved-name', slot.function.getAttribute('name') ?? '');
        if (slot.resolution?.resolvedAs) setData(node, 'data-resolved-as', slot.resolution.resolvedAs);
        if (node.localName !== 'ir-call' && node.parentElement?.localName !== 'ir-call') {
          setData(node, 'data-resolved-fn-id', slot.function.id);
        }
      }
      if (!slot.field) continue;
      setData(node, 'data-field-index', String(slot.field.index));
      if (slot.field.declaration?.id) setData(node, 'data-field-decl-id', slot.field.declaration.id);
    }
  }
  const runtime = graphs.backend?.runtime;
  const root = doc.body.firstChild;
  if (root && runtime) {
    root.setAttribute('data-closure-runtime', JSON.stringify({
      new: runtime.closures.new,
      calls: runtime.closures.calls.map(call => call.field),
    }));
    root.setAttribute('data-promise-runtime', JSON.stringify(runtime.promises));
  }
  for (const { node, kind, message, data } of graphs.diagnostics?.facts.values() ?? []) {
    if (node?.nodeType !== 1) continue;
    node.setAttribute('data-error-kind', kind);
    node.setAttribute('data-error', kind);
    node.setAttribute('data-error-message', message);
    if (Object.keys(data).length) node.setAttribute('data-error-data', JSON.stringify(data));
  }
  for (const [id, suspects] of graphs.diagnostics?.suspects ?? []) {
    const node = graphs.program?.byId.get(id) ?? doc.getElementById(id);
    if (node?.nodeType !== 1) continue;
    node.setAttribute('data-error-suspect', 'true');
    node.setAttribute('data-error-suspects', JSON.stringify(suspects));
  }
  return doc;
}
