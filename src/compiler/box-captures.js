// box-captures.js — shared cells for captured variables that are reassigned
//
// Closures copy scalars and references into their environment when they are
// created. That is only observable when the variable is assigned after the
// closure could have captured it: inside any closure, later in the enclosing
// scope, or in a loop enclosing the closure. Exactly those variables become a
// one-field struct cell (`x` → `x.value`), which every closure then shares.
// Variables that are never reassigned after capture stay plain locals.

import { createSyntheticNode, paramsOf, bodyOf } from './ir-helpers.js';
import { buildTypeRef } from './standard-dsls.js';

const LOOPS = new Set(['ir-while', 'ir-for']);

/** @returns {boolean} whether any variable was boxed */
export function boxMutatedCaptures(doc, scopeGraph, typeGraph) {
  const root = doc.body.firstChild;
  const closures = [...(root?.querySelectorAll('ir-closure') ?? [])];
  if (!closures.length) return false;
  const resolve = ident => scopeGraph.resolutions.get(ident.id) ?? null;
  const order = new Map([...root.querySelectorAll('*')].map((node, i) => [node, i]));

  const captures = new Map(); // declaration -> closures capturing it
  for (const closure of closures) {
    for (const ident of closure.querySelectorAll('ir-ident')) {
      const decl = resolve(ident);
      if (!decl || !['ir-let', 'ir-param'].includes(decl.localName) || closure.contains(decl)) continue;
      if (!captures.has(decl)) captures.set(decl, new Set());
      captures.get(decl).add(closure);
    }
  }
  const references = new Map(); // declaration -> identifiers naming it
  const writes = new Map();     // declaration -> assignments to it
  for (const ident of root.querySelectorAll('ir-ident')) {
    const decl = resolve(ident);
    if (!captures.has(decl)) continue;
    if (!references.has(decl)) references.set(decl, []);
    references.get(decl).push(ident);
    const parent = ident.parentElement;
    if (parent?.localName === 'ir-assign' && parent.firstElementChild === ident) {
      if (!writes.has(decl)) writes.set(decl, []);
      writes.get(decl).push(parent);
    }
  }
  const afterCapture = (decl, write) => [...captures.get(decl)].some(closure =>
    closures.some(c => c.contains(write) && !c.contains(decl))
    || order.get(write) > order.get(closure)
    || sharedLoop(closure, write, decl));
  const recursive = decl => decl.localName === 'ir-let' && decl.lastElementChild?.localName === 'ir-closure'
    && [...captures.get(decl)].some(closure => decl.contains(closure));
  const boxed = [...captures.keys()].filter(decl => recursive(decl) || (writes.get(decl) ?? []).some(write => afterCapture(decl, write)));

  const cells = new Map();
  for (const decl of boxed) {
    const type = typeGraph.slots.get(decl)?.actual;
    if (!type || type === 'void' || type === 'unknown') continue;
    if (recursive(decl)) {
      boxRecursiveClosure(doc, root, cells, decl, type, references.get(decl));
      continue;
    }
    const cell = cellType(doc, root, cells, type, decl);
    const name = decl.localName === 'ir-let' ? decl.getAttribute('name') : boxParameter(doc, decl, cell);
    if (decl.localName === 'ir-let') {
      const value = decl.lastElementChild;
      if (decl.children.length > 1) decl.firstElementChild.replaceWith(buildTypeRef(doc, decl, cell));
      const init = cellInit(doc, decl, cell, null);
      value.replaceWith(init);
      init.firstElementChild.appendChild(value);
    }
    for (const ident of references.get(decl)) {
      const field = createSyntheticNode(doc, 'ir-field-access', ident, 'box-captures', 'cell-value');
      field.setAttribute('field', 'value');
      const ref = createSyntheticNode(doc, 'ir-ident', ident, 'box-captures', 'cell-ref');
      ref.setAttribute('name', name);
      ident.replaceWith(field);
      field.appendChild(ref);
    }
  }
  return cells.size > 0;
}

/**
 * `let tick = cl() { … tick … }` captures `tick` before it exists. The cell
 * starts empty, receives the closure right after, and every read asserts the
 * closure is present:
 *   let tick = Cell { value: null }; tick.value = cl() { … tick.value! … };
 */
function boxRecursiveClosure(doc, root, cells, decl, type, references) {
  const cell = cellType(doc, root, cells, `?${type}`, decl);
  const closure = decl.lastElementChild;
  const empty = createSyntheticNode(doc, 'ir-lit', decl, 'box-captures', 'cell-empty');
  empty.setAttribute('kind', 'null');
  empty.setAttribute('value', 'null');
  if (decl.children.length > 1) decl.firstElementChild.replaceWith(buildTypeRef(doc, decl, cell));
  const init = cellInit(doc, decl, cell, null);
  closure.replaceWith(init);
  init.firstElementChild.appendChild(empty);
  const store = createSyntheticNode(doc, 'ir-assign', decl, 'box-captures', 'cell-store');
  store.setAttribute('op', '=');
  store.append(cellValue(doc, decl, decl.getAttribute('name')), closure);
  decl.after(store);
  for (const ident of references) {
    const present = createSyntheticNode(doc, 'ir-ref-cast', ident, 'box-captures', 'cell-present');
    present.setAttribute('type-name', type);
    ident.replaceWith(present);
    present.appendChild(cellValue(doc, ident, decl.getAttribute('name')));
  }
}

function cellValue(doc, site, name) {
  const field = createSyntheticNode(doc, 'ir-field-access', site, 'box-captures', 'cell-value');
  field.setAttribute('field', 'value');
  const ref = createSyntheticNode(doc, 'ir-ident', site, 'box-captures', 'cell-ref');
  ref.setAttribute('name', name);
  field.appendChild(ref);
  return field;
}

/** A loop that encloses both, but not the declaration, runs the write after a capture. */
function sharedLoop(closure, write, decl) {
  for (let node = closure.parentElement; node; node = node.parentElement) {
    if (node.contains(decl)) return false;
    if (LOOPS.has(node.localName) && node.contains(write)) return true;
  }
  return false;
}

function cellType(doc, root, cells, type, site) {
  if (cells.has(type)) return cells.get(type);
  let name = `__Cell_${type.replace(/[^A-Za-z0-9]/g, '_')}`;
  while (root.querySelector(`:scope > ir-struct[name="${name}"]`)) name += '_';
  const struct = createSyntheticNode(doc, 'ir-struct', site, 'box-captures', 'cell-type');
  struct.setAttribute('name', name);
  const field = createSyntheticNode(doc, 'ir-field', site, 'box-captures', 'cell-field');
  field.setAttribute('name', 'value');
  field.appendChild(buildTypeRef(doc, site, type));
  struct.appendChild(field);
  root.insertBefore(struct, root.firstChild);
  cells.set(type, name);
  return name;
}

function cellInit(doc, site, cell, value) {
  const init = createSyntheticNode(doc, 'ir-struct-init', site, 'box-captures', 'cell-init');
  init.setAttribute('type-name', cell);
  const field = createSyntheticNode(doc, 'ir-field-init', site, 'box-captures', 'cell-init-value');
  field.setAttribute('field', 'value');
  if (value) field.appendChild(value);
  init.appendChild(field);
  return init;
}

/** A boxed parameter is copied into a fresh cell at the top of its function body. */
function boxParameter(doc, param, cell) {
  const owner = param.closest('ir-fn, ir-closure, ir-export-main');
  const body = bodyOf(owner);
  const name = `__cell_${param.getAttribute('name')}_${param.id}`;
  const binding = createSyntheticNode(doc, 'ir-let', param, 'box-captures', 'cell-parameter');
  binding.setAttribute('name', name);
  const value = createSyntheticNode(doc, 'ir-ident', param, 'box-captures', 'cell-parameter-value');
  value.setAttribute('name', param.getAttribute('name'));
  binding.appendChild(cellInit(doc, param, cell, value));
  body.insertBefore(binding, body.firstChild);
  if (!paramsOf(owner).includes(param)) throw new Error('box-captures: parameter outside its function');
  return name;
}
