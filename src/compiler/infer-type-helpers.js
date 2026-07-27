// infer-type-helpers.js — shared type inference helpers

import { fnReturnType, fnSignatureType, declaredTypeStr } from './ir-helpers.js';
import { unwrapNullable } from './type-strings.js';
export { unifyTypes } from './type-rules.js';

export function collectLiteralDefaults(root) {
  const map = new Map();
  for (const block of root.querySelectorAll('ir-literal-defaults')) {
    for (const entry of block.querySelectorAll(':scope > ir-default')) {
      const kind = entry.getAttribute('kind');
      const type = entry.getAttribute('type-name');
      if (kind && type) map.set(kind, type);
    }
  }
  return map;
}

/**
 * kind → set of type names a literal of that kind may adopt from its context.
 * Declared by std/LiteralDefaults.utu; nominal, so types that merely share a
 * representation are not interchangeable.
 */
export function collectLiteralAdopters(root) {
  const map = new Map();
  for (const block of root.querySelectorAll('ir-literal-defaults')) {
    for (const entry of block.querySelectorAll(':scope > ir-default')) {
      const kind = entry.getAttribute('kind');
      const adopts = entry.getAttribute('adopts');
      if (kind && adopts) map.set(kind, new Set(adopts.split(/\s+/).filter(Boolean)));
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
    case 'ir-global':
      // Closure parameters may have no type annotation; inference fills their
      // type in from the closure's expected type and stamps it directly.
      return declaredTypeStr(node) ?? node.dataset?.['typeName'] ?? null;
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
      // A named function in value position is a function pointer.  Direct
      // calls do not come through here — infer-expr resolves `f(x)` from the
      // declaration itself — so this is only reached when the name is used as
      // a value.  The exception is an `@es` value import, which is a value
      // wearing a zero-arg function as its representation.
      return node.dataset?.valueAccessor === 'true'
        ? fnReturnType(node)
        : fnSignatureType(node);
    case 'ir-capture':
      return captureType(node);
    case 'ir-alt-arm':
      return node.getAttribute('variant') ?? null;
    case 'ir-promote': {
      const scrutineeType = node.firstElementChild?.dataset['typeName'] ?? '';
      return unwrapNullable(scrutineeType);
    }
    default:
      return null;
  }
}


function captureType(node) {
  const forNode = node.closest('ir-for');
  const source = forNode?.querySelector(':scope > ir-for-source');
  return source?.firstElementChild?.dataset['typeName']
    ?? source?.lastElementChild?.dataset['typeName']
    ?? null;
}
