// parse-exprs-statements.js — statement, struct-init, and DSL expression walkers

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

export function walkBindExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.LET, doc), n);
  const children = namedChildren(n);
  // `let .{a, b} = value`: lowerTuples turns the names into one let each.
  if (children[0]?.type === 'tuple_pattern') {
    node.setAttribute('names', namedChildren(children[0]).map(text).join(','));
    for (const child of children.slice(1)) {
      const ir = dispatch(child, doc, source);
      if (ir) node.appendChild(ir);
    }
    return node;
  }
  if (children[0]) {
    node.setAttribute('name', text(children[0]));
    node.setAttribute('data-name-start', String(children[0].startIndex));
    node.setAttribute('data-name-end', String(children[0].endIndex));
  }
  for (const child of children.slice(1)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

// cl(x, y) [R] { ... }
//
// Shaped like an ir-fn on purpose: ir-param-list, optional return type, then
// ir-block.  Closure conversion lifts this node into a real top-level ir-fn,
// so keeping the child order identical means the lifted function needs no
// re-shaping.  Parameter types are optional here — when absent, they are
// filled in from the closure's expectation during inference.
export function walkClosureExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.CLOSURE, doc), n);
  for (const child of namedChildren(n)) {
    switch (child.type) {
      case 'closure_param_list': {
        const paramList = stamp(el(T.PARAM_LIST, doc), child);
        for (const p of namedChildren(child)) {
          if (p.type !== 'closure_param') continue;
          const param = stamp(el(T.PARAM, doc), p);
          const parts = namedChildren(p);
          if (parts[0]) param.setAttribute('name', text(parts[0]));
          if (parts[1]) param.appendChild(dispatch(parts[1], doc, source));
          paramList.appendChild(param);
        }
        node.appendChild(paramList);
        break;
      }
      case 'return_type': {
        // tree-sitter wraps the real type; unwrap it as walkFnDecl does.
        const inner = namedChildren(child)[0];
        if (inner) node.appendChild(dispatch(inner, doc, source));
        break;
      }
      default: {
        const ir = dispatch(child, doc, source);
        if (ir) node.appendChild(ir);
      }
    }
  }
  // An empty parameter list is still a parameter list — downstream passes read
  // it positionally, so synthesise one when the source wrote `cl() { … }`.
  if (!node.querySelector(':scope > ir-param-list')) {
    node.insertBefore(stamp(el(T.PARAM_LIST, doc), n), node.firstChild);
  }
  return node;
}

function walkOptionalOperand(tag, n, doc, source, dispatch) {
  const node = stamp(el(tag, doc), n);
  const operand = namedChildren(n)[0];
  if (operand) node.appendChild(dispatch(operand, doc, source));
  return node;
}

export function walkAwaitExpr(n, doc, source, dispatch) {
  return walkOptionalOperand(T.AWAIT, n, doc, source, dispatch);
}

export function walkReturnExpr(n, doc, source, dispatch) {
  return walkOptionalOperand(T.RETURN, n, doc, source, dispatch);
}

export function walkBreakExpr(n, doc, source, dispatch) {
  return stamp(el(T.BREAK, doc), n);
}

export function walkContinueExpr(n, doc, source, dispatch) {
  return walkOptionalOperand(T.CONTINUE, n, doc, source, dispatch);
}

export function walkDeferExpr(n, doc, source, dispatch) {
  return walkOptionalOperand(T.DEFER, n, doc, source, dispatch);
}

export function walkYieldExpr(n, doc, source, dispatch) {
  return walkOptionalOperand(T.YIELD, n, doc, source, dispatch);
}

export function walkFatalExpr(n, doc, source, dispatch) {
  return stamp(el(T.FATAL, doc), n);
}

export function walkPruneExpr(n, doc, source, dispatch) {
  return stamp(el(T.PRUNE, doc), n);
}

export function walkAssertExpr(n, doc, source, dispatch) {
  return walkOptionalOperand(T.ASSERT, n, doc, source, dispatch);
}

export function walkStructInit(n, doc, source, dispatch, implicit) {
  const node = stamp(el(T.STRUCT_INIT, doc), n);
  if (implicit) node.setAttribute('implicit', 'true');
  const children = namedChildren(n);
  let i = 0;
  if (!implicit && children[i] && (children[i].type === 'type_ident' || children[i].type === 'qualified_type_ref')) {
    node.setAttribute('type-name', text(children[i]));
    i++;
  }
  for (; i < children.length; i++) {
    if (children[i].type === 'field_init') node.appendChild(walkFieldInit(children[i], doc, source, dispatch));
  }
  return node;
}

export function walkTupleExpr(n, doc, source, dispatch) {
  return walkSequence(el(T.TUPLE, doc), n, doc, source, dispatch);
}

export function walkArrayExpr(n, doc, source, dispatch) {
  return walkSequence(el(T.ARRAY_LIT, doc), n, doc, source, dispatch);
}

function walkSequence(node, n, doc, source, dispatch) {
  stamp(node, n);
  for (const child of namedChildren(n)) {
    const value = dispatch(child, doc, source);
    if (value) node.appendChild(value);
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
    node.setAttribute('data-body-start', n.startIndex + bodyOffset);
    node.setAttribute('data-body-end', n.startIndex + bodyEndOffset + 2);
    node.setAttribute('data-body-inner-start', n.startIndex + bodyOffset + 2);
    node.setAttribute('data-body-inner-end', n.startIndex + bodyEndOffset);
  }
  return node;
}
