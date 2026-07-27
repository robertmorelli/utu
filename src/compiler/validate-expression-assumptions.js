import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';

export function validateExpressionAssumptions(root, ctx, isAssignable) {
  validateBinaryOperands(root, ctx, isAssignable);
  validateControlFlow(root, ctx, isAssignable);
  validateNullableFallbacks(root, ctx, isAssignable);
}

function validateBinaryOperands(root, ctx, isAssignable) {
  for (const node of root.querySelectorAll('ir-binary')) {
    const [lhs, rhs] = [...node.children];
    const expected = lhs?.dataset['typeName'];
    const actual = rhs?.dataset['typeName'];
    if (!expected || !actual || isAssignable(actual, expected, ctx)) continue;

    mismatch(rhs, expected, actual, {
      operator: node.getAttribute('op'),
    });
  }
}

function validateControlFlow(root, ctx, isAssignable) {
  for (const node of root.querySelectorAll('ir-if')) {
    const [cond, thenBlock, elseBranch] = [...node.children];
    validateBoolCondition(cond, 'if', ctx, isAssignable);
    validateBranchType(thenBlock, elseBranch, node, ctx, isAssignable);
  }

  for (const node of root.querySelectorAll('ir-while')) {
    validateBoolCondition(node.firstElementChild, 'while', ctx, isAssignable);
  }

  for (const node of root.querySelectorAll('ir-match, ir-alt, ir-promote')) {
    validateArmBodies(node, ctx, isAssignable);
  }
}

function validateNullableFallbacks(root, ctx, isAssignable) {
  for (const node of root.querySelectorAll('ir-else')) {
    const [expr, fallback] = [...node.children];
    const exprType = expr?.dataset['typeName'];
    if (exprType && !exprType.startsWith('?')) {
      mismatch(expr, 'nullable', exprType, { construct: 'orelse' });
      continue;
    }

    const expected = exprType?.slice(1);
    const actual = fallback?.dataset['typeName'];
    if (expected && actual && !isAssignable(actual, expected, ctx)) {
      mismatch(fallback, expected, actual, { construct: 'orelse' });
    }
  }
}

function validateBoolCondition(cond, construct, ctx, isAssignable) {
  const actual = cond?.dataset['typeName'];
  if (actual && !isAssignable(actual, 'Bool', ctx)) {
    mismatch(cond, 'Bool', actual, { construct });
  }
}

function validateBranchType(thenBlock, elseBranch, node, ctx, isAssignable) {
  if (!elseBranch) return;
  const expected = thenBlock?.dataset['typeName'];
  const actual = elseBranch?.dataset['typeName'];
  if (!expected || !actual || branchTypesCompatible(expected, actual, ctx, isAssignable)) return;

  mismatch(valueForDiagnostic(elseBranch), expected, actual, {
    construct: constructName(node),
    relatedNodes: [{ node: valueForDiagnostic(thenBlock), label: `other branch has type ${expected}` }],
  });
}

function branchTypesCompatible(a, b, ctx, isAssignable) {
  if (isAssignable(b, a, ctx) || isAssignable(a, b, ctx)) return true;
  return a === 'null' || b === 'null';
}

function validateArmBodies(node, ctx, isAssignable) {
  const expected = node.dataset['typeName'];
  if (!expected) return;

  const selector = ':scope > ir-match-arm, :scope > ir-alt-arm, :scope > ir-promote-arm, :scope > ir-default-arm';
  for (const arm of node.querySelectorAll(selector)) {
    const body = arm.lastElementChild;
    const actual = body?.dataset['typeName'];
    if (!actual || isAssignable(actual, expected, ctx)) continue;

    mismatch(valueForDiagnostic(body), expected, actual, {
      construct: constructName(node),
      relatedNodes: [{ node, label: `${constructName(node)} expects ${expected}` }],
    });
  }
}

function mismatch(node, expected, actual, extra = {}) {
  stampDiagnostic(node, DIAGNOSTIC_KINDS.TYPE_MISMATCH, `Type mismatch: expected ${expected}, got ${actual}`, {
    expected,
    actual,
    ...extra,
  });
}

function valueForDiagnostic(node) {
  if (!node) return node;
  if (node.localName === 'ir-block' && node.lastElementChild) return valueForDiagnostic(node.lastElementChild);
  if (node.localName === 'ir-return' && node.firstElementChild) return valueForDiagnostic(node.firstElementChild);
  return node;
}

function constructName(node) {
  return node.localName.replace(/^ir-/, '');
}
