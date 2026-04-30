// parse-decls-common.js — shared declaration sub-walkers

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

export function walkNomQualifier(n, doc, source, dispatch) {
  const node = stamp(el(T.NOM_QUALIFIER, doc), n);
  const tags = namedChildren(n).map(c => text(c));
  node.setAttribute('tags', tags.join(','));
  return node;
}

export function walkImplList(n, doc, source, dispatch) {
  const node = stamp(el(T.IMPL_LIST, doc), n);
  const impls = namedChildren(n).map(c => text(c));
  node.setAttribute('impls', impls.join(','));
  return node;
}

export function walkField(n, doc, source, dispatch) {
  const node = stamp(el(T.FIELD, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

export function walkVariant(n, doc, source, dispatch) {
  const node = stamp(el(T.VARIANT, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  for (const child of children.slice(1)) {
    if (child.type === 'field') {
      node.appendChild(walkField(child, doc, source, dispatch));
    } else if (child.type === 'field_list') {
      for (const field of namedChildren(child)) {
        if (field.type === 'field') node.appendChild(walkField(field, doc, source, dispatch));
      }
    }
  }
  return node;
}

export function walkSelfParam(n, doc, source, dispatch) {
  const node = stamp(el(T.SELF_PARAM, doc), n);
  const ident = namedChildren(n)[0];
  if (ident) node.setAttribute('name', text(ident));
  return node;
}

export function walkParam(n, doc, source, dispatch) {
  const node = stamp(el(T.PARAM, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

export function walkParamList(n, doc, source, dispatch) {
  const node = stamp(el(T.PARAM_LIST, doc), n);
  for (const child of namedChildren(n)) {
    if (child.type === 'param') node.appendChild(walkParam(child, doc, source, dispatch));
  }
  return node;
}

export function walkModuleParams(n, doc, source, dispatch) {
  const node = stamp(el(T.MODULE_PARAMS, doc), n);
  for (const child of namedChildren(n)) {
    if (child.type === 'module_type_param') node.appendChild(walkModuleParam(child, doc, source, dispatch));
  }
  return node;
}

export function walkModuleParam(n, doc, source, dispatch) {
  const node = stamp(el(T.MODULE_PARAM, doc), n);
  node.setAttribute('raw', text(n));
  const raw = text(n).trim();
  if (raw.startsWith('in ')) {
    node.setAttribute('variance', 'in');
    node.setAttribute('name', raw.slice(3));
  } else if (raw.startsWith('out ')) {
    node.setAttribute('variance', 'out');
    node.setAttribute('name', raw.slice(4));
  } else {
    const child = namedChildren(n)[0];
    node.setAttribute('name', child ? text(child) : raw);
  }
  return node;
}

export function walkModuleTypeArgList(n, doc, source, dispatch) {
  const wrap = stamp(el('ir-type-args', doc), n);
  for (const child of namedChildren(n)) {
    const ir = dispatch(child, doc, source);
    if (ir) wrap.appendChild(ir);
  }
  return wrap;
}

// ── Protocol members ──────────────────────────────────────────────────────────

export function walkProtoGetter(n, doc, source, dispatch) {
  const node = stamp(el(T.PROTO_GET, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

export function walkProtoSetter(n, doc, source, dispatch) {
  const node = stamp(el(T.PROTO_SET, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

export function walkProtoGetSetter(n, doc, source, dispatch) {
  const node = stamp(el(T.PROTO_GET_SET, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

export function walkProtoMethod(n, doc, source, dispatch) {
  const node = stamp(el(T.PROTO_METHOD, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  for (const child of children.slice(1)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

// ── Block (shared by decls and exprs) ─────────────────────────────────────────

export function walkBlock(n, doc, source, dispatch) {
  const node = stamp(el(T.BLOCK, doc), n);
  for (const child of namedChildren(n)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

