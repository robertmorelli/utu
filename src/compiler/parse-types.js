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

function walkQualifiedTypeRef(n, doc, source, dispatch) {
  const node = stamp(el(T.TYPE_QUALIFIED, doc), n);
  node.setAttribute('raw', text(n));
  const children = namedChildren(n);
  const typeName = children[children.length - 1];
  if (typeName) node.setAttribute('type-name', text(typeName));
  for (const child of children.slice(0, -1)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

function walkInlineModuleTypePath(n, doc, source, dispatch) {
  const children = namedChildren(n);
  const node = stamp(el(T.TYPE_QUALIFIED, doc), n);
  node.setAttribute('raw', text(n));
  if (children[2]) node.setAttribute('type-name', text(children[2]));

  const inst = stamp(el(T.TYPE_INST, doc), n);
  if (children[0]) inst.setAttribute('module', text(children[0]));
  if (children[0] && children[1]) inst.setAttribute('raw', `${text(children[0])}${text(children[1])}`);
  if (children[1]) {
    const args = dispatch(children[1], doc, source);
    if (args) inst.appendChild(args);
  }
  node.appendChild(inst);
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
  return walkCallableType(n, doc, source, dispatch, T.TYPE_FN);
}

function walkClosureType(n, doc, source, dispatch) {
  return walkCallableType(n, doc, source, dispatch, T.TYPE_CL);
}

// `fun(...) R` and `cl(...) R` have identical shape; only the tag differs.
//
// The parameter list arrives wrapped in a `type_list`, whose children are the
// real types. Splicing them in here rather than letting the wrapper through is
// what makes them ordinary type nodes: otherwise the list survives as opaque
// raw text, and everything downstream has to re-parse that string — which also
// hides any module instantiation inside it, so `fun(Str) Promise[Str]` would
// never instantiate `Promise[Str]`.
function walkCallableType(n, doc, source, dispatch, tag) {
  const node = stamp(el(tag, doc), n);
  for (const child of namedChildren(n)) {
    const parts = child.type === 'type_list' ? namedChildren(child) : [child];
    for (const part of parts) {
      const ir = dispatch(part, doc, source);
      if (ir) node.appendChild(ir);
    }
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
  'type_ident':             walkTypeIdent,
  'qualified_type_ref':     walkQualifiedTypeRef,
  'inline_module_type_path': walkInlineModuleTypePath,
  'instantiated_module_ref': walkInstModuleRef,
  'func_type':              walkFuncType,
  'closure_type':           walkClosureType,
  'promoted_type':          walkPromotedType,
  'void_type':              walkVoidType,
};
