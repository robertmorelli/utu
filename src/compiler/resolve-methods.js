// resolve-methods.js — Pass 8
//
// resolveMethods(doc, typeIndex) → void
//
// Resolves method calls and field accesses using types stamped in pass 7.
//
//   ir-call { ir-field-access … }  — instance method call
//     Find ir-fn[name="RecvType.method"], stamp data-fn-id + data-type on call.
//   ir-call { ir-type-member … }   — static call TypeName.method
//     Same resolution via qualified name.
//   ir-field-access (not in call position)
//     Look up struct field in typeIndex, stamp data-type.
//
// Requires passes 5–7 (type linking, binding resolution, type inference).
//
// stampFieldAccessTypes(doc, typeIndex) is exported separately so the
// compiler can run *just* the field-access part before lowerOperators —
// otherwise `p.x + p.y` lowers to nothing because the operands carry no
// data-type yet, and the backend later trips on the un-lowered ir-binary.

import { typeNodeToStr, fnReturnType } from './infer-types.js';
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';

/**
 * @param {Document}             doc
 * @param {Map<string, Element>} typeIndex  from linkTypeDecls (pass 5)
 */
export function resolveMethods(doc, typeIndex) {
  const root = doc.body.firstChild;
  if (!root) return;

  // fn index: context-qualified lookup key → ir-fn
  const fnIndex = new Map();
  for (const fn of root.querySelectorAll(':scope > ir-fn, :scope > ir-export-lib > ir-fn, :scope > ir-export-main > ir-fn')) {
    for (const key of functionLookupKeys(fn)) fnIndex.set(key, fn);
  }

  // field index: typeName → Map<fieldName, typeStr>
  const fieldIndex = buildFieldIndex(typeIndex);

  // ── 1. Resolve method/static calls ───────────────────────────────────────
  for (const call of root.querySelectorAll('ir-call')) {
    const callee = call.firstElementChild;
    if (!callee) continue;

    if (callee.localName === 'ir-field-access' && resolveTypeNamespaceCall(call, callee, fnIndex, typeIndex)) {
      continue;
    }
    if (callee.localName === 'ir-field-access') {
      resolveMethodCall(call, callee, fnIndex, fieldIndex);
    } else if (callee.localName === 'ir-type-member') {
      resolveStaticCall(call, callee, fnIndex);
    }
  }

  // ── 2. Resolve field accesses not already handled as call callees ─────────
  stampFieldsFromIndex(root, fieldIndex);
  stampDeferredValueTypes(root);
}

/**
 * Stamp `data-type` on every `ir-field-access` node whose receiver has a
 * known type, by looking the field up in the struct field index.
 *
 * Iterates to fixed point so chains like `a.b.c` resolve from the innermost
 * receiver outward without depending on selector enumeration order.
 *
 * Exposed as a standalone pass so the compiler can run it before
 * lowerOperators — operator lowering needs the operand types stamped to
 * decide which overload (T:add) to dispatch to.
 *
 * @param {Document}             doc
 * @param {Map<string, Element>} typeIndex  from linkTypeDecls
 */
export function stampFieldAccessTypes(doc, typeIndex) {
  const root = doc.body.firstChild;
  if (!root) return;
  stampFieldsFromIndex(root, buildFieldIndex(typeIndex));
}

function stampFieldsFromIndex(root, fieldIndex) {
  // Fixed-point: a parent field-access can only be typed once its child
  // (the receiver) has been typed.  Cap iterations so a bug can't loop forever.
  const accesses = [...root.querySelectorAll('ir-field-access')];
  let changed = true;
  let exhausted = false;
  for (let iter = 0; iter < 8 && changed; iter++) {
    changed = false;
    for (const fa of accesses) {
      if (fa.dataset.type) continue;
      const recv = fa.firstElementChild;
      if (!recv?.dataset.type) continue;
      const field = lookupField(recv.dataset.type, fa.getAttribute('field'), fieldIndex);
      if (field?.type) {
        fa.dataset.type = field.type;
        fa.dataset.fieldOwnerType = recv.dataset.type;
        changed = true;
      }
    }
    exhausted = changed && iter === 7;
  }
  if (exhausted) {
    throw new Error('resolve-methods: field-access type stamping did not converge after 8 iterations');
  }
  // Final pass: anything still un-typed gets a clear error so debugging
  // doesn't hinge on guessing why a downstream pass tripped.
  for (const fa of accesses) {
    if (fa.dataset.type) continue;
    if (isUnknownMethodCallee(fa)) continue;
    const recv = fa.firstElementChild;
    if (recv?.dataset.type) {
      stampDiagnostic(fa, DIAGNOSTIC_KINDS.UNKNOWN_FIELD, `Unknown field '${fa.getAttribute('field')}'`, {
        field: fa.getAttribute('field'),
        receiverType: recv.dataset.type,
      });
    }
  }
}

function isUnknownMethodCallee(fieldAccess) {
  const call = fieldAccess.parentElement;
  return call?.localName === 'ir-call'
    && call.firstElementChild === fieldAccess
    && call.dataset.errorKind === DIAGNOSTIC_KINDS.UNKNOWN_METHOD;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveTypeNamespaceCall(call, fieldAccess, fnIndex, typeIndex) {
  const recv = fieldAccess.firstElementChild;
  const typeName = recv?.localName === 'ir-ident' ? recv.getAttribute('name') : null;
  const methodName = fieldAccess.getAttribute('field');
  if (!typeName || !methodName || !typeIndex.has(typeName)) return false;

  const fn = resolveQualifiedMethod(fnIndex, typeName, methodName, 'static');
  if (!fn) return false;

  clearDiagnostic(recv);
  clearDiagnostic(fieldAccess);
  recv.dataset.bindingId = fn.id;
  recv.dataset.bindingKind = 'ir-fn';
  recv.dataset.bindingName = fn.getAttribute('name');
  call.dataset.fnId = fn.id;
  call.dataset.fnOriginId = fn.dataset.originId ?? fn.id;
  call.dataset.type = fnReturnType(fn);
  call.dataset.resolvedAs = 'static-method';
  call.dataset.resolvedName = fn.getAttribute('name');
  fieldAccess.dataset.fnId = fn.id;
  fieldAccess.dataset.resolvedAs = 'static-method';
  return true;
}

function resolveMethodCall(call, fieldAccess, fnIndex, fieldIndex) {
  const recv = fieldAccess.firstElementChild;
  if (!recv?.dataset.type) return;
  const methodName = fieldAccess.getAttribute('field');
  const recvName = receiverTypeName(recv.dataset.type);
  if (!recvName || !methodName) return;

  const fn = resolveQualifiedMethod(fnIndex, recvName, methodName, 'instance');
  if (fn) {
    clearDiagnostic(fieldAccess);
    call.dataset.fnId      = fn.id;
    call.dataset.fnOriginId = fn.dataset.originId ?? fn.id;
    call.dataset.resolvedName = fn.getAttribute('name');
    call.dataset.type      = fnReturnType(fn);
    call.dataset.resolvedAs = 'method';
    fieldAccess.dataset.type = call.dataset.type; // field-access itself gets return type
    fieldAccess.dataset.resolvedAs = 'method';
    fieldAccess.dataset.receiverType = recv.dataset.type;
  } else {
    // Only callable fields may be used with call syntax; data fields are not methods.
    const field = lookupField(recv.dataset.type, methodName, fieldIndex);
    if (field?.callable) {
      fieldAccess.dataset.type = field.type;
      fieldAccess.dataset.resolvedAs = 'field';
      fieldAccess.dataset.fieldOwnerType = recv.dataset.type;
    }
    else {
      clearDiagnostic(fieldAccess);
      stampDiagnostic(call, DIAGNOSTIC_KINDS.UNKNOWN_METHOD, `Unknown method '${recvName}.${methodName}'`, {
        method: methodName,
        receiverType: recv.dataset.type,
      });
    }
  }
}

function resolveStaticCall(call, typeMember, fnIndex) {
  // ir-type-member carries the type as a child ir-type-ref node (primary) or
  // a `type` attribute (fallback, used by buildOpCall in lower-operators.js).
  // e.g. T.foo  → <ir-type-member method="foo"><ir-type-ref name="T"/></ir-type-member>
  const methodName = typeMember.getAttribute('method');
  const typeNode   = typeMember.firstElementChild;
  const typeName   = typeNode
    ? typeNodeToStr(typeNode)
    : typeMember.getAttribute('type'); // fallback for operator-lowered calls
  if (!typeName || !methodName) return;

  const syntax = typeMember.dataset.rewriteKind === 'operator-callee' ? 'operator' : 'static';
  const fn = resolveQualifiedMethod(fnIndex, typeName, methodName, syntax);
  if (fn) {
    call.dataset.fnId       = fn.id;
    call.dataset.fnOriginId = fn.dataset.originId ?? fn.id;
    call.dataset.type       = fnReturnType(fn);
    call.dataset.resolvedAs = 'static-method';
    call.dataset.resolvedName = fn.getAttribute('name');
    typeMember.dataset.fnId = fn.id;
    typeMember.dataset.resolvedAs = 'static-method';
  } else {
    stampDiagnostic(call, DIAGNOSTIC_KINDS.UNKNOWN_METHOD, `Unknown method '${typeName}.${methodName}'`, {
      method: methodName,
      receiverType: typeName,
    });
  }
}

function receiverTypeName(typeStr) {
  if (!typeStr) return null;
  return typeStr.startsWith('?') ? typeStr.slice(1) : typeStr;
}

function resolveQualifiedMethod(fnIndex, typeName, methodName, syntax) {
  if (!typeName || !methodName) return null;
  return fnIndex.get(methodLookupKey(syntax, typeName, methodName)) ?? null;
}

function functionLookupKeys(fn) {
  const name = fn.getAttribute('name');
  if (!name) return [];

  const colon = /^(.+):([^:]+)$/.exec(name);
  if (colon) return [methodLookupKey('operator', colon[1], colon[2])];

  const dot = /^(.+)\.([^.]+)$/.exec(name);
  if (dot) {
    const syntax = fn.querySelector(':scope > ir-self-param') ? 'instance' : 'static';
    return [methodLookupKey(syntax, dot[1], dot[2]), name];
  }

  const split = name.lastIndexOf('__');
  if (split > 0 && split < name.length - 2) {
    return [methodLookupKey('static', name.slice(0, split), name.slice(split + 2)), name];
  }

  return [name];
}

function methodLookupKey(syntax, typeName, methodName) {
  return `${syntax}:${typeName}.${methodName}`;
}

function lookupFieldType(typeStr, fieldName, fieldIndex) {
  return lookupField(typeStr, fieldName, fieldIndex)?.type ?? null;
}

function lookupField(typeStr, fieldName, fieldIndex) {
  if (!typeStr || !fieldName) return null;
  const typeName = typeStr.startsWith('?') ? typeStr.slice(1) : typeStr;
  return fieldIndex.get(typeName)?.get(fieldName) ?? null;
}

function buildFieldIndex(typeIndex) {
  const index = new Map(); // typeName → Map<fieldName, typeStr>
  for (const [name, decl] of typeIndex) {
    if (decl.localName === 'ir-struct' || decl.localName === 'ir-variant') {
      const fields = new Map();
      for (const field of decl.querySelectorAll(':scope > ir-field')) {
        const fieldName  = field.getAttribute('name');
        const typeChild  = field.firstElementChild;
        if (fieldName && typeChild) fields.set(fieldName, fieldInfo(typeChild));
      }
      index.set(name, fields);
      continue;
    }
    if (decl.localName !== 'ir-enum') continue;
    for (const variant of decl.querySelectorAll(':scope > ir-variant')) {
      const fields = new Map();
      for (const field of variant.querySelectorAll(':scope > ir-field')) {
        const fieldName  = field.getAttribute('name');
        const typeChild  = field.firstElementChild;
        if (fieldName && typeChild) fields.set(fieldName, fieldInfo(typeChild));
      }
      index.set(variant.getAttribute('name'), fields);
    }
  }
  return index;
}

function fieldInfo(typeChild) {
  return {
    type: typeNodeToStr(typeChild),
    callable: typeChild?.localName === 'ir-type-fn',
  };
}

function stampDeferredValueTypes(root) {
  let changed = true;
  let exhausted = false;
  for (let iter = 0; iter < 8 && changed; iter++) {
    changed = false;

    for (const node of root.querySelectorAll('ir-else')) {
      if (node.dataset.type) continue;
      const lhs = node.firstElementChild?.dataset.type ?? '';
      if (!lhs) continue;
      node.dataset.type = lhs.startsWith('?') ? lhs.slice(1) : lhs;
      changed = true;
    }

    for (const node of root.querySelectorAll('ir-paren')) {
      if (node.dataset.type) continue;
      const innerType = node.firstElementChild?.dataset.type;
      if (!innerType) continue;
      node.dataset.type = innerType;
      changed = true;
    }
    exhausted = changed && iter === 7;
  }
  if (exhausted) {
    throw new Error('resolve-methods: deferred value type stamping did not converge after 8 iterations');
  }
}

function clearDiagnostic(node) {
  delete node.dataset.error;
  delete node.dataset.errorKind;
  delete node.dataset.errorMessage;
  delete node.dataset.errorData;
}
