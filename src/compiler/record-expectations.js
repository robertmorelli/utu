// record-expectations.js — stamp the binding graph's expectation edges
//
// Phase 1 of docs/type-graph.md, made concrete. For every place a declared type
// reaches a value, this records on the value:
//
//   data-expect        the type its context requires
//   data-expect-from   the id of the declaration that required it
//   data-expect-site   which kind of context it was
//
// The edge is a *binding*, not a check — it says where the requirement came
// from. Comparing it against the node's own type is a separate phase, in
// validate-analysis.js, and only that comparison can fail.
//
// Recording it is what makes blame derivable. Previously each diagnostic site
// re-derived the expectation at the moment of failure and hand-wrote a
// `relatedNodes` entry pointing back at the declaration; five sites did this
// with five nearly-identical bodies, and blame quality was whatever each author
// remembered to include. Now the edge already exists and the message is read
// off it.

import { forEachTypeContext } from './type-contexts.js';
import { sourceId } from './ir-helpers.js';

/**
 * How each kind of context describes itself when it turns out to be the reason
 * for a mismatch. One table instead of a label written out at every site.
 */
const SITE_LABEL = {
  binding:  (type) => `declared type is ${type}`,
  assign:   (type) => `assignment target is typed ${type}`,
  argument: (type) => `parameter expects ${type}`,
  field:    (type) => `field is declared as ${type}`,
  return:   (type) => `function return type is ${type}`,
};

/** @param {Document} doc @param {Map<string, object>} typeIndex */
export function recordExpectations(doc, typeIndex) {
  const root = doc?.body?.firstChild;
  if (!root) return;

  forEachTypeContext(root, { typeIndex }, (value, declaredType, site, source) => {
    if (!value?.dataset) return;
    value.dataset.expect = declaredType;
    value.dataset.expectSite = site;
    const from = sourceId(source);
    if (from) value.dataset.expectFrom = source.id || from;
  });
}

/** The label a mismatch should carry for the context that caused it. */
export function expectationLabel(site, type) {
  return (SITE_LABEL[site] ?? ((t) => `expected ${t}`))(type);
}
