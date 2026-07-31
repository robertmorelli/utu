// check-module-variance.js — validate `in` / `out` module params
//
// Runs while parameterized modules still exist. It checks declared variance on
// module params against uses in function/protocol signatures and nested
// function types.

import { firstTypeChild } from './ir-helpers.js';
import { DIAGNOSTIC_KINDS, compilerError, related } from './diagnostics.js';
import { typeUses } from './declaration-graph.js';

export function checkModuleVariance(doc, graph = null) {
  const root = doc?.body?.firstChild;
  if (!root) return;

  for (const mod of graph?.modules.values() ?? root.querySelectorAll('ir-module')) {
    const params = [...mod.querySelectorAll('ir-module-param[variance]')];
    if (!params.length) continue;

    for (const param of params) {
      const name = param.getAttribute('name');
      const variance = param.getAttribute('variance');
      for (const site of signatureTypeSites(mod)) for (const use of typeUses(site.typeNode, site.polarity)) {
        if (use.node.localName !== 'ir-type-ref' || use.node.getAttribute('name') !== name) continue;
        graph?.edge('variance-use', param, use.node, { variance, polarity: use.polarity });
        if (!isAllowed(variance, use.polarity)) {
          const message = `module variance (${mod.getAttribute('name')}.${name}): '${variance}' parameter used in ${use.polarity} position`;
          graph?.fail(use.node, DIAGNOSTIC_KINDS.MODULE_VARIANCE, message, { variance, polarity: use.polarity });
          throw compilerError(DIAGNOSTIC_KINDS.MODULE_VARIANCE, message, use.node, {
            module: mod.getAttribute('name'), variance, polarity: use.polarity,
            related: [related(param, 'module parameter')],
          });
        }
      }
    }
  }
}

function* signatureTypeSites(mod) {
  for (const [selector, polarity] of [
    ['ir-fn > ir-param-list > ir-param', 'in'],
    ['ir-proto-get', 'out'],
    ['ir-proto-set', 'in'],
  ]) for (const node of mod.querySelectorAll(selector)) {
    const typeNode = firstTypeChild(node);
    if (typeNode) yield { typeNode, polarity };
  }
  for (const fn of mod.querySelectorAll('ir-fn')) {
    const typeNode = fnReturnType(fn);
    if (typeNode) yield { typeNode, polarity: 'out' };
  }
  for (const pair of mod.querySelectorAll('ir-proto-get-set')) {
    const typeNode = firstTypeChild(pair);
    if (typeNode) for (const polarity of ['in', 'out']) yield { typeNode, polarity };
  }
  for (const method of mod.querySelectorAll('ir-proto-method')) {
    const children = [...method.children];
    for (const child of children.slice(0, -1)) yield { typeNode: child, polarity: 'in' };
    if (children.at(-1)) yield { typeNode: children.at(-1), polarity: 'out' };
  }
}

function isAllowed(variance, polarity) {
  if (variance === 'out') return polarity === 'out';
  if (variance === 'in') return polarity === 'in';
  return true;
}


// Local return-type lookup keeps the legacy 'ir-unknown' fallback so this pass
// continues to flag mistyped returns even when the parser produces an unknown
// node.  ir-helpers.fnReturnType strips that branch deliberately (it's only
// useful pre-error-reporting).
function fnReturnType(fn) {
  return fn.querySelector(':scope > [ts-type=\"return_type\"], :scope > ir-type-ref, :scope > ir-type-void, :scope > ir-type-nullable, :scope > ir-type-fn, :scope > ir-type-inst, :scope > ir-type-self');
}
