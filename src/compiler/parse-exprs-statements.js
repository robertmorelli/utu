// parse-exprs-statements.js — statement, struct-init, and DSL expression walkers

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

export function walkBindExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.LET, doc), n);
  const children = namedChildren(n);
  if (children[0]) {
    node.setAttribute('name', text(children[0]));
    node.dataset.nameStart = String(children[0].startIndex);
    node.dataset.nameEnd = String(children[0].endIndex);
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

// await p — one operand, the promise.
export function walkAwaitExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.AWAIT, doc), n);
  const inner = namedChildren(n)[0];
  if (inner) node.appendChild(dispatch(inner, doc, source));
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
    node.setAttribute('type-name', text(children[i]));
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
