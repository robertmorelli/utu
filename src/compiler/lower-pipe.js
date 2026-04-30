// lower-pipe.js — remove pipe / lollipop syntax
//
// Rewrites `lhs |> target` into ordinary call IR.
// Works from structured ir-pipe-target (no re-parsing).

import { restampSubtree } from './parse.js';
import { createSyntheticNode, replaceNodeMeta } from './ir-helpers.js';

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

  const segs = [...tgt.querySelectorAll(':scope > ir-pipe-seg')];
  const args = [...tgt.querySelectorAll(':scope > ir-pipe-arg, :scope > ir-pipe-placeholder')];

  if (segs.length === 0) throw new Error('lower pipe: empty pipe target');

  // Clone helper — re-stamp ids to avoid collisions.
  const clone = (n) => { const c = n.cloneNode(true); restampSubtree(c, n.dataset.originFile); return c; };

  // Build callee from path segments.
  // Single segment: ir-ident or ir-type-ref depending on kind.
  // Multiple segments: ir-field-access chain (left to right).
  const callee = buildCallee(segs, doc);

  // Build arg-list in declared order, substituting the piped value at &.
  const argList = createSyntheticNode(doc, 'ir-arg-list', tgt, 'lower-pipe', 'pipe-args');
  if (!args.length) {
    argList.appendChild(clone(value));
  } else {
    for (const arg of args) {
      if (arg.localName === 'ir-pipe-placeholder') argList.appendChild(clone(value));
      else if (arg.firstElementChild) argList.appendChild(clone(arg.firstElementChild));
    }
  }

  const call = replaceNodeMeta(doc.createElement('ir-call'), pipe, 'lower-pipe', 'pipe-call');
  call.appendChild(callee);
  call.appendChild(argList);
  return call;
}

function buildCallee(segs, doc) {
  if (segs.length === 1) {
    const seg = segs[0];
    const node = createSyntheticNode(
      doc,
      seg.getAttribute('kind') === 'type' ? 'ir-type-ref' : 'ir-ident',
      seg,
      'lower-pipe',
      'pipe-callee-seg',
    );
    node.setAttribute('name', seg.getAttribute('name'));
    return node;
  }
  // Multiple segments: build field-access chain
  // e.g. a.b.c → ir-field-access[field="c"] { ir-field-access[field="b"] { ir-ident["a"] } }
  let base = buildCallee([segs[0]], doc);
  for (let i = 1; i < segs.length; i++) {
    const fa = createSyntheticNode(doc, 'ir-field-access', segs[i], 'lower-pipe', 'pipe-callee-field');
    fa.setAttribute('field', segs[i].getAttribute('name'));
    fa.appendChild(base);
    base = fa;
  }
  return base;
}
