// Phase-local structural index. Semantic relationships remain in their own graphs.

import { bodyOf, childrenOf, fnNameOf, typeArgsOf, typeNodeToStr } from './ir-helpers.js';
import { retainGraph } from './graph-store.js';

const REVISIONS = new WeakMap();

export function buildProgramIndex(doc) {
  const root = doc?.body?.firstChild;
  const all = [];
  const byId = new Map();
  const byKind = new Map();
  // Every element in document order, indexed by id and by kind as it is reached.
  const visit = node => {
    all.push(node);
    const id = node.getAttribute('id');
    if (id) byId.set(id, node);
    append(byKind, node.localName, node);
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) if (children[i].nodeType === 1) visit(children[i]);
  };
  if (root) visit(root);
  const functions = new Map(nodesOf({ byKind }, 'ir-fn', 'ir-extern-fn')
    .flatMap(node => functionIndexEntries(node)));
  const surfaces = nodesOf({ byKind }, 'ir-fn', 'ir-export-main', 'ir-test', 'ir-bench')
    .flatMap(owner => surfaceBodies(owner).map(body => ({ owner, body })));
  // Origins and provenance serve editor queries and graph views; build them on first use.
  let byOrigin, provenance;
  return {
    kind: 'program', doc, revision: REVISIONS.get(doc) ?? 0,
    root, all, byId, byKind, functions, surfaces,
    get byOrigin() {
      if (!byOrigin) {
        byOrigin = new Map();
        for (const node of all) {
          const origin = node.getAttribute('data-origin-id');
          if (origin) append(byOrigin, origin, node);
        }
      }
      return byOrigin;
    },
    get provenance() {
      return provenance ??= all.filter(node => node.getAttribute('data-rewrite-of')).map(node => ({
        node,
        sourceId: node.getAttribute('data-rewrite-of'),
        source: byId.get(node.getAttribute('data-rewrite-of')) ?? this.byOrigin.get(node.getAttribute('data-rewrite-of'))?.[0] ?? null,
        pass: node.getAttribute('data-rewrite-pass'),
        rewriteKind: node.getAttribute('data-rewrite-kind'),
      }));
    },
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
    // Its own blocks and its measure's, in document order.
    return [...owner.children].flatMap(child => child.localName === 'ir-block' ? [child]
      : child.localName === 'ir-measure' ? childrenOf(child, 'ir-block') : []);
  }
  const body = bodyOf(owner);
  return body ? [body] : [];
}

function functionIndexEntries(node) {
  const entries = [[node.getAttribute('name'), node]];
  const name = fnNameOf(node);
  const implementation = typeArgsOf(name)?.firstElementChild;
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
