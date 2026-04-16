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

import { typeNodeToStr, fnReturnType } from './infer-types.js';

/**
 * @param {Document}             doc
 * @param {Map<string, Element>} typeIndex  from linkTypeDecls (pass 5)
 */
export function resolveMethods(doc, typeIndex) {
  const root = doc.body.firstChild;
  if (!root) return;

  // fn index: qualified name → ir-fn
  const fnIndex = new Map();
  for (const fn of root.querySelectorAll(':scope > ir-fn')) {
    fnIndex.set(fn.getAttribute('name'), fn);
  }

  // field index: typeName → Map<fieldName, typeStr>
  const fieldIndex = buildFieldIndex(typeIndex);

  // ── 1. Resolve method/static calls ───────────────────────────────────────
  for (const call of root.querySelectorAll('ir-call')) {
    const callee = call.children[0];
    if (!callee) continue;

    if (callee.localName === 'ir-field-access') {
      resolveMethodCall(call, callee, fnIndex, fieldIndex);
    } else if (callee.localName === 'ir-type-member') {
      resolveStaticCall(call, callee, fnIndex);
    }
  }

  // ── 2. Resolve field accesses not already handled as call callees ─────────
  for (const fa of root.querySelectorAll('ir-field-access')) {
    if (fa.dataset.type) continue; // already stamped above
    const recv = fa.children[0];
    if (!recv?.dataset.type) continue;
    const t = lookupFieldType(recv.dataset.type, fa.getAttribute('field'), fieldIndex);
    if (t) fa.dataset.type = t;
    else   fa.dataset.error = `unknown-field:${fa.getAttribute('field')}`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveMethodCall(call, fieldAccess, fnIndex, fieldIndex) {
  const recv = fieldAccess.children[0];
  if (!recv?.dataset.type) return;
  const methodName = fieldAccess.getAttribute('field');
  const qualName   = typeToQualName(recv.dataset.type, methodName);
  if (!qualName) return;

  const fn = fnIndex.get(qualName);
  if (fn) {
    call.dataset.fnId      = fn.id;
    call.dataset.type      = fnReturnType(fn);
    fieldAccess.dataset.type = call.dataset.type; // field-access itself gets return type
  } else {
    // Could be a struct field (fn pointer) — try field lookup as fallback
    const ft = lookupFieldType(recv.dataset.type, methodName, fieldIndex);
    if (ft) fieldAccess.dataset.type = ft;
    else    call.dataset.error = `unknown-method:${qualName}`;
  }
}

function resolveStaticCall(call, typeMember, fnIndex) {
  // ir-type-member has a `method` attribute and type child nodes (not a `type` attribute).
  // e.g. Point.foo → <ir-type-member method="foo"><ir-type-ref name="Point"/></ir-type-member>
  const methodName = typeMember.getAttribute('method');
  const typeNode   = typeMember.children[0];
  const typeName   = typeNode ? typeNodeToStr(typeNode) : null;
  if (!typeName || !methodName) return;

  const qualName = `${typeName}.${methodName}`;
  const fn = fnIndex.get(qualName);
  if (fn) {
    call.dataset.fnId       = fn.id;
    call.dataset.type       = fnReturnType(fn);
    typeMember.dataset.fnId = fn.id;
  } else {
    call.dataset.error = `unknown-method:${qualName}`;
  }
}

// "?Foo" → "Foo.method";  "i32" → "i32.method"
function typeToQualName(typeStr, methodName) {
  if (!typeStr || !methodName) return null;
  const name = typeStr.startsWith('?') ? typeStr.slice(1) : typeStr;
  return `${name}.${methodName}`;
}

function lookupFieldType(typeStr, fieldName, fieldIndex) {
  if (!typeStr || !fieldName) return null;
  const typeName = typeStr.startsWith('?') ? typeStr.slice(1) : typeStr;
  return fieldIndex.get(typeName)?.get(fieldName) ?? null;
}

function buildFieldIndex(typeIndex) {
  const index = new Map(); // typeName → Map<fieldName, typeStr>
  for (const [name, decl] of typeIndex) {
    if (decl.localName !== 'ir-struct') continue;
    const fields = new Map();
    for (const field of decl.querySelectorAll(':scope > ir-field')) {
      const fieldName  = field.getAttribute('name');
      const typeChild  = field.children[0];
      if (fieldName && typeChild) fields.set(fieldName, typeNodeToStr(typeChild));
    }
    index.set(name, fields);
  }
  return index;
}
