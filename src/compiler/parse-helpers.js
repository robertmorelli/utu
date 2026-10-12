// parse-helpers.js — Shared helpers for parse phase 1
//
// Extracted to avoid circular imports between parse.js and its sub-modules.
// parse.js re-exports these; sub-modules import from here directly.

import { createIRDocument as createDocument } from './ir-document.js';

// ── Document-local node ids ──────────────────────────────────────────────────

// Compilation is asynchronous and callers may run more than one compiler at a
// time. Identity therefore belongs to an IR document, never to this module.
const NODE_IDS = new WeakMap();
let legacyNodeId = 0;

export function resetNodeIds(doc = null) {
  if (doc) NODE_IDS.set(doc, 0);
  else legacyNodeId = 0; // compatibility for callers using nextNodeId() directly
}

export function nextNodeId(doc = null) {
  if (!doc) return legacyNodeId++;
  const id = NODE_IDS.get(doc) ?? 0;
  NODE_IDS.set(doc, id + 1);
  return id;
}

/**
 * Re-stamp ids on every element in a cloned subtree so no ids collide with
 * nodes already in the document.
 */
export function restampSubtree(root, originFile, destinationDoc = root?.ownerDocument) {
  if (typeof root?.setAttribute !== 'function') return;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (!el.attr('data-origin-id') && el.id) el.setAttribute('data-origin-id', el.id);
    el.id = `n${nextNodeId(destinationDoc)}`;
    if (originFile) {
      el.setAttribute('data-origin-file', originFile);
      if (el.getAttribute('data-source-file') === null) el.setAttribute('data-source-file', originFile);
    }
  }
}

// ── Document creation ─────────────────────────────────────────────────────────

export function createIRDocument() {
  return createDocument();
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

export function el(tag, doc) {
  return doc.createElement(tag);
}

export function namedChildren(n) {
  return n.namedChildren ?? [];
}

// Walk all named children of `n`, calling dispatch on each.
export function walkChildren(n, doc, source, dispatch, predicate) {
  const out = [];
  for (const child of namedChildren(n)) {
    if (predicate && !predicate(child)) continue;
    const ir = dispatch(child, doc, source);
    if (ir) out.push(ir);
  }
  return out;
}

export function append(parent, children) {
  for (const c of children) parent.appendChild(c);
  return parent;
}

// Stamp source span and assign a document-unique numeric id on every IR node.
export function stamp(e, n) {
  const id = `n${nextNodeId(e.ownerDocument)}`;
  e.setLowercaseAttribute('id', id);
  e.setLowercaseAttribute('data-origin-id', id);
  e.setLowercaseAttribute('data-start', n.startIndex);
  e.setLowercaseAttribute('data-end', n.endIndex);
  const start = n.startPosition;
  const end = n.endPosition;
  e.setLowercaseAttribute('data-row', String(start.row + 1));
  e.setLowercaseAttribute('data-col', String(start.column + 1));
  e.setLowercaseAttribute('data-end-row', String(end.row + 1));
  e.setLowercaseAttribute('data-end-col', String(end.column + 1));
  const sourceFile = e.ownerDocument?.__utuSourceFile;
  if (sourceFile) {
    e.setLowercaseAttribute('data-source-file', sourceFile);
    e.setLowercaseAttribute('data-origin-file', sourceFile);
  }
  return e;
}

export function text(n) {
  return n.text ?? '';
}
