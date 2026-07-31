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
    default: return null;
  }
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

/** Declared parameters of an ir-fn, ir-extern-fn, ir-export-main, or ir-closure. */
export function paramsOf(node) {
  return [...(node?.querySelectorAll(':scope > ir-param-list > ir-param') ?? [])];
}

/** The body block of a declaration, or null. */
export function bodyOf(node) {
  return node?.querySelector(':scope > ir-block') ?? null;
}

/** The `|self|` parameter of a method, or null. */
export function selfParamOf(node) {
  return node?.querySelector(':scope > ir-self-param') ?? null;
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
  const decl = doc.getElementById(callee.dataset.bindingId);
  return isFunctionDecl(decl) ? decl : null;
}

// ── Span / origin propagation ───────────────────────────────────────────────

/**
 * Copy source-span and origin-file metadata from `from` to `to`.  Used by
 * lowering passes that fabricate new IR nodes — without this, errors would
 * point at the wrong place (or worse, nowhere).
 */
const SPAN_KEYS = ['start', 'end', 'originFile', 'row', 'col', 'endRow', 'endCol', 'sourceFile'];

export function copySpan(to, from) {
  for (const key of SPAN_KEYS) {
    if (from?.dataset?.[key] != null) to.dataset[key] = from.dataset[key];
  }
  return to;
}

export function inheritSourceLoc(to, from) {
  return copySpan(to, from);
}

export function sourceId(node) {
  return node?.dataset?.originId ?? node?.id ?? '';
}

export function copyDiagnosticMeta(to, from) {
  copySpan(to, from);
  const originId = sourceId(from);
  if (originId) to.dataset.originId = originId;
  return to;
}

function stampRewrite(node, from, pass, kind) {
  copyDiagnosticMeta(node, from);
  node.dataset.synthetic = 'true';
  node.dataset.rewritePass = pass;
  if (kind) node.dataset.rewriteKind = kind;
  const source = sourceId(from);
  if (source) node.dataset.rewriteOf = source;
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
