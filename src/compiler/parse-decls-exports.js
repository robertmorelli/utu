// parse-decls-exports.js — global, export, test, and bench walkers

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

import { walkBlock, walkParamList } from './parse-decls-common.js';

export function walkTypeDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.TYPE_DEF, doc), n);
  const children = namedChildren(n);
  // children[0] = type_ident or promoted_type; children[1] = dsl_expr
  const nameN = children[0];
  if (nameN) {
    node.setAttribute('name', nameN.type === 'promoted_type' ? '&' : text(nameN));
  }
  const dslN = children[1];
  if (dslN) {
    const ir = dispatch(dslN, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

export function walkGlobalDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.GLOBAL, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  for (const child of children.slice(1)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

export function walkExportLibDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.EXPORT_LIB, doc), n);
  append(node, walkChildren(n, doc, source, dispatch));
  return node;
}

export function walkExportMainDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.EXPORT_MAIN, doc), n);
  for (const child of namedChildren(n)) {
    switch (child.type) {
      case 'param_list':  node.appendChild(walkParamList(child, doc, source, dispatch)); break;
      case 'return_type': {
        const inner = namedChildren(child)[0];
        if (inner) node.appendChild(dispatch(inner, doc, source));
        break;
      }
      case 'void_type':   node.appendChild(stamp(el(T.TYPE_VOID, doc), child)); break; // dead-code insurance
      case 'block':       node.appendChild(walkBlock(child, doc, source, dispatch)); break;
      default: {
        const ir = dispatch(child, doc, source);
        if (ir) node.appendChild(ir);
      }
    }
  }
  return node;
}

export function walkTestDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.TEST, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('label', text(children[0]).slice(1, -1));
  if (children[1]) node.appendChild(walkBlock(children[1], doc, source, dispatch));
  return node;
}

export function walkBenchDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.BENCH, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('label', text(children[0]).slice(1, -1));
  for (const child of children.slice(1)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

export function walkMeasure(n, doc, source, dispatch) {
  const node = stamp(el(T.MEASURE, doc), n);
  const blockN = namedChildren(n)[0];
  if (blockN) node.appendChild(walkBlock(blockN, doc, source, dispatch));
  return node;
}

