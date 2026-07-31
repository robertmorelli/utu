// Declaration elaboration facts retained across destructive module lowering.

import { sourceId } from './ir-helpers.js';

export function buildElaborationGraph(doc) {
  const root = doc.body.firstChild;
  const nodes = new Map();
  const modules = new Map();
  const requests = new Map();
  const edges = [];
  const failures = [];
  const add = (node, kind = node.localName) => {
    if (node?.id && !nodes.has(node.id)) nodes.set(node.id, {
      id: node.id, node, kind, originId: sourceId(node), file: node.dataset.originFile ?? root?.dataset.file ?? '',
    });
    return node;
  };
  const edge = (kind, from, to, data = {}) => {
    add(from); add(to);
    edges.push({ kind, from: from?.id ?? null, to: to?.id ?? null, ...data });
  };
  const registerModule = (module, cause = null, kind = 'module') => {
    add(module, kind);
    const name = module.getAttribute('name');
    if (name && !modules.has(name)) modules.set(name, module);
    if (cause) edge(kind, cause, module, { name });
    for (const decl of module.querySelectorAll(':scope > [name]')) edge('contains', module, decl);
    for (const node of module.querySelectorAll('ir-using, ir-type-inst, ir-mod-call')) request(node);
    return module;
  };
  const request = node => {
    if (!node?.id) return null;
    let fact = requests.get(node.id);
    if (!fact) {
      const args = [...(node.querySelector(':scope > ir-type-args')?.children ?? [])];
      fact = {
        node, module: node.getAttribute('module') ?? node.firstElementChild?.getAttribute('name') ?? null,
        alias: node.getAttribute('alias') ?? null, args,
      };
      requests.set(node.id, fact);
      add(node, 'request');
    }
    return fact;
  };
  const resolve = (node, module) => {
    const fact = request(node);
    if (fact) fact.target = module;
    edge('resolves', node, module, { module: fact?.module });
    return module;
  };
  const fail = (node, kind, message, data = {}) => {
    const failure = { node, kind, message, data };
    failures.push(failure);
    return failure;
  };

  for (const module of root?.querySelectorAll(':scope > ir-module') ?? []) registerModule(module);
  for (const node of root?.querySelectorAll('ir-using, ir-type-inst, ir-mod-call') ?? []) request(node);
  return { kind: 'elaboration', nodes, modules, requests, edges, failures, add, edge, fail, request, resolve, registerModule };
}
