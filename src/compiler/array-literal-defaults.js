// array-literal-defaults.js — default element types for unannotated array literals
//
// Generic modules are instantiated before types are known, so an unannotated
// `[1, 2]` cannot ask for `Array[I32]` later. Literal-only arrays have an
// obvious element type — the literal defaults, with a float making every
// number F64 — so they request that instance up front, as if the program had
// written `Array[I32]`. Arrays of other expressions still take their type
// from context.

import { createSyntheticNode } from './ir-helpers.js';

const KINDS = { int: 'I32', float: 'F64', string: 'Str', 'string-multi': 'Str', bool: 'Bool' };

/** The default element type of a literal-only array, or null. */
export function literalArrayElement(node) {
  const kinds = new Set([...node.children].map(child => child.localName === 'ir-lit' ? KINDS[child.getAttribute('kind')] : null));
  if (!kinds.size || kinds.has(undefined) || kinds.has(null)) return null;
  if (kinds.size === 1) return [...kinds][0];
  return [...kinds].every(kind => kind === 'I32' || kind === 'F64') ? 'F64' : null;
}

/**
 * Add inline `Array[T]` requests for literal-only arrays. Returns the holder,
 * which the caller removes once instantiation has produced the instances.
 */
export function requestLiteralArrayTypes(doc) {
  const root = doc.body.firstChild;
  const elements = new Set([...(root?.querySelectorAll('ir-array-lit') ?? [])].map(literalArrayElement).filter(Boolean));
  if (!elements.size) return null;
  const holder = createSyntheticNode(doc, 'ir-array-defaults', root, 'array-literal-defaults', 'holder');
  for (const element of elements) {
    const inst = createSyntheticNode(doc, 'ir-type-inst', root, 'array-literal-defaults', 'array-default');
    inst.setAttribute('module', 'Array');
    inst.setAttribute('raw', `Array[${element}]`);
    const args = createSyntheticNode(doc, 'ir-type-args', root, 'array-literal-defaults', 'array-default-args');
    const ref = createSyntheticNode(doc, 'ir-type-ref', root, 'array-literal-defaults', 'array-default-element');
    ref.setAttribute('name', element);
    args.appendChild(ref);
    inst.appendChild(args);
    holder.appendChild(inst);
  }
  root.appendChild(holder);
  return holder;
}
