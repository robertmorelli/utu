import { cloneGraphSubtree, createSyntheticNode, replaceTypedNode } from './ir-helpers.js';

import { typeEntryDecl } from './link-type-decls.js';
import { unwrapNullable } from './type-strings.js';

export function lowerBackendControl(doc, typeIndex, { target = 'normal' } = {}) {
  if (target === 'analysis') return false;
  const root = doc.body.firstChild;
  if (!root) return false;
  let changed = false;

  // Parents clone their arms, so lower descendants before replacing parents.
  // Use one traversal for both forms, including mixed alt/promote nesting.
  for (const node of [...root.querySelectorAll('ir-promote, ir-alt')].reverse()) {
    const lowered = node.localName === 'ir-promote'
      ? lowerPromote(node) : lowerAlt(node, typeIndex);
    if (lowered) { replaceTypedNode(node, lowered); changed = true; }
  }
  return changed;
}

function lowerAlt(alt, typeIndex) {
  const scrutinee = alt.firstElementChild;
  const arms = [...alt.querySelectorAll(':scope > ir-alt-arm')];
  const defaultArm = alt.querySelector(':scope > ir-default-arm');
  const scrutType = scrutinee?.attr?.('data-type-name') ?? '';
  if (!scrutinee || !scrutType || arms.length === 0) return null;

  const enumDecl = typeEntryDecl(typeIndex.get(scrutType));
  const block = lowerSubjectBlock(alt, scrutinee);
  let tail = defaultArm ? cloneBody(defaultArm) : null;
  let condition;
  if (enumDecl?.localName === 'ir-enum') {
    const tagType = enumTagType(enumDecl);
    const eqFn = alt.ownerDocument.body.firstChild?.querySelector(`:scope > ir-fn[name="${tagType}:eq"]`);
    const tag = makeFieldAccess(alt, makeBoundIdent(block.subjectLet, block.subjectName), '__tag', tagType);
    condition = arm => makeEqTest(alt, cloneNode(tag), tagValue(typeIndex, enumDecl, arm), tagType, eqFn);
  } else {
    condition = arm => makeRefTest(alt, block.subjectLet, block.subjectName, arm.getAttribute('variant'));
  }
  // Without a default arm the chain still needs a final else when the alt has
  // a value. An alt naming every variant of an enum is exhaustive (validation
  // checks this), so its last arm needs no test; any other case traps.
  let last = arms.length - 1;
  if (!defaultArm) {
    const variants = enumDecl?.localName === 'ir-enum' ? enumDecl.querySelectorAll(':scope > ir-variant').length : -1;
    const resultType = alt.attr('data-type-name');
    if (variants === new Set(arms.map(arm => arm.getAttribute('variant'))).size) {
      tail = lowerArmBody(alt, block.subjectLet, block.subjectName, arms[last--]);
    } else if (resultType && resultType !== 'void' && resultType !== 'never') {
      tail = wrapBody(alt, createSyntheticNode(alt.ownerDocument, 'ir-fatal', alt, 'lower-backend-control', 'alt-unmatched-fatal'));
    }
  }
  for (let i = last; i >= 0; i--) {
    const arm = arms[i];
    const body = lowerArmBody(alt, block.subjectLet, block.subjectName, arm);
    tail = makeIf(arm, condition(arm), body, tail);
  }
  if (tail) block.node.appendChild(tail);
  stampBlockType(block.node, alt, arms, defaultArm);
  return block.node;
}

function lowerPromote(node) {
  const scrutinee = node.firstElementChild;
  const thenArm = node.querySelector(':scope > ir-promote-arm');
  const defaultArm = node.querySelector(':scope > ir-default-arm');
  const scrutType = scrutinee?.attr?.('data-type-name') ?? '';
  if (!scrutinee || !thenArm) return null;
  if (!scrutType.startsWith('?')) {
    // Already diagnosed ("promote requires a nullable value"); keep the IR
    // well-formed by binding the value and taking the present arm.
    const block = lowerSubjectBlock(node, scrutinee);
    const body = wrapBody(node, cloneBody(thenArm));
    const binding = node.getAttribute('binding');
    if (binding && node.id) body.insertBefore(makeBindingLet(node, block.subjectLet, block.subjectName, binding, node.id, scrutType,
      makeBoundIdent(block.subjectLet, block.subjectName)), body.firstChild);
    block.node.appendChild(body);
    return block.node;
  }

  const block = lowerSubjectBlock(node, scrutinee);
  const thenBody = lowerPromoteBody(node, block.subjectLet, block.subjectName, thenArm);
  const elseBody = defaultArm ? wrapBody(node, cloneBody(defaultArm)) : null;
  const ifNode = createSyntheticNode(node.ownerDocument, 'ir-if', node, 'lower-backend-control', 'promote-if');
  ifNode.appendChild(makeRefIsNull(node, block.subjectLet, block.subjectName, scrutType));
  ifNode.appendChild(elseBody ?? wrapBody(node, createSyntheticNode(node.ownerDocument, 'ir-fatal', node, 'lower-backend-control', 'promote-null-fatal')));
  ifNode.appendChild(thenBody);
  block.node.appendChild(ifNode);
  if (node.attr('data-type-name')) block.node.setAttribute('data-type-name', node.attr('data-type-name'));
  return block.node;
}

function lowerPromoteBody(site, subjectLet, subjectName, arm) {
  const binding = site.getAttribute('binding');
  const scrutType = subjectLet.firstElementChild?.getAttribute('name') ?? '';
  const valueType = unwrapNullable(scrutType);
  const body = cloneBody(arm);
  if (!binding || !site.id) return wrapBody(site, body);

  const block = wrapBody(site, body);
  block.insertBefore(
    makeBindingLet(site, subjectLet, subjectName, binding, site.id, valueType, makeRefCast(site, subjectLet, subjectName, valueType)),
    block.firstChild,
  );
  return block;
}

function lowerArmBody(site, subjectLet, subjectName, arm) {
  const binding = arm.getAttribute('binding');
  const variant = arm.getAttribute('variant') ?? '';
  const body = cloneBody(arm);
  if (!binding || !arm.id) return wrapBody(site, body);

  const block = wrapBody(site, body);
  block.insertBefore(
    makeBindingLet(site, subjectLet, subjectName, binding, arm.id, variant, makeRefCast(site, subjectLet, subjectName, variant)),
    block.firstChild,
  );
  return block;
}

function lowerSubjectBlock(site, scrutinee) {
  const doc = site.ownerDocument;
  const node = createSyntheticNode(doc, 'ir-block', site, 'lower-backend-control', 'control-block');
  const subjectName = `__ctl_subj_${site.id || 'anon'}`;
  const subjectLet = createSyntheticNode(doc, 'ir-let', site, 'lower-backend-control', 'control-subject');
  const subjectType = createSyntheticNode(doc, 'ir-type-ref', site, 'lower-backend-control', 'control-subject-type');
  const scrutType = scrutinee.attr('data-type-name') ?? '';
  subjectLet.setAttribute('name', subjectName);
  subjectLet.setAttribute('data-type-name', scrutType);
  subjectType.setAttribute('name', scrutType);
  subjectLet.appendChild(subjectType);
  subjectLet.appendChild(cloneNode(scrutinee));
  node.appendChild(subjectLet);
  return { node, subjectLet, subjectName };
}

function makeBindingLet(site, subjectLet, subjectName, name, id, type, initExpr) {
  const doc = site.ownerDocument;
  const letNode = createSyntheticNode(doc, 'ir-let', site, 'lower-backend-control', 'binding-let');
  const typeNode = createSyntheticNode(doc, 'ir-type-ref', site, 'lower-backend-control', 'binding-type');
  letNode.id = id;
  letNode.setAttribute('data-origin-id', site.attr('data-origin-id') ?? id);
  letNode.setAttribute('name', name);
  letNode.setAttribute('data-type-name', type);
  typeNode.setAttribute('name', type);
  letNode.appendChild(typeNode);
  letNode.appendChild(initExpr);
  return letNode;
}

function makeRefTest(site, subjectLet, subjectName, variant) {
  const doc = site.ownerDocument;
  const test = createSyntheticNode(doc, 'ir-ref-test', site, 'lower-backend-control', 'ref-test');
  test.setAttribute('type-name', variant ?? '');
  test.setAttribute('data-type-name', 'Bool');
  test.appendChild(makeBoundIdent(subjectLet, subjectName));
  return test;
}

function makeRefIsNull(site, subjectLet, subjectName, scrutType) {
  const doc = site.ownerDocument;
  const test = createSyntheticNode(doc, 'ir-ref-is-null', site, 'lower-backend-control', 'ref-is-null');
  test.setAttribute('data-type-name', 'Bool');
  const ident = makeBoundIdent(subjectLet, subjectName);
  ident.setAttribute('data-type-name', scrutType);
  test.appendChild(ident);
  return test;
}

function makeRefCast(site, subjectLet, subjectName, type) {
  const doc = site.ownerDocument;
  const cast = createSyntheticNode(doc, 'ir-ref-cast', site, 'lower-backend-control', 'ref-cast');
  cast.setAttribute('type-name', type);
  cast.setAttribute('data-type-name', type);
  cast.appendChild(makeBoundIdent(subjectLet, subjectName));
  return cast;
}

function makeFieldAccess(site, recv, field, type) {
  const fieldNode = createSyntheticNode(site.ownerDocument, 'ir-field-access', site, 'lower-backend-control', 'field-access');
  fieldNode.setAttribute('field', field);
  fieldNode.setAttribute('data-type-name', type);
  fieldNode.appendChild(recv);
  return fieldNode;
}

function makeEqTest(site, lhs, rhsValue, tagType, eqFn) {
  const doc = site.ownerDocument;
  const call = createSyntheticNode(doc, 'ir-call', site, 'lower-backend-control', 'eq-test');
  const callee = createSyntheticNode(doc, 'ir-type-member', site, 'lower-backend-control', 'eq-type-member');
  const typeRef = createSyntheticNode(doc, 'ir-type-ref', site, 'lower-backend-control', 'eq-type');
  const args = createSyntheticNode(doc, 'ir-arg-list', site, 'lower-backend-control', 'eq-args');
  const lit = createSyntheticNode(doc, 'ir-lit', site, 'lower-backend-control', 'tag-lit');
  typeRef.setAttribute('name', tagType);
  callee.setAttribute('method', 'eq');
  lit.setAttribute('kind', 'int');
  lit.setAttribute('value', String(rhsValue));
  lit.setAttribute('type-name', tagType);
  lit.setAttribute('data-type-name', tagType);
  call.setAttribute('data-type-name', 'Bool');
  if (eqFn) {
    call.setAttribute('data-fn-id', eqFn.id);
    call.setAttribute('data-fn-origin-id', eqFn.attr('data-origin-id') ?? eqFn.id);
    call.setAttribute('data-resolved-as', 'static-method');
    call.setAttribute('data-resolved-name', eqFn.getAttribute('name'));
  }
  callee.appendChild(typeRef);
  args.appendChild(lhs);
  args.appendChild(lit);
  call.appendChild(callee);
  call.appendChild(args);
  return call;
}

function enumTagType(node) {
  return node.getAttribute('tag-type') ?? node.attr('data-tag-type') ?? 'I32';
}

function makeIf(site, cond, thenBody, elseBody) {
  const ifNode = createSyntheticNode(site.ownerDocument, 'ir-if', site, 'lower-backend-control', 'if');
  ifNode.appendChild(cond);
  ifNode.appendChild(thenBody);
  if (elseBody) ifNode.appendChild(elseBody);
  const t = thenBody.attr('data-type-name') ?? elseBody?.attr?.('data-type-name');
  if (t) ifNode.setAttribute('data-type-name', t);
  return ifNode;
}

function makeBoundIdent(subjectLet, subjectName) {
  const ident = createSyntheticNode(subjectLet.ownerDocument, 'ir-ident', subjectLet, 'lower-backend-control', 'bound-ident');
  ident.setAttribute('name', subjectName);
  ident.setAttribute('data-binding-id', subjectLet.id);
  ident.setAttribute('data-binding-origin-id', subjectLet.attr('data-origin-id') ?? subjectLet.id);
  ident.setAttribute('data-binding-kind', subjectLet.localName);
  ident.setAttribute('data-binding-name', subjectName);
  ident.setAttribute('data-type-name', subjectLet.attr('data-type-name') ?? subjectLet.firstElementChild?.getAttribute('name') ?? '');
  return ident;
}

function wrapBody(site, body) {
  if (body.localName === 'ir-block') return body;
  const block = createSyntheticNode(site.ownerDocument, 'ir-block', body, 'lower-backend-control', 'body-block');
  if (body.attr('data-type-name')) block.setAttribute('data-type-name', body.attr('data-type-name'));
  block.appendChild(body);
  return block;
}

function stampBlockType(block, site, arms, defaultArm) {
  const resultType = site.attr('data-type-name')
    ?? arms[0]?.lastElementChild?.attr?.('data-type-name')
    ?? defaultArm?.lastElementChild?.attr?.('data-type-name');
  if (resultType) block.setAttribute('data-type-name', resultType);
}

function tagValue(typeIndex, enumDecl, arm) {
  const variantDecl = typeEntryDecl(typeIndex.get(arm.getAttribute('variant') ?? ''));
  const variants = [...enumDecl.querySelectorAll(':scope > ir-variant')];
  return Math.max(0, variants.indexOf(variantDecl));
}

function cloneBody(node) {
  return cloneNode(node.lastElementChild);
}

function cloneNode(node) {
  return cloneGraphSubtree(node);
}
