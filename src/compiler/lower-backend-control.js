// Lower `alt` and `promote` to blocks, tests, and casts the backend emits
// directly. Given backend facts, it reads types from them and records the
// facts of every node it creates; cloned arm bodies carry their facts.

import { childOf, childrenOf, cloneGraphSubtree, createSyntheticNode, replaceTypedNode } from './ir-helpers.js';

import { typeEntryDecl } from './link-type-decls.js';
import { unwrapNullable } from './type-strings.js';
import { unifyTypes } from './type-rules.js';
import { structFieldFact } from './type-graph.js';

export function lowerBackendControl(doc, typeIndex, { target = 'normal', facts = null } = {}) {
  if (target === 'analysis') return false;
  const root = doc.body.firstChild;
  if (!root) return false;
  let changed = false;
  const lowering = {
    typeIndex,
    facts,
    typeOf: facts ? node => facts.type(node) : node => node?.attr?.('data-type-name') ?? null,
    // Record a type on a node made here (as an attribute too, for standalone users).
    typed(node, type) {
      if (type) node.setAttribute('data-type-name', type);
      facts?.setType(node, type);
      return node;
    },
  };

  // Parents clone their arms, so lower descendants before replacing parents.
  // Use one traversal for both forms, including mixed alt/promote nesting.
  for (const node of [...root.querySelectorAll('ir-promote, ir-alt')].reverse()) {
    const lowered = node.localName === 'ir-promote'
      ? lowerPromote(node, lowering) : lowerAlt(node, lowering);
    if (lowered) { replaceTypedNode(node, lowered, facts); changed = true; }
  }
  return changed;
}

function lowerAlt(alt, lowering) {
  const { typeIndex, typeOf } = lowering;
  const scrutinee = alt.firstElementChild;
  const arms = [...childrenOf(alt, 'ir-alt-arm')];
  const defaultArm = childOf(alt, 'ir-default-arm');
  const scrutType = typeOf(scrutinee) ?? '';
  if (!scrutinee || !scrutType || arms.length === 0) return null;

  const enumDecl = typeEntryDecl(typeIndex.get(scrutType));
  const block = lowerSubjectBlock(alt, scrutinee, lowering);
  let tail = defaultArm ? cloneBody(defaultArm, lowering) : null;
  let condition;
  if (enumDecl?.localName === 'ir-enum') {
    const tagType = enumTagType(enumDecl);
    const eqFn = alt.ownerDocument.body.firstChild?.querySelector(`:scope > ir-fn[name="${tagType}:eq"]`);
    const tag = makeFieldAccess(alt, makeBoundIdent(block.subjectLet, block.subjectName, lowering), '__tag', tagType, lowering);
    condition = arm => makeEqTest(alt, cloneNode(tag, lowering), tagValue(typeIndex, enumDecl, arm), tagType, eqFn, lowering);
  } else {
    condition = arm => makeRefTest(alt, block.subjectLet, block.subjectName, arm.getAttribute('variant'), lowering);
  }
  // Without a default arm the chain still needs a final else when the alt has
  // a value. An alt naming every variant of an enum is exhaustive (validation
  // checks this), so its last arm needs no test; any other case traps.
  let last = arms.length - 1;
  if (!defaultArm) {
    const variants = enumDecl?.localName === 'ir-enum' ? childrenOf(enumDecl, 'ir-variant').length : -1;
    const resultType = typeOf(alt);
    if (variants === new Set(arms.map(arm => arm.getAttribute('variant'))).size) {
      tail = lowerArmBody(alt, block.subjectLet, block.subjectName, arms[last--], lowering);
    } else if (resultType && resultType !== 'void' && resultType !== 'never') {
      tail = wrapBody(alt, makeFatal(alt, 'alt-unmatched-fatal', lowering), lowering);
    }
  }
  for (let i = last; i >= 0; i--) {
    const arm = arms[i];
    const body = lowerArmBody(alt, block.subjectLet, block.subjectName, arm, lowering);
    tail = makeIf(arm, condition(arm), body, tail, lowering, alt);
  }
  if (tail) block.node.appendChild(tail);
  stampBlockType(block.node, alt, arms, defaultArm, lowering);
  return block.node;
}

function lowerPromote(node, lowering) {
  const { typeOf } = lowering;
  const scrutinee = node.firstElementChild;
  const thenArm = childOf(node, 'ir-promote-arm');
  const defaultArm = childOf(node, 'ir-default-arm');
  const scrutType = typeOf(scrutinee) ?? '';
  if (!scrutinee || !thenArm) return null;
  if (!scrutType.startsWith('?')) {
    // Already diagnosed ("promote requires a nullable value"); keep the IR
    // well-formed by binding the value and taking the present arm.
    const block = lowerSubjectBlock(node, scrutinee, lowering);
    const body = wrapBody(node, cloneBody(thenArm, lowering), lowering);
    const binding = node.getAttribute('binding');
    if (binding && node.id) body.insertBefore(makeBindingLet(node, block.subjectLet, block.subjectName, binding, node.id, scrutType,
      makeBoundIdent(block.subjectLet, block.subjectName, lowering), lowering, node), body.firstChild);
    block.node.appendChild(body);
    return block.node;
  }

  const block = lowerSubjectBlock(node, scrutinee, lowering);
  const thenBody = lowerPromoteBody(node, block.subjectLet, block.subjectName, thenArm, lowering);
  const elseBody = defaultArm ? wrapBody(node, cloneBody(defaultArm, lowering), lowering) : null;
  const ifNode = createSyntheticNode(node.ownerDocument, 'ir-if', node, 'lower-backend-control', 'promote-if');
  ifNode.appendChild(makeRefIsNull(node, block.subjectLet, block.subjectName, scrutType, lowering));
  ifNode.appendChild(elseBody ?? wrapBody(node, makeFatal(node, 'promote-null-fatal', lowering), lowering));
  ifNode.appendChild(thenBody);
  // The conditional joins the same branches the promote did.
  lowering.facts?.setType(ifNode, typeOf(node));
  expectBranches(ifNode, node, lowering);
  block.node.appendChild(ifNode);
  if (typeOf(node)) lowering.typed(block.node, typeOf(node));
  return block.node;
}

function lowerPromoteBody(site, subjectLet, subjectName, arm, lowering) {
  const binding = site.getAttribute('binding');
  const scrutType = subjectLet.firstElementChild?.getAttribute('name') ?? '';
  const valueType = unwrapNullable(scrutType);
  const body = cloneBody(arm, lowering);
  if (!binding || !site.id) return wrapBody(site, body, lowering);

  const block = wrapBody(site, body, lowering);
  block.insertBefore(
    makeBindingLet(site, subjectLet, subjectName, binding, site.id, valueType,
      makeRefCast(site, subjectLet, subjectName, valueType, lowering), lowering, site),
    block.firstChild,
  );
  return block;
}

function lowerArmBody(site, subjectLet, subjectName, arm, lowering) {
  const binding = arm.getAttribute('binding');
  const variant = arm.getAttribute('variant') ?? '';
  const body = cloneBody(arm, lowering);
  if (!binding || !arm.id) return wrapBody(site, body, lowering);

  const block = wrapBody(site, body, lowering);
  block.insertBefore(
    makeBindingLet(site, subjectLet, subjectName, binding, arm.id, variant,
      makeRefCast(site, subjectLet, subjectName, variant, lowering), lowering, arm),
    block.firstChild,
  );
  return block;
}

function lowerSubjectBlock(site, scrutinee, lowering) {
  const doc = site.ownerDocument;
  const node = createSyntheticNode(doc, 'ir-block', site, 'lower-backend-control', 'control-block');
  const subjectName = `__ctl_subj_${site.id || 'anon'}`;
  const subjectLet = createSyntheticNode(doc, 'ir-let', site, 'lower-backend-control', 'control-subject');
  const subjectType = createSyntheticNode(doc, 'ir-type-ref', site, 'lower-backend-control', 'control-subject-type');
  const scrutType = lowering.typeOf(scrutinee) ?? '';
  subjectLet.setAttribute('name', subjectName);
  lowering.typed(subjectLet, scrutType);
  subjectType.setAttribute('name', scrutType);
  subjectLet.appendChild(subjectType);
  const subject = cloneNode(scrutinee, lowering);
  // It now initializes a binding declared with its type.
  lowering.facts?.setExpectation(subject, scrutType);
  subjectLet.appendChild(subject);
  node.appendChild(subjectLet);
  return { node, subjectLet, subjectName };
}

/** The binding `declaration` (an arm or the promote) introduced, now a let with its id. */
function makeBindingLet(site, subjectLet, subjectName, name, id, type, initExpr, lowering, declaration) {
  const doc = site.ownerDocument;
  const letNode = createSyntheticNode(doc, 'ir-let', site, 'lower-backend-control', 'binding-let');
  const typeNode = createSyntheticNode(doc, 'ir-type-ref', site, 'lower-backend-control', 'binding-type');
  letNode.id = id;
  letNode.setAttribute('data-origin-id', site.attr('data-origin-id') ?? id);
  letNode.setAttribute('name', name);
  lowering.typed(letNode, type);
  typeNode.setAttribute('name', type);
  letNode.appendChild(typeNode);
  letNode.appendChild(initExpr);
  lowering.facts?.redeclare(declaration, letNode);
  return letNode;
}

function makeRefTest(site, subjectLet, subjectName, variant, lowering) {
  const doc = site.ownerDocument;
  const test = createSyntheticNode(doc, 'ir-ref-test', site, 'lower-backend-control', 'ref-test');
  test.setAttribute('type-name', variant ?? '');
  lowering.typed(test, 'Bool');
  test.appendChild(makeBoundIdent(subjectLet, subjectName, lowering));
  return test;
}

function makeRefIsNull(site, subjectLet, subjectName, scrutType, lowering) {
  const doc = site.ownerDocument;
  const test = createSyntheticNode(doc, 'ir-ref-is-null', site, 'lower-backend-control', 'ref-is-null');
  lowering.typed(test, 'Bool');
  const ident = makeBoundIdent(subjectLet, subjectName, lowering);
  lowering.typed(ident, scrutType);
  test.appendChild(ident);
  return test;
}

function makeRefCast(site, subjectLet, subjectName, type, lowering) {
  const doc = site.ownerDocument;
  const cast = createSyntheticNode(doc, 'ir-ref-cast', site, 'lower-backend-control', 'ref-cast');
  cast.setAttribute('type-name', type);
  lowering.typed(cast, type);
  cast.appendChild(makeBoundIdent(subjectLet, subjectName, lowering));
  return cast;
}

function makeFieldAccess(site, recv, field, type, lowering) {
  const fieldNode = createSyntheticNode(site.ownerDocument, 'ir-field-access', site, 'lower-backend-control', 'field-access');
  fieldNode.setAttribute('field', field);
  lowering.typed(fieldNode, type);
  fieldNode.appendChild(recv);
  const fact = lowering.facts && structFieldFact(lowering.typeIndex, lowering.typeOf(recv), field);
  if (fact) lowering.facts.fields.set(fieldNode, fact);
  return fieldNode;
}

function makeEqTest(site, lhs, rhsValue, tagType, eqFn, lowering) {
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
  lowering.typed(lit, tagType);
  lowering.typed(call, 'Bool');
  if (eqFn) {
    call.setAttribute('data-fn-id', eqFn.id);
    call.setAttribute('data-fn-origin-id', eqFn.attr('data-origin-id') ?? eqFn.id);
    call.setAttribute('data-resolved-as', 'static-method');
    call.setAttribute('data-resolved-name', eqFn.getAttribute('name'));
    lowering.facts?.callTargets.set(call.id, eqFn.id);
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

function makeFatal(site, kind, lowering) {
  return lowering.typed(createSyntheticNode(site.ownerDocument, 'ir-fatal', site, 'lower-backend-control', kind), 'never');
}

function makeIf(site, cond, thenBody, elseBody, lowering, alt) {
  const { typeOf, facts } = lowering;
  const ifNode = createSyntheticNode(site.ownerDocument, 'ir-if', site, 'lower-backend-control', 'if');
  ifNode.appendChild(cond);
  ifNode.appendChild(thenBody);
  if (elseBody) ifNode.appendChild(elseBody);
  const t = typeOf(thenBody) ?? typeOf(elseBody);
  if (t) ifNode.setAttribute('data-type-name', t);
  if (facts) {
    // Branches that do not meet join as the alt's did.
    facts.setType(ifNode, elseBody ? unifyTypes(typeOf(thenBody), typeOf(elseBody)) ?? typeOf(alt) : 'void');
    expectBranches(ifNode, alt, lowering);
  }
  return ifNode;
}

// Numeric contexts that branch literals adopt directly (as type-graph.js).
const LITERAL_CONTEXT = new Set(['I32', 'U32', 'I64', 'U64', 'F32', 'F64']);

/**
 * What each branch of a conditional is expected to be: the context of the
 * construct it lowers when that is numeric or a tuple, else the type the
 * branches meet at (unifiedBranchType in type-graph.js).
 */
function expectBranches(ifNode, site, { facts, typeOf }) {
  if (!facts) return;
  const [, then, otherwise] = ifNode.children;
  if (!otherwise) return;
  const context = facts.expectation(site);
  const meet = typeOf(ifNode) ?? typeOf(then);
  const type = context && context !== 'null' && context !== 'void' && context !== 'nullable'
    && (LITERAL_CONTEXT.has(context) || context.startsWith('.{'))
    ? context
    : meet !== 'null' ? meet : context ?? meet;
  for (const branch of [then, otherwise]) facts.setExpectation(branch, type);
}

function makeBoundIdent(subjectLet, subjectName, lowering) {
  const ident = createSyntheticNode(subjectLet.ownerDocument, 'ir-ident', subjectLet, 'lower-backend-control', 'bound-ident');
  ident.setAttribute('name', subjectName);
  ident.setAttribute('data-binding-id', subjectLet.id);
  ident.setAttribute('data-binding-origin-id', subjectLet.attr('data-origin-id') ?? subjectLet.id);
  ident.setAttribute('data-binding-kind', subjectLet.localName);
  ident.setAttribute('data-binding-name', subjectName);
  lowering.typed(ident, lowering.typeOf(subjectLet) ?? subjectLet.firstElementChild?.getAttribute('name') ?? '');
  lowering.facts?.bindings.set(ident.id, subjectLet);
  return ident;
}

function wrapBody(site, body, lowering) {
  if (body.localName === 'ir-block') return body;
  const block = createSyntheticNode(site.ownerDocument, 'ir-block', body, 'lower-backend-control', 'body-block');
  const type = lowering.typeOf(body);
  if (type) block.setAttribute('data-type-name', type);
  lowering.facts?.setType(block, type);
  block.appendChild(body);
  return block;
}

function stampBlockType(block, site, arms, defaultArm, { typeOf, typed }) {
  const resultType = typeOf(site)
    ?? typeOf(arms[0]?.lastElementChild)
    ?? typeOf(defaultArm?.lastElementChild);
  if (resultType) typed(block, resultType);
}

function tagValue(typeIndex, enumDecl, arm) {
  const variantDecl = typeEntryDecl(typeIndex.get(arm.getAttribute('variant') ?? ''));
  const variants = [...childrenOf(enumDecl, 'ir-variant')];
  return Math.max(0, variants.indexOf(variantDecl));
}

function cloneBody(node, lowering) {
  return cloneNode(node.lastElementChild, lowering);
}

function cloneNode(node, { facts }) {
  return cloneGraphSubtree(node, facts);
}
