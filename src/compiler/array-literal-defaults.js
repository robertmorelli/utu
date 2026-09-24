// array-literal-defaults.js — default element types for unannotated array literals
//
// Generic modules are instantiated before types are known, so an unannotated
// `[1, 2]` cannot ask for `Array[I32]` later. Literal-only arrays have an
// obvious element type — the literal defaults, with a float making every
// number F64 — so they request that instance up front, as if the program had
// written `Array[I32]`. Arrays of other expressions still take their type
// from context.

import { createSyntheticNode } from './ir-helpers.js';
import { buildTypeRef } from './standard-dsls.js';
import { unifyTypes, unwrapNullable } from './type-rules.js';

const NUMERIC = new Set(['I32', 'U32', 'I64', 'U64', 'F32', 'F64']);
const flexible = child => child.localName === 'ir-lit' && child.getAttribute('kind') === 'int' && !child.getAttribute('type-name');

/**
 * The element type an array literal's values agree on: integer literals join
 * any numeric type (`[x, 2]` with `x: F64`), `null` makes it nullable, and
 * literal-only arrays use the literal defaults.
 */
export function arrayElementType(node, actual) {
  const children = [...node.children];
  if (!children.length) return null;
  const fixed = children.filter(child => !flexible(child)).map(actual);
  if (fixed.some(type => !type)) return null;
  if (!fixed.length) return 'I32';
  const joined = fixed.reduce((type, next) => type === null ? null : unifyTypes(type, next), fixed[0]);
  if (!joined || joined === 'null') return null;
  if (children.some(flexible) && !NUMERIC.has(unwrapNullable(joined))) return null;
  return joined;
}

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
export function requestLiteralArrayTypes(doc, extra = []) {
  const root = doc.body.firstChild;
  const elements = new Set([...[...(root?.querySelectorAll('ir-array-lit') ?? [])].map(literalArrayElement), ...extra].filter(Boolean));
  if (!elements.size) return null;
  const holder = createSyntheticNode(doc, 'ir-array-defaults', root, 'array-literal-defaults', 'holder');
  for (const element of elements) {
    const inst = createSyntheticNode(doc, 'ir-type-inst', root, 'array-literal-defaults', 'array-default');
    inst.setAttribute('module', 'Array');
    inst.setAttribute('raw', `Array[${element}]`);
    const args = createSyntheticNode(doc, 'ir-type-args', root, 'array-literal-defaults', 'array-default-args');
    args.appendChild(buildTypeRef(doc, root, element));
    inst.appendChild(args);
    holder.appendChild(inst);
  }
  root.appendChild(holder);
  return holder;
}

/**
 * Element types of untyped array literals that have no `Array[T]` instance.
 * Instances are created before typing, so the compiler requests these and
 * compiles again. Host types are named per compilation, so they are requested
 * by declaration identity and named again by the next compilation.
 */
export function missingArrayElements(doc, graph) {
  const missing = new Map();
  const read = child => graph.slots.get(child)?.actual;
  for (const node of doc.querySelectorAll('ir-array-lit:not([type-name])')) {
    if (read(node) || node.closest('ir-array-defaults')) continue;
    const element = arrayElementType(node, read);
    if (!element) continue;
    const foreign = doc.__utuForeign?.values.get(unwrapNullable(element));
    const request = foreign ? { foreign, nullable: element.startsWith('?') } : element;
    missing.set(JSON.stringify(request), request);
  }
  return [...missing.values()];
}

/** Name each requested element type in this compilation. */
export function nameArrayElements(requests, abi) {
  return requests.map(request => typeof request === 'string' ? request
    : abi ? `${request.nullable ? '?' : ''}${abi.type(request.foreign.index, request.foreign.ref)}` : null).filter(Boolean);
}
