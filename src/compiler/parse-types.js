// parse-types.js — Type walkers for parse phase 1
//
// Each exported walker has signature (n, doc, source, dispatch) → Element.
// Import helpers from parse.js; do NOT import dispatchNode (no circular deps).

import { stamp, el, text, namedChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

function walkNullableType(n, doc, source, dispatch) {
  const node = stamp(el(T.TYPE_NULLABLE, doc), n);
  const inner = namedChildren(n)[0];
  if (inner) node.appendChild(dispatch(inner, doc, source));
  return node;
}

function walkRefType(n, doc, source, dispatch) {
  const children = namedChildren(n);
  if (children.length === 0) {
    const node = stamp(el(T.TYPE_REF, doc), n);
    node.setAttribute('name', text(n));
    return node;
  }
  return dispatch(children[0], doc, source);
}

function walkTypeIdent(n, doc, source, dispatch) {
  const node = stamp(el(T.TYPE_REF, doc), n);
  node.setAttribute('name', text(n));
  return node;
}

// `scalar_type` is a grammar-level alternation of the built-in scalar names
// (i32, f64, bool, …).  The set of accepted names lives in the grammar for
// parsing convenience only — the IR treats every scalar exactly the same as
// any other type reference, so we lower it to `<ir-type-ref>` here.  Adding
// a new scalar width is therefore a stdlib change (plus one grammar string
// alt) rather than a compiler-wide change.
function walkScalarType(n, doc, source, dispatch) {
  const node = stamp(el(T.TYPE_REF, doc), n);
  node.setAttribute('name', text(n));
  return node;
}

function walkQualifiedTypeRef(n, doc, source, dispatch) {
  const node = stamp(el(T.TYPE_QUALIFIED, doc), n);
  node.setAttribute('raw', text(n));
  const children = namedChildren(n);
  const typeName = children[children.length - 1];
  if (typeName) node.setAttribute('type', text(typeName));
  for (const child of children.slice(0, -1)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

function walkInstModuleRef(n, doc, source, dispatch) {
  const node = stamp(el(T.TYPE_INST, doc), n);
  node.setAttribute('raw', text(n));
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('module', text(children[0]));
  for (const child of children.slice(1)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

function walkFuncType(n, doc, source, dispatch) {
  const node = stamp(el(T.TYPE_FN, doc), n);
  for (const child of namedChildren(n)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

function walkPromotedType(n, doc, source, dispatch) {
  return stamp(el(T.TYPE_SELF, doc), n);
}

function walkVoidType(n, doc, source, dispatch) {
  return stamp(el(T.TYPE_VOID, doc), n);
}

export const walkers = {
  'nullable_type':          walkNullableType,
  'ref_type':               walkRefType,
  'scalar_type':            walkScalarType,
  'type_ident':             walkTypeIdent,
  'qualified_type_ref':     walkQualifiedTypeRef,
  'instantiated_module_ref': walkInstModuleRef,
  'func_type':              walkFuncType,
  'promoted_type':          walkPromotedType,
  'void_type':              walkVoidType,
};
