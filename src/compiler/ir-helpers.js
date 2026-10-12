import { nextNodeId, restampSubtree } from './parse.js';
import { retainedGraphs } from './graph-store.js';

// ir-helpers.js — Shared helpers that operate on the post-parse IR DOM
//
// These read structure off already-built IR elements (ir-fn, ir-param,
// ir-type-ref, …).  Kept in one place so analysis, lowering, and codegen
// passes stay in agreement about what the IR shape means.
//
// Distinction from parse-helpers.js:
//   parse-helpers.js — operates on tree-sitter nodes (parse phase)
//   ir-helpers.js    — operates on IR DOM elements (everything afterwards)

// ── Type-node introspection ─────────────────────────────────────────────────

/**
 * Read the canonical type string off an ir-type-* element.
 * Returns null for any node that isn't a type.
 *
 *   <ir-type-ref name="I32"/>      → "I32"
 *   <ir-type-void/>                → "void"
 *   <ir-type-nullable><…/></…>     → "?<inner>"
 */
export function typeNodeToStr(typeNode) {
  if (!typeNode) return null;
  switch (typeNode.localName) {
    case 'ir-type-ref':    return typeNode.getAttribute('name');
    case 'ir-type-void':   return 'void';
    case 'ir-type-fn':
    case 'ir-type-cl': {
      // Parameters are real type nodes — parse-types.js splices the grammar's
      // `type_list` wrapper away so there is no raw string to re-parse here.
      const keyword = typeNode.localName === 'ir-type-cl' ? 'cl' : 'fun';
      const children = [...typeNode.children];
      const ret = children[children.length - 1];
      const params = children.slice(0, -1).map(typeNodeToStr).filter(Boolean);
      return `${keyword}(${params.join(', ')}) ${typeNodeToStr(ret) ?? 'void'}`;
    }
    case 'ir-type-nullable': {
      const inner = typeNodeToStr(typeNode.children[0]);
      return inner ? `?${inner}` : null;
    }
    case 'ir-type-tuple': {
      const parts = [...typeNode.children].map(typeNodeToStr);
      return parts.every(Boolean) ? `.{${parts.join(', ')}}` : null;
    }
    default: return null;
  }
}

/**
 * A type as written in source, including generic instantiations such as
 * `Array[Array[I32]]` and `?Array[I32]`, which `typeNodeToStr` leaves to the
 * instantiation pass. Syntactic lowerings (iterators, generators, @json,
 * @stored) run before that pass and print types with this.
 */
export function sourceTypeStr(typeNode) {
  if (!typeNode) return null;
  if (typeNode.localName === 'ir-type-nullable') {
    const inner = sourceTypeStr(typeNode.firstElementChild);
    return inner ? `?${inner}` : null;
  }
  if (typeNode.localName === 'ir-type-tuple') {
    const parts = [...typeNode.children].map(sourceTypeStr);
    return parts.every(Boolean) ? `.{${parts.join(', ')}}` : null;
  }
  if (typeNode.localName === 'ir-type-inst') {
    const args = [...(typeNode.querySelector(':scope > ir-type-args')?.children ?? [])].map(sourceTypeStr);
    if (!args.every(Boolean)) return typeNode.getAttribute('raw')?.replace(/\s+/g, '') ?? null;
    return `${typeNode.getAttribute('module')}[${args.join(', ')}]`;
  }
  return typeNodeToStr(typeNode) ?? typeNode.getAttribute('raw')?.replace(/\s+/g, '') ?? null;
}

/** First `ir-type-*` child of `node`, or null. */
export function firstTypeChild(node) {
  // Matched by prefix rather than by an explicit list of tags: the list has to
  // be extended every time a type form is added (it already missed `ir-type-cl`
  // once), and a second copy in standard-dsls.js had silently diverged to this
  // rule. Type nodes that `typeNodeToStr` cannot spell still yield null there,
  // so widening the match does not widen what counts as a declared type.
  for (const child of node?.children ?? []) {
    if (child.localName?.startsWith('ir-type-')) return child;
  }
  return null;
}

/** Declared type string of a binding-bearing node (ir-param, ir-let, ir-global). */
export function declaredTypeStr(node) {
  return typeNodeToStr(firstTypeChild(node));
}

/** Return type of an ir-fn as a string; defaults to 'void' when unannotated. */
export function fnReturnType(fn) {
  return declaredTypeStr(fn) ?? 'void';
}

/**
 * The `fun(...) R` type of an ir-fn / ir-extern-fn *used as a value*.
 *
 * A named function referenced without call parentheses is a function pointer,
 * which is the only way to produce a `fun` value — `fun` has no literal form.
 * Both node kinds share the shape (fn-name, param-list, return type), so one
 * reader covers them.
 */
export function fnSignatureType(fn) {
  const params = paramsOf(fn)
    .map(param => declaredTypeStr(param) ?? param.dataset?.['typeName'] ?? 'unknown');
  return `fun(${params.join(', ')}) ${fnReturnType(fn)}`;
}

// ── Structural accessors ────────────────────────────────────────────────────
//
// The same two `:scope >` selectors appeared a dozen times each. Naming them
// keeps the IR shape knowledge in one place: if a declaration ever gains a
// second block or a wrapped parameter list, one edit covers every reader.

// These run in the solver's inner loops, so they walk children directly
// instead of evaluating `:scope >` selectors.
const childNamed = (node, name) => {
  for (let child = node?.firstElementChild; child; child = child.nextElementSibling) {
    if (child.localName === name) return child;
  }
  return null;
};

/** Declared parameters of an ir-fn, ir-extern-fn, ir-export-main, or ir-closure. */
export function paramsOf(node) {
  const list = childNamed(node, 'ir-param-list');
  const params = [];
  for (let child = list?.firstElementChild; child; child = child.nextElementSibling) {
    if (child.localName === 'ir-param') params.push(child);
  }
  return params;
}

/** The body block of a declaration, or null. */
export function bodyOf(node) {
  return childNamed(node, 'ir-block');
}

/** The `|self|` parameter of a method, or null. */
export function selfParamOf(node) {
  return childNamed(node, 'ir-self-param');
}

/** Whether `node` is a function declaration — utu's own, or an `@es` import. */
export function isFunctionDecl(node) {
  return node?.localName === 'ir-fn' || node?.localName === 'ir-extern-fn';
}

/**
 * The function declaration an `ir-call` names directly, or null.
 *
 * Only covers a plain `ir-ident` callee: the type graph matches method and
 * static calls by receiver type, and calling a `fun`/`cl` value has no
 * declaration at all.
 */
export function directCalleeDecl(call, doc) {
  const callee = call?.firstElementChild;
  if (callee?.localName !== 'ir-ident' || !callee.dataset.bindingId) return null;
  const decl = elementById(doc, callee.dataset.bindingId);
  return isFunctionDecl(decl) ? decl : null;
}

const ID_CACHES = new WeakMap();

/**
 * `doc.getElementById(id)` without its cost: linkedom answers it by walking
 * the whole document. One walk fills a per-document map; a hit is used only
 * while the node is still in the document under that id, and a miss falls
 * back to the walk (and remembers the answer).
 */
export function elementById(doc, id) {
  let cache = ID_CACHES.get(doc);
  if (!cache) {
    cache = new Map();
    const root = doc?.body?.firstChild;
    for (const node of root ? [root, ...root.querySelectorAll('[id]')] : []) cache.set(node.id, node);
    ID_CACHES.set(doc, cache);
  }
  const hit = cache.get(id);
  if (hit && hit.id === id && hit.isConnected && hit.ownerDocument === doc) return hit;
  const found = doc.getElementById(id);
  if (found) cache.set(id, found);
  return found;
}

// ── Span / origin propagation ───────────────────────────────────────────────

/**
 * Copy source-span and origin-file metadata from `from` to `to`.  Used by
 * lowering passes that fabricate new IR nodes — without this, errors would
 * point at the wrong place (or worse, nowhere).
 */
// These run for every synthesized node, so they use attribute names directly:
// linkedom's `dataset` converts camelCase names through a regex on each access.
const SPAN_ATTRIBUTES = ['data-start', 'data-end', 'data-origin-file', 'data-row', 'data-col',
  'data-end-row', 'data-end-col', 'data-source-file'];

export function copySpan(to, from) {
  if (!from?.getAttribute) return to;
  for (const name of SPAN_ATTRIBUTES) {
    const value = from.getAttribute(name);
    if (value != null) to.setAttribute(name, value);
  }
  return to;
}

export function sourceId(node) {
  return node?.getAttribute?.('data-origin-id') ?? node?.id ?? '';
}

export function copyDiagnosticMeta(to, from) {
  copySpan(to, from);
  const originId = sourceId(from);
  if (originId) to.setAttribute('data-origin-id', originId);
  return to;
}

function stampRewrite(node, from, pass, kind) {
  copyDiagnosticMeta(node, from);
  node.setAttribute('data-synthetic', 'true');
  node.setAttribute('data-rewrite-pass', pass);
  if (kind) node.setAttribute('data-rewrite-kind', kind);
  const source = sourceId(from);
  if (source) node.setAttribute('data-rewrite-of', source);
  return node;
}

export function replaceNodeMeta(to, from, pass, kind = '') {
  to.id = from?.id ?? `n${nextNodeId(to.ownerDocument)}`;
  return stampRewrite(to, from, pass, kind);
}

const GRAPH_FACT_KEYS = [
  'typeName', 'expect', 'expectFrom', 'expectSite', 'fnId', 'fnOriginId',
  'resolvedName', 'resolvedAs', 'fieldIndex', 'fieldDeclId',
  'error', 'errorKind', 'errorMessage', 'errorData',
];

export function inheritGraphFacts(to, from) {
  for (const key of GRAPH_FACT_KEYS) {
    if (from?.dataset?.[key] != null) to.dataset[key] = from.dataset[key];
  }
  const facts = retainedGraphs(from?.ownerDocument).diagnostics?.facts;
  const diagnostic = facts?.get(from?.id);
  if (diagnostic) {
    facts.delete(from.id);
    facts.set(to.id, { ...diagnostic, node: to });
  }
  return to;
}

export function replaceTypedNode(from, to) {
  inheritGraphFacts(to, from);
  from.replaceWith(to);
  return to;
}

export function cloneGraphSubtree(node) {
  const clone = node.cloneNode(true);
  const originals = [node, ...node.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  restampSubtree(clone, node.dataset.originFile);
  const graphs = retainedGraphs(node.ownerDocument);
  originals.forEach((original, index) => {
    const copy = copies[index];
    const declaration = graphs.scope?.resolutions.get(original.id);
    if (declaration) graphs.scope.resolutions.set(copy.id, declaration);
    const diagnostic = graphs.diagnostics?.facts.get(original.id);
    if (diagnostic) graphs.diagnostics.facts.set(copy.id, { ...diagnostic, node: copy });
  });
  return clone;
}

export function createSyntheticNode(doc, tag, from, pass, kind = '') {
  const node = doc.createElement(tag);
  node.id = `n${nextNodeId(doc)}`;
  return stampRewrite(node, from, pass, kind);
}

export function stampOriginFile(root, originFile) {
  if (!root || !originFile) return root;
  for (const node of [root, ...root.querySelectorAll('*')]) {
    node.dataset.originFile ??= originFile;
    node.dataset.sourceFile ??= originFile;
  }
  return root;
}



export function stampType(node, type, source = '') {
  if (!node || !type) return node;
  node.dataset['typeName'] = type;
  if (source) node.dataset['inferenceSource'] = source;
  return node;
}
