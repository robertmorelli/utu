// Phase-local structural index. Semantic relationships remain in their own graphs.

import { bodyOf, typeNodeToStr } from './ir-helpers.js';
import { retainGraph } from './graph-store.js';

const REVISIONS = new WeakMap();

export function buildProgramIndex(doc) {
  const root = doc?.body?.firstChild;
  const all = root ? [root, ...root.querySelectorAll('*')] : [];
  const byId = new Map();
  const byKind = new Map();
  const byName = new Map();
  const byOrigin = new Map();
  for (const node of all) {
    if (node.id) byId.set(node.id, node);
    append(byKind, node.localName, node);
    const name = node.getAttribute?.('name');
    if (name) append(byName, name, node);
    const origin = node.dataset?.originId;
    if (origin) append(byOrigin, origin, node);
  }
  const functions = new Map(nodesOf({ byKind }, 'ir-fn', 'ir-extern-fn')
    .flatMap(node => functionIndexEntries(node)));
  const provenance = all.filter(node => node.dataset?.rewriteOf).map(node => ({
    node,
    sourceId: node.dataset.rewriteOf,
    source: byId.get(node.dataset.rewriteOf) ?? byOrigin.get(node.dataset.rewriteOf)?.[0] ?? null,
    pass: node.dataset.rewritePass ?? null,
    rewriteKind: node.dataset.rewriteKind ?? null,
  }));
  const surfaces = nodesOf({ byKind }, 'ir-fn', 'ir-export-main', 'ir-test', 'ir-bench')
    .flatMap(owner => surfaceBodies(owner).map(body => ({ owner, body })));
  return {
    kind: 'program', doc, revision: REVISIONS.get(doc) ?? 0,
    root, all, byId, byKind, byName, byOrigin, functions, surfaces, provenance,
  };
}

export function refreshProgramIndex(doc) {
  REVISIONS.set(doc, (REVISIONS.get(doc) ?? 0) + 1);
  return retainGraph(doc, 'program', buildProgramIndex(doc));
}

export function nodesOf(index, ...kinds) {
  return kinds.flatMap(kind => index?.byKind.get(kind) ?? []);
}

function surfaceBodies(owner) {
  if (owner.localName === 'ir-bench') {
    return [...owner.querySelectorAll(':scope > ir-block, :scope > ir-measure > ir-block')];
  }
  const body = bodyOf(owner);
  return body ? [body] : [];
}

function functionIndexEntries(node) {
  const entries = [[node.getAttribute('name'), node]];
  const name = node.querySelector(':scope > ir-fn-name');
  const implementation = name?.querySelector(':scope > ir-type-args')?.firstElementChild;
  const type = typeNodeToStr(implementation);
  const method = name?.getAttribute('name');
  if (type && method) entries.push([`${type}.${method}`, node]);
  return entries;
}

function append(index, key, value) {
  const values = index.get(key) ?? [];
  values.push(value);
  index.set(key, values);
}
