// parse-exprs-statements.js — statement, struct-init, and DSL expression walkers

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

export function walkBindExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.LET, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  for (const child of children.slice(1)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

export function walkReturnExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.RETURN, doc), n);
  const exprN = namedChildren(n)[0];
  if (exprN) node.appendChild(dispatch(exprN, doc, source));
  return node;
}

export function walkBreakExpr(n, doc, source, dispatch) {
  return stamp(el(T.BREAK, doc), n);
}

export function walkFatalExpr(n, doc, source, dispatch) {
  return stamp(el(T.FATAL, doc), n);
}

export function walkAssertExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.ASSERT, doc), n);
  const exprN = namedChildren(n)[0];
  if (exprN) node.appendChild(dispatch(exprN, doc, source));
  return node;
}

export function walkStructInit(n, doc, source, dispatch, implicit) {
  const node = stamp(el(T.STRUCT_INIT, doc), n);
  if (implicit) node.setAttribute('implicit', 'true');
  const children = namedChildren(n);
  let i = 0;
  if (!implicit && children[i] && (children[i].type === 'type_ident' || children[i].type === 'qualified_type_ref')) {
    node.setAttribute('type', text(children[i]));
    i++;
  }
  for (; i < children.length; i++) {
    if (children[i].type === 'field_init') node.appendChild(walkFieldInit(children[i], doc, source, dispatch));
  }
  return node;
}

export function walkFieldInit(n, doc, source, dispatch) {
  const node = stamp(el(T.FIELD_INIT, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('field', text(children[0]));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

export function walkDslExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.DSL, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  const raw = source.slice(n.startIndex, n.endIndex);
  const bodyOffset = raw.indexOf('/\\');
  const bodyEndOffset = raw.lastIndexOf('\\/');
  if (bodyOffset >= 0 && bodyEndOffset >= bodyOffset + 2) {
    node.setAttribute('body', raw.slice(bodyOffset, bodyEndOffset + 2));
    node.dataset.bodyStart = n.startIndex + bodyOffset;
    node.dataset.bodyEnd = n.startIndex + bodyEndOffset + 2;
    node.dataset.bodyInnerStart = n.startIndex + bodyOffset + 2;
    node.dataset.bodyInnerEnd = n.startIndex + bodyEndOffset;
  }
  return node;
}
