import { nextNodeId } from './parse.js';

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
 *   <ir-type-ref name="i32"/>      → "i32"
 *   <ir-type-void/>                → "void"
 *   <ir-type-nullable><…/></…>     → "?<inner>"
 */
export function typeNodeToStr(typeNode) {
  if (!typeNode) return null;
  switch (typeNode.localName) {
    case 'ir-type-ref':    return typeNode.getAttribute('name');
    case 'ir-type-void':   return 'void';
    case 'ir-type-fn': {
      const children = [...typeNode.children];
      const ret = children[children.length - 1];
      const rawList = children[0]?.localName === 'ir-unknown' && children[0].getAttribute('ts-type') === 'type_list'
        ? children[0].getAttribute('raw')
        : null;
      const params = rawList
        ? rawList.split(',').map(part => part.trim()).filter(Boolean)
        : children.slice(0, -1).map(typeNodeToStr).filter(Boolean);
      return `fun(${params.join(', ')}) ${typeNodeToStr(ret) ?? 'void'}`;
    }
    case 'ir-type-nullable': {
      const inner = typeNodeToStr(typeNode.children[0]);
      return inner ? `?${inner}` : null;
    }
    default: return null;
  }
}

/**
 * The first child of `node` whose tag begins with `ir-type-`, or null.
 * Used to read the declared type off ir-param, ir-let, ir-global, etc.
 */
export function firstTypeChild(node) {
  if (!node) return null;
  for (const child of node.children) {
    if (child.localName?.startsWith('ir-type-')) return child;
  }
  return null;
}

/**
 * Return type of an ir-fn, as a string.  The return type is the first child
 * that isn't fn-name / self-param / param-list / block.  Defaults to 'void'
 * when no annotation is present.
 */
export function fnReturnType(fn) {
  for (const child of fn.children) {
    const tag = child.localName;
    if (tag === 'ir-fn-name' || tag === 'ir-self-param' ||
        tag === 'ir-param-list' || tag === 'ir-block') continue;
    const t = typeNodeToStr(child);
    if (t) return t;
  }
  return 'void';
}

// ── Span / origin propagation ───────────────────────────────────────────────

/**
 * Copy source-span and origin-file metadata from `from` to `to`.  Used by
 * lowering passes that fabricate new IR nodes — without this, errors would
 * point at the wrong place (or worse, nowhere).
 */
export function copySpan(to, from) {
  if (!from?.dataset) return to;
  if (from.dataset.start      != null) to.dataset.start      = from.dataset.start;
  if (from.dataset.end        != null) to.dataset.end        = from.dataset.end;
  if (from.dataset.originFile != null) to.dataset.originFile = from.dataset.originFile;
  if (from.dataset.row        != null) to.dataset.row        = from.dataset.row;
  if (from.dataset.col        != null) to.dataset.col        = from.dataset.col;
  if (from.dataset.endRow     != null) to.dataset.endRow     = from.dataset.endRow;
  if (from.dataset.endCol     != null) to.dataset.endCol     = from.dataset.endCol;
  if (from.dataset.sourceFile != null) to.dataset.sourceFile = from.dataset.sourceFile;
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

export function replaceNodeMeta(to, from, pass, kind = '') {
  to.id = from?.id ?? `n${nextNodeId()}`;
  copyDiagnosticMeta(to, from);
  to.dataset.synthetic = 'true';
  to.dataset.rewritePass = pass;
  if (kind) to.dataset.rewriteKind = kind;
  const rewriteOf = sourceId(from);
  if (rewriteOf) to.dataset.rewriteOf = rewriteOf;
  return to;
}

export function createSyntheticNode(doc, tag, from, pass, kind = '') {
  const node = doc.createElement(tag);
  node.id = `n${nextNodeId()}`;
  copyDiagnosticMeta(node, from);
  node.dataset.synthetic = 'true';
  node.dataset.rewritePass = pass;
  if (kind) node.dataset.rewriteKind = kind;
  const rewriteOf = sourceId(from);
  if (rewriteOf) node.dataset.rewriteOf = rewriteOf;
  return node;
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
  node.dataset.type = type;
  if (source) node.dataset.typeSource = source;
  return node;
}
