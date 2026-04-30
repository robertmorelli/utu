// infer-types.js — Pass 7 driver

import { collectLiteralDefaults } from './infer-type-helpers.js';
import { inferBlock, inferExpr } from './infer-expr.js';

export { typeNodeToStr, fnReturnType } from './ir-helpers.js';

/**
 * @param {Document}          doc
 * @param {Map<string, Element>} typeIndex  from linkTypeDecls (pass 5)
 */
export function inferTypes(doc, typeIndex) {
  const root = doc.body.firstChild;
  if (!root) return;

  const fnIndex = new Map();
  for (const fn of root.querySelectorAll('ir-fn, ir-extern-fn')) {
    fnIndex.set(fn.getAttribute('name'), fn);
  }

  const literalDefaults = collectLiteralDefaults(root);
  const env = { doc, fnIndex, literalDefaults };

  for (const fn of root.querySelectorAll('ir-fn')) {
    const body = fn.querySelector(':scope > ir-block');
    if (body) inferBlock(body, env);
  }

  for (const g of root.querySelectorAll('ir-global')) {
    const init = g.lastElementChild;
    if (init) inferExpr(init, env);
  }
}
