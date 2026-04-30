import { typeNodeToStr, fnReturnType } from './ir-helpers.js';
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';
import { validateExpressionAssumptions } from './validate-expression-assumptions.js';
import { isAssignable } from './type-rules.js';

export function validateAnalysis(doc, typeIndex) {
  const root = doc.body.firstChild;
  if (!root) return;

  const fnIndex = buildFnIndex(root);
  const fieldIndex = buildFieldIndex(typeIndex);
  const ctx = { typeIndex };

  validateCalls(root, fnIndex, ctx);
  validateAssignments(root, ctx);
  validateDeclaredTypes(root, ctx);
  validateExpressionAssumptions(root, ctx, isAssignable);
  validateStructInits(root, fieldIndex, ctx);
  validateExhaustiveAltsAndMatches(root, ctx);
  validateNullableAccess(root);
  validateReturnTypes(root, ctx);
  validateRecursiveStructs(typeIndex);
  validateResidualEsDsls(root);
}

function buildFnIndex(root) {
  const map = new Map();
  for (const fn of root.querySelectorAll('ir-fn, ir-extern-fn')) map.set(fn.getAttribute('name'), fn);
  return map;
}

function buildFieldIndex(typeIndex) {
  const map = new Map();
  for (const [name, decl] of typeIndex) {
    if (decl.localName !== 'ir-struct' && decl.localName !== 'ir-variant') continue;
    const fields = new Map();
    for (const field of decl.querySelectorAll(':scope > ir-field')) {
      const fieldName = field.getAttribute('name');
      const fieldType = typeNodeToStr(field.firstElementChild);
      if (fieldName) fields.set(fieldName, { type: fieldType, node: field });
    }
    map.set(name, fields);
  }
  return map;
}

function validateCalls(root, fnIndex, ctx) {
  for (const call of root.querySelectorAll('ir-call')) {
    const fn = resolvedFn(call, fnIndex);
    if (!fn) continue;
    const expected = [...fn.querySelectorAll(':scope > ir-param-list > ir-param')];
    const actual = [...call.querySelectorAll(':scope > ir-arg-list > *')];
    if (expected.length !== actual.length) {
      stampDiagnostic(call, DIAGNOSTIC_KINDS.WRONG_ARITY, `Wrong arity: expected ${expected.length}, got ${actual.length}`, {
        expected: expected.length,
        actual: actual.length,
        function: fn.getAttribute('name'),
      });
      continue;
    }
    for (let i = 0; i < expected.length; i++) {
      const expectedType = typeNodeToStr(expected[i].firstElementChild);
      const actualType = actual[i]?.dataset.type;
      if (expectedType && actualType && !isAssignable(actualType, expectedType, ctx)) {
        stampDiagnostic(actual[i], DIAGNOSTIC_KINDS.TYPE_MISMATCH, `Type mismatch: expected ${expectedType}, got ${actualType}`, {
          expected: expectedType,
          actual: actualType,
          function: fn.getAttribute('name'),
          argument: i,
        });
      }
    }
  }
}

function resolvedFn(call, fnIndex) {
  if (call.dataset.fnId) return call.ownerDocument.getElementById(call.dataset.fnId);
  const callee = call.firstElementChild;
  if (callee?.localName === 'ir-ident' && callee.dataset.bindingId) {
    const bound = call.ownerDocument.getElementById(callee.dataset.bindingId);
    return bound?.localName === 'ir-fn' || bound?.localName === 'ir-extern-fn' ? bound : null;
  }
  if (call.dataset.resolvedName) return fnIndex.get(call.dataset.resolvedName) ?? null;
  return null;
}

function validateAssignments(root, ctx) {
  for (const assign of root.querySelectorAll('ir-assign')) {
    const [lhs, rhs] = [...assign.children];
    if (!lhs || !rhs) continue;
    if (lhs.localName !== 'ir-ident' && lhs.localName !== 'ir-field-access' && lhs.localName !== 'ir-index') {
      stampDiagnostic(lhs, DIAGNOSTIC_KINDS.INVALID_ASSIGNMENT_TARGET, 'Invalid assignment target');
      continue;
    }
    if (lhs.localName === 'ir-ident') {
      const decl = lhs.dataset.bindingId ? root.ownerDocument.getElementById(lhs.dataset.bindingId) : null;
      if (decl?.localName === 'ir-global' || decl?.localName === 'ir-fn' || decl?.localName === 'ir-extern-fn') {
        stampDiagnostic(lhs, DIAGNOSTIC_KINDS.ASSIGNMENT_TO_IMMUTABLE, `Cannot assign to immutable '${lhs.getAttribute('name')}'`, {
          name: lhs.getAttribute('name'),
          bindingKind: decl.localName,
        });
      }
    }
    const lhsType = lhs.dataset.type;
    const rhsType = rhs.dataset.type;
    if (lhsType && rhsType && !isAssignable(rhsType, lhsType, ctx)) {
      stampDiagnostic(rhs, DIAGNOSTIC_KINDS.TYPE_MISMATCH, `Type mismatch: expected ${lhsType}, got ${rhsType}`, {
        expected: lhsType,
        actual: rhsType,
      });
    }
  }
}

function validateResidualEsDsls(root) {
  for (const node of root.querySelectorAll('ir-dsl[name="es"]')) {
    stampDiagnostic(node, DIAGNOSTIC_KINDS.INVALID_DSL_USAGE, '@es DSL must appear on the right-hand side of a typed let binding (let X: T = @es/\\...\\/)', {
      name: 'es',
    });
  }
}

function validateDeclaredTypes(root, ctx) {
  for (const node of root.querySelectorAll('ir-let, ir-global')) {
    const expected = declaredType(node);
    const init = node.lastElementChild;
    const actual = init?.dataset.type;
    if (expected && actual && !isAssignable(actual, expected, ctx)) {
      stampDiagnostic(init, DIAGNOSTIC_KINDS.TYPE_MISMATCH, `Type mismatch: expected ${expected}, got ${actual}`, {
        expected,
        actual,
        binding: node.getAttribute('name'),
      });
    }
  }
}

function validateStructInits(root, fieldIndex, ctx) {
  for (const init of root.querySelectorAll('ir-struct-init')) {
    const typeName = init.getAttribute('type');
    const fields = fieldIndex.get(typeName);
    if (!fields) continue;
    const seen = new Set();
    for (const fieldInit of init.querySelectorAll(':scope > ir-field-init')) {
      const name = fieldInit.getAttribute('field');
      if (seen.has(name)) {
        stampDiagnostic(fieldInit, DIAGNOSTIC_KINDS.DUPLICATE_FIELD, `Duplicate field '${name}'`, { field: name, type: typeName });
        continue;
      }
      seen.add(name);
      const field = fields.get(name);
      if (!field) continue;
      const actual = fieldInit.lastElementChild?.dataset.type;
      if (field.type && actual && !isAssignable(actual, field.type, ctx)) {
        stampDiagnostic(fieldInit.lastElementChild, DIAGNOSTIC_KINDS.TYPE_MISMATCH, `Type mismatch: expected ${field.type}, got ${actual}`, {
          expected: field.type,
          actual,
          field: name,
          type: typeName,
        });
      }
    }
    for (const [name] of fields) {
      if (!seen.has(name)) {
        stampDiagnostic(init, DIAGNOSTIC_KINDS.MISSING_FIELD, `Missing field '${name}' for ${typeName}`, { field: name, type: typeName });
        break;
      }
    }
  }
}

function validateNullableAccess(root) {
  for (const access of root.querySelectorAll('ir-field-access')) {
    const recvType = access.firstElementChild?.dataset.type;
    if (!recvType?.startsWith('?')) continue;
    stampDiagnostic(access, DIAGNOSTIC_KINDS.NULLABLE_ACCESS, `Cannot access field '${access.getAttribute('field')}' on nullable ${recvType}`, {
      field: access.getAttribute('field'),
      receiverType: recvType,
    });
  }
}

function validateExhaustiveAltsAndMatches(root, ctx) {
  for (const alt of root.querySelectorAll('ir-alt')) validateAltExhaustive(alt, ctx);
  for (const match of root.querySelectorAll('ir-match')) validateMatchExhaustive(match, ctx);
}

function validateAltExhaustive(alt, ctx) {
  if (hasDefaultArm(alt)) return;
  const scrutineeType = alt.firstElementChild?.dataset.type;
  const variants = enumVariants(scrutineeType, ctx.typeIndex);
  if (!variants) return;

  const covered = new Set(
    [...alt.querySelectorAll(':scope > ir-alt-arm')]
      .map(arm => arm.getAttribute('variant'))
      .filter(Boolean)
  );
  const missing = variants.filter(name => !covered.has(name));
  if (missing.length) {
    stampDiagnostic(
      alt,
      DIAGNOSTIC_KINDS.NON_EXHAUSTIVE_MATCH,
      `Missing variant '${missing[0]}' in alt over enum ${scrutineeType}`,
      { type: scrutineeType, missing }
    );
  }
}

function validateMatchExhaustive(match, ctx) {
  if (hasDefaultArm(match)) return;
  const scrutineeType = match.firstElementChild?.dataset.type;
  if (scrutineeType === 'bool') {
    const patterns = new Set([...match.querySelectorAll(':scope > ir-match-arm')].map(arm => arm.getAttribute('pattern')));
    const missing = ['true', 'false'].filter(value => !patterns.has(value));
    if (missing.length) {
      stampDiagnostic(
        match,
        DIAGNOSTIC_KINDS.NON_EXHAUSTIVE_MATCH,
        `Missing bool case '${missing[0]}' in match`,
        { type: 'bool', missing }
      );
    }
    return;
  }

  const variants = enumVariants(scrutineeType, ctx.typeIndex);
  if (variants) {
    const patterns = new Set([...match.querySelectorAll(':scope > ir-match-arm')].map(arm => arm.getAttribute('pattern')));
    const missing = variants.filter(name => !patterns.has(name));
    if (missing.length) {
      stampDiagnostic(
        match,
        DIAGNOSTIC_KINDS.NON_EXHAUSTIVE_MATCH,
        `Missing variant '${missing[0]}' in match over enum ${scrutineeType}`,
        { type: scrutineeType, missing }
      );
    }
    return;
  }

  stampDiagnostic(
    match,
    DIAGNOSTIC_KINDS.NON_EXHAUSTIVE_MATCH,
    `Match over ${scrutineeType ?? 'unknown type'} requires a default arm`,
    { type: scrutineeType ?? null }
  );
}

function hasDefaultArm(node) {
  return Boolean(node.querySelector(':scope > ir-default-arm'));
}

function enumVariants(typeName, typeIndex) {
  const decl = typeName ? typeIndex.get(typeName) : null;
  if (decl?.localName !== 'ir-enum') return null;
  return [...decl.querySelectorAll(':scope > ir-variant')]
    .map(variant => variant.getAttribute('name'))
    .filter(Boolean);
}

function validateReturnTypes(root, ctx) {
  for (const fn of root.querySelectorAll('ir-fn')) {
    const expected = fnReturnType(fn);
    const body = fn.querySelector(':scope > ir-block');
    const actual = returnBodyType(body);
    if (expected && expected !== 'void' && actual && !isAssignable(actual, expected, ctx)) {
      stampDiagnostic(body.lastElementChild ?? body, DIAGNOSTIC_KINDS.TYPE_MISMATCH, `Type mismatch: expected ${expected}, got ${actual}`, {
        expected,
        actual,
        function: fn.getAttribute('name'),
      });
    }
  }
}

function returnBodyType(body) {
  const last = body?.lastElementChild;
  if (last?.localName === 'ir-return') return last.firstElementChild?.dataset.type ?? 'void';
  return body?.dataset.type;
}

function validateRecursiveStructs(typeIndex) {
  for (const [name, decl] of typeIndex) {
    if (decl.localName !== 'ir-struct') continue;
    const visiting = new Set();
    if (reachesStruct(name, name, typeIndex, visiting)) {
      stampDiagnostic(decl, DIAGNOSTIC_KINDS.RECURSIVE_TYPE, `Recursive type '${name}' must use a nullable or indirect field`, { type: name });
    }
  }
}

function reachesStruct(target, current, typeIndex, visiting) {
  if (visiting.has(current)) return false;
  visiting.add(current);
  const decl = typeIndex.get(current);
  if (decl?.localName !== 'ir-struct') return false;
  for (const field of decl.querySelectorAll(':scope > ir-field')) {
    const t = typeNodeToStr(field.firstElementChild);
    if (!t || t.startsWith('?')) continue;
    if (t === target) return true;
    if (reachesStruct(target, t, typeIndex, visiting)) return true;
  }
  return false;
}

function declaredType(node) {
  for (const child of node.children) {
    const t = typeNodeToStr(child);
    if (t) return t;
  }
  return null;
}
