// lower-pipe.js — remove pipe / lollipop syntax
//
// Rewrites `lhs -o target` into ordinary call IR.
// Works from structured ir-pipe-target (no re-parsing).

import { restampSubtree } from './parse.js';

export function lowerPipe(doc, { debugAssertions = false } = {}) {
  const root = doc?.body?.firstChild;
  if (!root) return;

  for (const pipe of [...root.querySelectorAll('ir-pipe')].reverse()) {
    pipe.replaceWith(lowerOnePipe(pipe));
  }

  if (debugAssertions && root.querySelector('ir-pipe')) {
    throw new Error('lower pipe: found ir-pipe after lowering');
  }
}

function lowerOnePipe(pipe) {
  const doc   = pipe.ownerDocument;
  const value = pipe.firstElementChild;
  const tgt   = pipe.querySelector(':scope > ir-pipe-target');
  if (!value || !tgt) throw new Error('lower pipe: malformed ir-pipe');

  const segs        = [...tgt.querySelectorAll(':scope > ir-pipe-seg')];
  const extraArgs   = [...tgt.querySelectorAll(':scope > ir-pipe-arg')];
  const placeholder = tgt.querySelector(':scope > ir-pipe-placeholder');

  if (segs.length === 0) throw new Error('lower pipe: empty pipe target');

  // Clone helper — re-stamp ids to avoid collisions.
  const clone = (n) => { const c = n.cloneNode(true); restampSubtree(c); return c; };

  // Build callee from path segments.
  // Single segment: ir-ident or ir-type-ref depending on kind.
  // Multiple segments: ir-field-access chain (left to right).
  const callee = buildCallee(segs, doc);

  // Build arg-list: placeholder or prepend
  const argList = doc.createElement('ir-arg-list');
  copySpan(argList, tgt);
  if (placeholder) {
    // Replace placeholder position with value; extras go in order
    for (const a of extraArgs) {
      const child = a.firstElementChild;
      if (child) argList.appendChild(clone(child));
    }
    // placeholder means value goes in that position — for simplicity, prepend
    argList.insertBefore(clone(value), argList.firstChild);
  } else {
    // no placeholder: value is first arg
    argList.appendChild(clone(value));
    for (const a of extraArgs) {
      const child = a.firstElementChild;
      if (child) argList.appendChild(clone(child));
    }
  }

  const call = doc.createElement('ir-call');
  copySpan(call, pipe);
  call.appendChild(callee);
  call.appendChild(argList);
  return call;
}

function buildCallee(segs, doc) {
  if (segs.length === 1) {
    const seg = segs[0];
    const node = seg.getAttribute('kind') === 'type'
      ? doc.createElement('ir-type-ref')
      : doc.createElement('ir-ident');
    node.setAttribute('name', seg.getAttribute('name'));
    copySpan(node, seg);
    return node;
  }
  // Multiple segments: build field-access chain
  // e.g. a.b.c → ir-field-access[field="c"] { ir-field-access[field="b"] { ir-ident["a"] } }
  let base = buildCallee([segs[0]], doc);
  for (let i = 1; i < segs.length; i++) {
    const fa = doc.createElement('ir-field-access');
    fa.setAttribute('field', segs[i].getAttribute('name'));
    copySpan(fa, segs[i]);
    fa.appendChild(base);
    base = fa;
  }
  return base;
}

function copySpan(to, from) {
  if (from.dataset.start != null) to.dataset.start = from.dataset.start;
  if (from.dataset.end   != null) to.dataset.end   = from.dataset.end;
}
