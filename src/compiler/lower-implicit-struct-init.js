// lower-implicit-struct-init.js — remove implicit struct init sugar
//
// Rewrites `&{ ... }` into an explicit `ir-struct-init[type="..."]` when the
// target type is explicitly available in the surrounding IR.

export function lowerImplicitStructInit(doc, { debugAssertions = false } = {}) {
  const root = doc?.body?.firstChild;
  if (!root) return;

  for (const init of [...root.querySelectorAll('ir-struct-init[implicit="true"]')]) {
    init.setAttribute('type', inferStructType(init));
    init.removeAttribute('implicit');
  }

  if (debugAssertions && root.querySelector('ir-struct-init[implicit="true"]')) {
    throw new Error('lower implicit struct init: found implicit struct init after lowering');
  }
}

function inferStructType(init) {
  const parent = init.parentNode;
  if (!parent) throw new Error('lower implicit struct init: missing parent node');

  const type =
    (parent.localName === 'ir-let' || parent.localName === 'ir-global') ? findDeclaredType(parent) :
    parent.localName === 'ir-return' ? findFnReturnType(findAncestor(parent, 'ir-fn')) :
    '';
  if (type) return type;

  throw new Error(`lower implicit struct init: cannot infer target type for implicit struct init under ${parent.localName}`);
}

function findDeclaredType(node) {
  return explicitTypeName(node?.querySelector(':scope > ir-type-ref, :scope > ir-type-qualified, :scope > ir-unknown[ts-type="return_type"]')) || '';
}

function findFnReturnType(fn) {
  return explicitTypeName(fn?.querySelector(':scope > ir-type-ref, :scope > ir-type-qualified, :scope > ir-unknown[ts-type="return_type"], :scope > ir-type-void')) || '';
}

function explicitTypeName(node) {
  if (!node) return '';
  if (node.localName === 'ir-type-ref' || node.localName === 'ir-type-qualified') {
    return node.getAttribute('name') || '';
  }
  if (node.localName === 'ir-type-void') {
    return 'void';
  }
  if (node.localName === 'ir-unknown' && node.getAttribute('ts-type') === 'return_type') {
    return node.getAttribute('raw') || '';
  }
  return '';
}

function findAncestor(node, localName) {
  let cur = node.parentNode;
  while (cur) {
    if (cur.localName === localName) return cur;
    cur = cur.parentNode;
  }
  return null;
}
