import { bodyOf, declaredTypeStr, firstTypeChild, fnReturnType, isFunctionDecl, paramsOf, typeNodeToStr } from './ir-helpers.js';
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';
import { expectationLabel } from './record-expectations.js';
import { validateExpressionAssumptions } from './validate-expression-assumptions.js';
import { isAssignable } from './type-rules.js';
import { typeEntryDecl } from './link-type-decls.js';

export function validateAnalysis(doc, typeIndex) {
  const root = doc.body.firstChild;
  if (!root) return;

  const fnIndex = buildFnIndex(root);
  const fieldIndex = buildFieldIndex(typeIndex);
  const ctx = { typeIndex };

  // Phase 2 of the binding graph: every declared type has already been
  // recorded on the value it constrains, so one comparison covers bindings,
  // assignments, arguments, struct fields and return position — and blame is
  // read off the edge instead of being written out at each site.
  validateExpectations(root, ctx);
  validateCallArity(root, fnIndex);
  validateAssignmentTargets(root);
  validateExpressionAssumptions(root, ctx, isAssignable);
  validateStructInits(root, fieldIndex, ctx);
  validateExhaustiveAltsAndMatches(root, ctx);
  validateNullableAccess(root);
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
  for (const [name, entry] of typeIndex) {
    const decl = typeEntryDecl(entry);
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

/**
 * Compare each node's type against the expectation recorded on it.
 *
 * This is the only place a type mismatch is reported. The declaration that
 * imposed the expectation is already on the node, so the "related" note points
 * at it without this having to know which kind of context it was.
 */
function validateExpectations(root, ctx) {
  const doc = root.ownerDocument;
  for (const node of root.querySelectorAll('[data-expect]')) {
    const expected = node.dataset.expect;
    const actual = node.dataset['typeName'];
    if (!expected || !actual || isAssignable(actual, expected, ctx)) continue;

    const source = node.dataset.expectFrom ? doc.getElementById(node.dataset.expectFrom) : null;
    stampDiagnostic(node, DIAGNOSTIC_KINDS.TYPE_MISMATCH, `Type mismatch: expected ${expected}, got ${actual}`, {
      expected,
      actual,
      site: node.dataset.expectSite,
      relatedNodes: source
        ? [{ node: source, label: expectationLabel(node.dataset.expectSite, expected) }]
        : [],
    });
  }
}

function validateCallArity(root, fnIndex) {
  for (const call of root.querySelectorAll('ir-call')) {
    const fn = resolvedFn(call, fnIndex);
    if (!fn) continue;
    const expected = paramsOf(fn);
    const actual = [...call.querySelectorAll(':scope > ir-arg-list > *')];
    const methodAsStatic = call.dataset.resolvedAs === 'static-method'
      && fn.querySelector(':scope > ir-fn-name')?.getAttribute('kind') === 'method'
      && actual.length === expected.length + 1;
    if (!methodAsStatic && expected.length !== actual.length) {
      stampDiagnostic(call, DIAGNOSTIC_KINDS.WRONG_ARITY, `Wrong arity: expected ${expected.length}, got ${actual.length}`, {
        expected: expected.length,
        actual: actual.length,
        function: fn.getAttribute('name'),
        relatedNodes: [{ node: fn, label: `function '${fn.getAttribute('name')}' is declared here` }],
      });
      continue;
    }
  }
}

function resolvedFn(call, fnIndex) {
  if (call.dataset.fnId) return call.ownerDocument.getElementById(call.dataset.fnId);
  const callee = call.firstElementChild;
  if (callee?.localName === 'ir-ident' && callee.dataset.bindingId) {
    const bound = call.ownerDocument.getElementById(callee.dataset.bindingId);
    return isFunctionDecl(bound) ? bound : null;
  }
  if (call.dataset.resolvedName) return fnIndex.get(call.dataset.resolvedName) ?? null;
  return null;
}

function validateAssignmentTargets(root) {
  for (const assign of root.querySelectorAll('ir-assign')) {
    const [lhs, rhs] = [...assign.children];
    if (!lhs || !rhs) continue;
    if (lhs.localName !== 'ir-ident' && lhs.localName !== 'ir-field-access' && lhs.localName !== 'ir-index') {
      stampDiagnostic(lhs, DIAGNOSTIC_KINDS.INVALID_ASSIGNMENT_TARGET, 'Invalid assignment target');
      continue;
    }
    if (lhs.localName === 'ir-ident') {
      const decl = lhs.dataset.bindingId ? root.ownerDocument.getElementById(lhs.dataset.bindingId) : null;
      if (decl?.localName === 'ir-global' || isFunctionDecl(decl)) {
        stampDiagnostic(lhs, DIAGNOSTIC_KINDS.ASSIGNMENT_TO_IMMUTABLE, `Cannot assign to immutable '${lhs.getAttribute('name')}'`, {
          name: lhs.getAttribute('name'),
          bindingKind: decl.localName,
          relatedNodes: [{ node: decl, label: `'${lhs.getAttribute('name')}' is declared immutable here` }],
        });
      }
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


function validateStructInits(root, fieldIndex, ctx) {
  for (const init of root.querySelectorAll('ir-struct-init')) {
    const typeName = init.getAttribute('type-name');
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
    const recvType = access.firstElementChild?.dataset['typeName'];
    if (!recvType?.startsWith('?')) continue;
    stampDiagnostic(access, DIAGNOSTIC_KINDS.NULLABLE_ACCESS, `Cannot access field '${access.getAttribute('field')}' on nullable ${recvType}`, {
      field: access.getAttribute('field'),
      receiverName: recvType,
    });
  }
}

function validateExhaustiveAltsAndMatches(root, ctx) {
  for (const alt of root.querySelectorAll('ir-alt')) validateAltExhaustive(alt, ctx);
  for (const match of root.querySelectorAll('ir-match')) validateMatchExhaustive(match, ctx);
}

function validateAltExhaustive(alt, ctx) {
  if (hasDefaultArm(alt)) return;
  const scrutineeType = alt.firstElementChild?.dataset['typeName'];
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
  const scrutineeType = match.firstElementChild?.dataset['typeName'];
  if (scrutineeType === 'Bool') {
    const patterns = new Set([...match.querySelectorAll(':scope > ir-match-arm')].map(arm => arm.getAttribute('pattern')));
    const missing = ['true', 'false'].filter(value => !patterns.has(value));
    if (missing.length) {
      stampDiagnostic(
        match,
        DIAGNOSTIC_KINDS.NON_EXHAUSTIVE_MATCH,
        `Missing Bool case '${missing[0]}' in match`,
        { type: 'Bool', missing }
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
  const decl = typeEntryDecl(typeName ? typeIndex.get(typeName) : null);
  if (decl?.localName !== 'ir-enum') return null;
  return [...decl.querySelectorAll(':scope > ir-variant')]
    .map(variant => variant.getAttribute('name'))
    .filter(Boolean);
}


function returnBodyType(body) {
  const last = body?.lastElementChild;
  if (last?.localName === 'ir-return') return last.firstElementChild?.dataset['typeName'] ?? 'void';
  return body?.dataset['typeName'];
}

function validateRecursiveStructs(typeIndex) {
  for (const [name, entry] of typeIndex) {
    const decl = typeEntryDecl(entry);
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
  const decl = typeEntryDecl(typeIndex.get(current));
  if (decl?.localName !== 'ir-struct') return false;
  for (const field of decl.querySelectorAll(':scope > ir-field')) {
    const t = typeNodeToStr(field.firstElementChild);
    if (!t || t.startsWith('?')) continue;
    if (t === target) return true;
    if (reachesStruct(target, t, typeIndex, visiting)) return true;
  }
  return false;
}

