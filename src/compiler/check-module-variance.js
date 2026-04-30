// check-module-variance.js — validate `in` / `out` module params
//
// Runs while parameterized modules still exist. It checks declared variance on
// module params against uses in function/protocol signatures and nested
// function types.

import { firstTypeChild } from './ir-helpers.js';
import { DIAGNOSTIC_KINDS, compilerError, related } from './diagnostics.js';

export function checkModuleVariance(doc) {
  const root = doc?.body?.firstChild;
  if (!root) return;

  for (const mod of [...root.querySelectorAll('ir-module')]) {
    const params = [...mod.querySelectorAll('ir-module-param[variance]')];
    if (!params.length) continue;

    const paramVariance = new Map(params.map(p => [p.getAttribute('name'), p.getAttribute('variance')]));
    for (const [name, variance] of paramVariance) {
      for (const site of signatureTypeSites(mod)) {
        visitType(site.typeNode, site.polarity, node => {
          if (node.localName !== 'ir-type-ref' || node.getAttribute('name') !== name) return;
          if (!isAllowed(variance, site.polarity)) {
            throw compilerError(
              DIAGNOSTIC_KINDS.MODULE_VARIANCE,
              `module variance (${mod.getAttribute('name')}.${name}): '${variance}' parameter used in ${site.polarity} position`,
              node,
              {
                module: mod.getAttribute('name'),
                variance,
                polarity: site.polarity,
                related: [related(params.find(p => p.getAttribute('name') === name), 'module parameter')],
              },
            );
          }
        });
      }
    }
  }
}

function* signatureTypeSites(mod) {
  for (const field of [...mod.querySelectorAll('ir-fn > ir-param-list > ir-param')]) {
    const typeNode = firstTypeChild(field);
    if (typeNode) yield { typeNode, polarity: 'in' };
  }

  for (const fn of [...mod.querySelectorAll('ir-fn')]) {
    const typeNode = fnReturnType(fn);
    if (typeNode) yield { typeNode, polarity: 'out' };
  }

  for (const getter of [...mod.querySelectorAll('ir-proto-get')]) {
    const typeNode = firstTypeChild(getter);
    if (typeNode) yield { typeNode, polarity: 'out' };
  }

  for (const setter of [...mod.querySelectorAll('ir-proto-set')]) {
    const typeNode = firstTypeChild(setter);
    if (typeNode) yield { typeNode, polarity: 'in' };
  }

  for (const pair of [...mod.querySelectorAll('ir-proto-get-set')]) {
    const typeNode = firstTypeChild(pair);
    if (typeNode) {
      yield { typeNode, polarity: 'in' };
      yield { typeNode, polarity: 'out' };
    }
  }

  for (const method of [...mod.querySelectorAll('ir-proto-method')]) {
    const children = [...method.children];
    for (const child of children.slice(0, -1)) yield { typeNode: child, polarity: 'in' };
    if (children.at(-1)) yield { typeNode: children.at(-1), polarity: 'out' };
  }
}

function visitType(node, polarity, visit) {
  if (!node) return;
  visit(node);

  if (node.localName === 'ir-type-fn') {
    const children = [...node.children];
    for (const child of children.slice(0, -1)) visitType(child, flip(polarity), visit);
    if (children.at(-1)) visitType(children.at(-1), polarity, visit);
    return;
  }

  for (const child of [...node.children]) {
    visitType(child, polarity, visit);
  }
}

function isAllowed(variance, polarity) {
  if (variance === 'out') return polarity === 'out';
  if (variance === 'in') return polarity === 'in';
  return true;
}

function flip(polarity) {
  return polarity === 'in' ? 'out' : 'in';
}

// Local return-type lookup keeps the legacy 'ir-unknown' fallback so this pass
// continues to flag mistyped returns even when the parser produces an unknown
// node.  ir-helpers.fnReturnType strips that branch deliberately (it's only
// useful pre-error-reporting).
function fnReturnType(fn) {
  return fn.querySelector(':scope > [ts-type=\"return_type\"], :scope > ir-type-ref, :scope > ir-type-void, :scope > ir-type-nullable, :scope > ir-type-fn, :scope > ir-type-inst, :scope > ir-type-self');
}
