import { restampSubtree } from './parse.js';
import { createSyntheticNode } from './ir-helpers.js';

export function lowerBackendControl(doc, typeIndex, { target = 'normal' } = {}) {
  if (target === 'analysis') return;
  const root = doc.body.firstChild;
  if (!root) return;

  for (const promote of [...root.querySelectorAll('ir-promote')]) {
    const lowered = lowerPromote(promote);
    if (lowered) promote.replaceWith(lowered);
  }

  for (const alt of [...root.querySelectorAll('ir-alt')]) {
    const lowered = lowerAlt(alt, typeIndex);
    if (lowered) alt.replaceWith(lowered);
  }
}

function lowerAlt(alt, typeIndex) {
  const scrutinee = alt.firstElementChild;
  const arms = [...alt.querySelectorAll(':scope > ir-alt-arm')];
  const defaultArm = alt.querySelector(':scope > ir-default-arm');
  const scrutType = scrutinee?.dataset.type ?? '';
  if (!scrutinee || !scrutType || arms.length === 0) return null;

  const decl = typeIndex.get(scrutType);
  if (decl?.localName === 'ir-enum') return lowerTagAlt(alt, typeIndex, decl, scrutinee, arms, defaultArm);
  return lowerRecAlt(alt, scrutinee, arms, defaultArm);
}

function lowerTagAlt(alt, typeIndex, enumDecl, scrutinee, arms, defaultArm) {
  const block = lowerSubjectBlock(alt, scrutinee);
  let tail = defaultArm ? cloneBody(defaultArm) : null;
  const tagType = enumTagType(enumDecl);
  const eqFn = alt.ownerDocument.body.firstChild?.querySelector(`:scope > ir-fn[name="${tagType}:eq"]`);
  const subjIdent = makeBoundIdent(block.subjectLet, block.subjectName);
  const tagExpr = makeFieldAccess(alt, subjIdent, '__tag', tagType);

  for (let i = arms.length - 1; i >= 0; i--) {
    const arm = arms[i];
    const cond = makeEqTest(alt, cloneNode(tagExpr), tagValue(typeIndex, enumDecl, arm), tagType, eqFn);
    const body = lowerArmBody(alt, block.subjectLet, block.subjectName, arm);
    tail = makeIf(arm, cond, body, tail);
  }

  if (tail) block.node.appendChild(tail);
  stampBlockType(block.node, alt, arms, defaultArm);
  return block.node;
}

function lowerRecAlt(alt, scrutinee, arms, defaultArm) {
  const block = lowerSubjectBlock(alt, scrutinee);
  let tail = defaultArm ? cloneBody(defaultArm) : null;

  for (let i = arms.length - 1; i >= 0; i--) {
    const arm = arms[i];
    const cond = makeRefTest(alt, block.subjectLet, block.subjectName, arm.getAttribute('variant'));
    const body = lowerArmBody(alt, block.subjectLet, block.subjectName, arm);
    tail = makeIf(arm, cond, body, tail);
  }

  if (tail) block.node.appendChild(tail);
  stampBlockType(block.node, alt, arms, defaultArm);
  return block.node;
}

function lowerPromote(node) {
  const scrutinee = node.firstElementChild;
  const thenArm = node.querySelector(':scope > ir-promote-arm');
  const defaultArm = node.querySelector(':scope > ir-default-arm');
  const scrutType = scrutinee?.dataset.type ?? '';
  if (!scrutinee || !thenArm || !scrutType.startsWith('?')) return null;

  const block = lowerSubjectBlock(node, scrutinee);
  const thenBody = lowerPromoteBody(node, block.subjectLet, block.subjectName, thenArm);
  const elseBody = defaultArm ? wrapBody(node, cloneBody(defaultArm)) : null;
  const ifNode = createSyntheticNode(node.ownerDocument, 'ir-if', node, 'lower-backend-control', 'promote-if');
  ifNode.appendChild(makeRefIsNull(node, block.subjectLet, block.subjectName, scrutType));
  ifNode.appendChild(elseBody ?? wrapBody(node, createSyntheticNode(node.ownerDocument, 'ir-fatal', node, 'lower-backend-control', 'promote-null-fatal')));
  ifNode.appendChild(thenBody);
  block.node.appendChild(ifNode);
  if (node.dataset.type) block.node.dataset.type = node.dataset.type;
  return block.node;
}

function lowerPromoteBody(site, subjectLet, subjectName, arm) {
  const binding = site.getAttribute('binding');
  const scrutType = subjectLet.firstElementChild?.getAttribute('name') ?? '';
  const valueType = scrutType.startsWith('?') ? scrutType.slice(1) : scrutType;
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
  const scrutType = scrutinee.dataset.type ?? '';
  subjectLet.setAttribute('name', subjectName);
  subjectLet.dataset.type = scrutType;
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
  letNode.dataset.originId = site.dataset.originId ?? id;
  letNode.setAttribute('name', name);
  letNode.dataset.type = type;
  typeNode.setAttribute('name', type);
  letNode.appendChild(typeNode);
  letNode.appendChild(initExpr);
  return letNode;
}

function makeRefTest(site, subjectLet, subjectName, variant) {
  const doc = site.ownerDocument;
  const test = createSyntheticNode(doc, 'ir-ref-test', site, 'lower-backend-control', 'ref-test');
  test.setAttribute('type', variant ?? '');
  test.dataset.type = 'bool';
  test.appendChild(makeBoundIdent(subjectLet, subjectName));
  return test;
}

function makeRefIsNull(site, subjectLet, subjectName, scrutType) {
  const doc = site.ownerDocument;
  const test = createSyntheticNode(doc, 'ir-ref-is-null', site, 'lower-backend-control', 'ref-is-null');
  test.dataset.type = 'bool';
  const ident = makeBoundIdent(subjectLet, subjectName);
  ident.dataset.type = scrutType;
  test.appendChild(ident);
  return test;
}

function makeRefCast(site, subjectLet, subjectName, type) {
  const doc = site.ownerDocument;
  const cast = createSyntheticNode(doc, 'ir-ref-cast', site, 'lower-backend-control', 'ref-cast');
  cast.setAttribute('type', type);
  cast.dataset.type = type;
  cast.appendChild(makeBoundIdent(subjectLet, subjectName));
  return cast;
}

function makeFieldAccess(site, recv, field, type) {
  const fieldNode = createSyntheticNode(site.ownerDocument, 'ir-field-access', site, 'lower-backend-control', 'field-access');
  fieldNode.setAttribute('field', field);
  fieldNode.dataset.type = type;
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
  lit.dataset.type = tagType;
  call.dataset.type = 'bool';
  if (eqFn) {
    call.dataset.fnId = eqFn.id;
    call.dataset.fnOriginId = eqFn.dataset.originId ?? eqFn.id;
    call.dataset.resolvedAs = 'static-method';
    call.dataset.resolvedName = eqFn.getAttribute('name');
  }
  callee.appendChild(typeRef);
  args.appendChild(lhs);
  args.appendChild(lit);
  call.appendChild(callee);
  call.appendChild(args);
  return call;
}

function enumTagType(node) {
  return node.getAttribute('tag-type') ?? node.dataset.tagType ?? 'i32';
}

function makeIf(site, cond, thenBody, elseBody) {
  const ifNode = createSyntheticNode(site.ownerDocument, 'ir-if', site, 'lower-backend-control', 'if');
  ifNode.appendChild(cond);
  ifNode.appendChild(thenBody);
  if (elseBody) ifNode.appendChild(elseBody);
  const t = thenBody.dataset.type ?? elseBody?.dataset.type;
  if (t) ifNode.dataset.type = t;
  return ifNode;
}

function makeBoundIdent(subjectLet, subjectName) {
  const ident = createSyntheticNode(subjectLet.ownerDocument, 'ir-ident', subjectLet, 'lower-backend-control', 'bound-ident');
  ident.setAttribute('name', subjectName);
  ident.dataset.bindingId = subjectLet.id;
  ident.dataset.bindingOriginId = subjectLet.dataset.originId ?? subjectLet.id;
  ident.dataset.bindingKind = subjectLet.localName;
  ident.dataset.bindingName = subjectName;
  ident.dataset.type = subjectLet.dataset.type ?? subjectLet.firstElementChild?.getAttribute('name') ?? '';
  return ident;
}

function wrapBody(site, body) {
  if (body.localName === 'ir-block') return body;
  const block = createSyntheticNode(site.ownerDocument, 'ir-block', body, 'lower-backend-control', 'body-block');
  if (body.dataset.type) block.dataset.type = body.dataset.type;
  block.appendChild(body);
  return block;
}

function stampBlockType(block, site, arms, defaultArm) {
  const resultType = site.dataset.type
    ?? arms[0]?.lastElementChild?.dataset.type
    ?? defaultArm?.lastElementChild?.dataset.type;
  if (resultType) block.dataset.type = resultType;
}

function tagValue(typeIndex, enumDecl, arm) {
  const variantDecl = typeIndex.get(arm.getAttribute('variant') ?? '');
  const variants = [...enumDecl.querySelectorAll(':scope > ir-variant')];
  return Math.max(0, variants.indexOf(variantDecl));
}

function cloneBody(node) {
  return cloneNode(node.lastElementChild);
}

function cloneNode(node) {
  const clone = node.cloneNode(true);
  restampSubtree(clone, node.dataset.originFile);
  return clone;
}
