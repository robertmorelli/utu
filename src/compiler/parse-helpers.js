// parse-helpers.js — Shared helpers for parse phase 1
//
// Extracted to avoid circular imports between parse.js and its sub-modules.
// parse.js re-exports these; sub-modules import from here directly.

import { parseHTML } from 'linkedom';

// ── Node id counter ───────────────────────────────────────────────────────────

let _nodeId = 0;
export function resetNodeIds()  { _nodeId = 0; }
export function nextNodeId()    { return _nodeId++; }

/**
 * Re-stamp ids on every element in a cloned subtree so no ids collide with
 * nodes already in the document.
 */
export function restampSubtree(root, originFile) {
  const walk = (el) => {
    if (typeof el.setAttribute !== 'function') return;
    el.id = `n${_nodeId++}`;
    if (originFile) el.dataset.originFile = originFile;
    for (const child of el.children ?? []) walk(child);
  };
  walk(root);
}

// ── Document creation ─────────────────────────────────────────────────────────

export function createIRDocument() {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  return document;
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
  e.id            = `n${_nodeId++}`;
  e.dataset.start = n.startIndex;
  e.dataset.end   = n.endIndex;
  return e;
}

export function text(n) {
  return n.text ?? '';
}
