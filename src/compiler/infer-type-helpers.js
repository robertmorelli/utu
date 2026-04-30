// infer-type-helpers.js — shared type inference helpers

import { typeNodeToStr, fnReturnType } from './ir-helpers.js';
export { unifyTypes } from './type-rules.js';

export function collectLiteralDefaults(root) {
  const map = new Map();
  for (const block of root.querySelectorAll('ir-literal-defaults')) {
    for (const entry of block.querySelectorAll(':scope > ir-default')) {
      const kind = entry.getAttribute('kind');
      const type = entry.getAttribute('type');
      if (kind && type) map.set(kind, type);
    }
  }
  return map;
}


// Type of a binding node (ir-param, ir-let, ir-global, ir-self-param)
export function bindingType(node) {
  if (!node) return null;
  switch (node.localName) {
    case 'ir-param':
    case 'ir-let':
    case 'ir-global': {
      // First child that is a type node
      for (const child of node.children) {
        const t = typeNodeToStr(child);
        if (t) return t;
      }
      return null;
    }
    case 'ir-self-param': {
      // Type is the receiver of the enclosing ir-fn
      const fn = node.closest('ir-fn');
      if (!fn) return null;
      const fnName = fn.querySelector(':scope > ir-fn-name');
      const recv   = fnName?.getAttribute('receiver');
      return recv ?? null;
    }
    case 'ir-fn':
    case 'ir-extern-fn':
      return fnReturnType(node);
    case 'ir-capture':
      return captureType(node);
    case 'ir-alt-arm':
      return node.getAttribute('variant') ?? null;
    case 'ir-promote': {
      const scrutineeType = node.firstElementChild?.dataset.type ?? '';
      return scrutineeType.startsWith('?') ? scrutineeType.slice(1) : scrutineeType;
    }
    default:
      return null;
  }
}


function captureType(node) {
  const forNode = node.closest('ir-for');
  const source = forNode?.querySelector(':scope > ir-for-source');
  return source?.firstElementChild?.dataset.type
    ?? source?.lastElementChild?.dataset.type
    ?? null;
}
