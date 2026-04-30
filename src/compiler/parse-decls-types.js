// parse-decls-types.js — struct, protocol, and enum declaration walkers

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

import { walkField, walkImplList, walkNomQualifier, walkVariant } from './parse-decls-common.js';

export function walkStructDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.STRUCT, doc), n);
  for (const child of namedChildren(n)) {
    switch (child.type) {
      case 'nom_qualifier':   node.appendChild(walkNomQualifier(child, doc, source, dispatch)); break;
      case 'type_ident':      node.setAttribute('name', text(child)); break;
      case 'promoted_type':   node.setAttribute('name', '&'); break;
      case 'impl_list':       node.appendChild(walkImplList(child, doc, source, dispatch)); break;
      case 'field':           node.appendChild(walkField(child, doc, source, dispatch)); break;
    }
  }
  return node;
}

export function walkProtoDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.PROTO, doc), n);
  for (const child of namedChildren(n)) {
    switch (child.type) {
      case 'type_ident':      node.setAttribute('name', text(child)); break;
      case 'promoted_type':   node.setAttribute('name', '&'); break;
      default: {
        const ir = dispatch(child, doc, source);
        if (ir) node.appendChild(ir);
      }
    }
  }
  return node;
}

export function walkEnumDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.ENUM, doc), n);
  for (const child of namedChildren(n)) {
    switch (child.type) {
      case 'nom_qualifier':   node.appendChild(walkNomQualifier(child, doc, source, dispatch)); break;
      case 'type_ident':      node.setAttribute('name', text(child)); break;
      case 'promoted_type':   node.setAttribute('name', '&'); break;
      case 'impl_list':       node.appendChild(walkImplList(child, doc, source, dispatch)); break;
      case 'variant':         node.appendChild(walkVariant(child, doc, source, dispatch)); break;
    }
  }
  return node;
}

