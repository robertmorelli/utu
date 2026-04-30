// parse-exprs-control.js — control-flow expression walkers

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

export function walkIfExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.IF, doc), n);
  append(node, walkChildren(n, doc, source, dispatch));
  return node;
}

export function walkWhileExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.WHILE, doc), n);
  const children = namedChildren(n);
  for (const child of children) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

export function walkForExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.FOR, doc), n);
  for (const child of namedChildren(n)) {
    switch (child.type) {
      case 'for_sources': {
        for (const src of namedChildren(child)) {
          if (src.type === 'for_source') node.appendChild(walkForSource(src, doc, source, dispatch));
        }
        break;
      }
      case 'capture': node.appendChild(walkCapture(child, doc, source, dispatch)); break;
      case 'block':   node.appendChild(walkBlock(child, doc, source, dispatch)); break;
    }
  }
  return node;
}

export function walkForSource(n, doc, source, dispatch) {
  const node = stamp(el(T.FOR_SOURCE, doc), n);
  const children = namedChildren(n);
  if (children.length >= 2) {
    const lhs = children[0];
    const rhs = children[1];
    const op = source.slice(lhs.endIndex, rhs.startIndex).trim();
    node.setAttribute('op', op);
    node.appendChild(dispatch(lhs, doc, source));
    node.appendChild(dispatch(rhs, doc, source));
  }
  return node;
}

export function walkCapture(n, doc, source, dispatch) {
  const node = stamp(el(T.CAPTURE, doc), n);
  const names = namedChildren(n).map(c => text(c));
  node.setAttribute('names', names.join(','));
  return node;
}

export function walkMatchExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.MATCH, doc), n);
  for (const child of namedChildren(n)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

export function walkMatchArm(n, doc, source, dispatch) {
  const node = stamp(el(T.MATCH_ARM, doc), n);
  const children = namedChildren(n);
  if (children[0]) {
    node.setAttribute('pattern', text(children[0]));
  }
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

export function walkDefaultArm(n, doc, source, dispatch) {
  const node = stamp(el(T.DEFAULT_ARM, doc), n);
  const exprN = namedChildren(n)[0];
  if (exprN) node.appendChild(dispatch(exprN, doc, source));
  return node;
}

export function walkAltExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.ALT, doc), n);
  for (const child of namedChildren(n)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

export function walkAltArm(n, doc, source, dispatch) {
  const node = stamp(el(T.ALT_ARM, doc), n);
  const children = namedChildren(n);
  let i = 0;
  if (children[i] && children[i].type === 'type_ident') {
    node.setAttribute('variant', text(children[i]));
    i++;
  }
  if (children[i] && children[i].type === 'identifier') {
    node.setAttribute('binding', text(children[i]));
    i++;
  }
  if (children[i]) node.appendChild(dispatch(children[i], doc, source));
  return node;
}

export function walkPromoteExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.PROMOTE, doc), n);
  const children = namedChildren(n);
  let i = 0;
  if (children[i]) {
    node.appendChild(dispatch(children[i], doc, source));
    i++;
  }
  if (children[i] && children[i].type === 'identifier') {
    node.setAttribute('binding', text(children[i]));
    i++;
  }
  if (children[i]) {
    const arm = stamp(el('ir-promote-arm', doc), children[i]);
    arm.appendChild(dispatch(children[i], doc, source));
    node.appendChild(arm);
    i++;
  }
  if (children[i]) {
    node.appendChild(walkDefaultArm(children[i], doc, source, dispatch));
  }
  return node;
}

export function walkBlockExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.BLOCK, doc), n);
  const children = namedChildren(n);
  let i = 0;
  if (children.length > 1 && children[0].type === 'identifier') {
    node.setAttribute('label', text(children[0]));
    i = 1;
  }
  for (let j = i; j < children.length; j++) {
    const ir = dispatch(children[j], doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

export function walkBlock(n, doc, source, dispatch) {
  const node = stamp(el(T.BLOCK, doc), n);
  for (const child of namedChildren(n)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

