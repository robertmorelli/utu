// parse-exprs-basic.js — literals, calls, members, and operators

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

export function walkLiteral(n, doc, source, dispatch) {
  const node = stamp(el(T.LIT, doc), n);
  if (n.type === 'int_lit') {
    node.setAttribute('kind', 'int');
    node.setAttribute('value', text(n));
    return node;
  }
  if (n.type === 'float_lit') {
    node.setAttribute('kind', 'float');
    node.setAttribute('value', text(n));
    return node;
  }
  if (n.type === 'string_lit') {
    node.setAttribute('kind', 'string');
    node.setAttribute('value', text(n));
    return node;
  }
  if (n.type === 'multiline_string_lit') {
    node.setAttribute('kind', 'string-multi');
    node.setAttribute('value', text(n));
    return node;
  }
  if (n.type === 'bool_lit') {
    node.setAttribute('kind', 'bool');
    node.setAttribute('value', text(n));
    return node;
  }
  if (n.type === 'null_lit') {
    node.setAttribute('kind', 'null');
    node.setAttribute('value', text(n));
    return node;
  }
  const child = namedChildren(n)[0];
  if (!child) {
    const raw = text(n);
    node.setAttribute('kind', raw === 'true' || raw === 'false' ? 'bool' : 'null');
    node.setAttribute('value', raw);
    return node;
  }
  switch (child.type) {
    case 'int_lit':              node.setAttribute('kind', 'int'); break;
    case 'float_lit':            node.setAttribute('kind', 'float'); break;
    case 'string_lit':           node.setAttribute('kind', 'string'); break;
    case 'multiline_string_lit': node.setAttribute('kind', 'string-multi'); break;
    default:                     node.setAttribute('kind', child.type); break;
  }
  node.setAttribute('value', text(child));
  return node;
}

export function walkIdentifier(n, doc, source, dispatch) {
  const node = stamp(el(T.IDENT, doc), n);
  node.setAttribute('name', text(n));
  return node;
}

export function walkParenExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.PAREN, doc), n);
  const child = namedChildren(n)[0];
  if (child) node.appendChild(dispatch(child, doc, source));
  return node;
}

export function walkUnaryExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.UNARY, doc), n);
  const children = namedChildren(n);
  const opN = children.find(c => c.type === 'unary_op');
  if (opN) node.setAttribute('op', text(opN));
  const exprN = children.find(c => c.type !== 'unary_op');
  if (exprN) node.appendChild(dispatch(exprN, doc, source));
  return node;
}

export function walkBinaryExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.BINARY, doc), n);
  const children = namedChildren(n);
  if (children.length >= 2) {
    const lhs = children[0];
    const rhs = children[children.length - 1];
    const op = source.slice(lhs.endIndex, rhs.startIndex).trim();
    node.setAttribute('op', op);
    node.appendChild(dispatch(lhs, doc, source));
    node.appendChild(dispatch(rhs, doc, source));
  }
  return node;
}

export function walkAssignExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.ASSIGN, doc), n);
  const children = namedChildren(n);
  if (children.length >= 2) {
    const lhs = children[0];
    const rhs = children[children.length - 1];
    const op = source.slice(lhs.endIndex, rhs.startIndex).trim();
    node.setAttribute('op', op);
    node.appendChild(dispatch(lhs, doc, source));
    node.appendChild(dispatch(rhs, doc, source));
  }
  return node;
}

export function walkElseExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.ELSE, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

export function walkPipeExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.PIPE, doc), n);
  const children = namedChildren(n);
  // children[0] = lhs expr, children[1] = pipe_target
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  if (children[1]) node.appendChild(walkPipeTarget(children[1], doc, source, dispatch));
  return node;
}

// The argument list is wrapped: pipe_target > pipe_args >
// pipe_args_{with,no}_placeholder > pipe_arg*.  Walking only the target's
// direct children silently drops every argument, which then shows up as a
// bogus arity error at the call site rather than as anything pipe-related.
const PIPE_ARG_WRAPPERS = new Set([
  'pipe_args', 'pipe_args_with_placeholder', 'pipe_args_no_placeholder',
]);

export function walkPipeTarget(n, doc, source, dispatch) {
  const tgt = stamp(el('ir-pipe-target', doc), n);
  // Named children of pipe_target (after _pipe_path is transparent):
  // identifiers/type_idents forming the path, plus the wrapped argument list.
  for (const child of flattenPipeArgs(namedChildren(n))) {
    switch (child.type) {
      case 'identifier':
      case 'type_ident': {
        const seg = stamp(doc.createElement('ir-pipe-seg'), child);
        seg.setAttribute('name', text(child));
        seg.setAttribute('kind', child.type === 'type_ident' ? 'type' : 'ident');
        tgt.appendChild(seg);
        break;
      }
      case 'pipe_arg': {
        const arg = stamp(doc.createElement('ir-pipe-arg'), child);
        // pipe_arg is alias of _expr, so its first named child is the expr
        const inner = namedChildren(child)[0];
        if (inner) arg.appendChild(dispatch(inner, doc, source));
        tgt.appendChild(arg);
        break;
      }
      case 'pipe_arg_placeholder': {
        const ph = stamp(doc.createElement('ir-pipe-placeholder'), child);
        tgt.appendChild(ph);
        break;
      }
      default: {
        const ir = dispatch(child, doc, source);
        if (ir) tgt.appendChild(ir);
      }
    }
  }
  return tgt;
}

/** Splice the contents of any argument-list wrapper into the sibling stream. */
function flattenPipeArgs(children) {
  const out = [];
  for (const child of children) {
    if (PIPE_ARG_WRAPPERS.has(child.type)) out.push(...flattenPipeArgs(namedChildren(child)));
    else out.push(child);
  }
  return out;
}

export function walkCallExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.CALL, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  const argListN = children.find(c => c.type === 'arg_list');
  if (argListN) node.appendChild(walkArgList(argListN, doc, source, dispatch));
  return node;
}

export function walkArgList(n, doc, source, dispatch) {
  const node = stamp(el(T.ARG_LIST, doc), n);
  append(node, walkChildren(n, doc, source, dispatch));
  return node;
}

export function walkTypeMemberExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.TYPE_MEMBER, doc), n);
  node.setAttribute('raw', text(n));
  const children = namedChildren(n);
  if (children.length > 0) {
    const methodNode = children[children.length - 1];
    node.setAttribute('method', text(methodNode));
    node.dataset.methodStart = String(methodNode.startIndex);
    node.dataset.methodEnd = String(methodNode.endIndex);
    for (const child of children.slice(0, -1)) {
      const ir = dispatch(child, doc, source);
      if (ir) node.appendChild(ir);
    }
  }
  return node;
}

export function walkModCallExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.MOD_CALL, doc), n);
  node.setAttribute('raw', text(n));
  const methodNode = [...namedChildren(n)].reverse().find(child => child.type === 'identifier' || child.type === 'fn_name');
  if (methodNode) {
    node.dataset.methodStart = String(methodNode.startIndex);
    node.dataset.methodEnd = String(methodNode.endIndex);
  }
  append(node, walkChildren(n, doc, source, dispatch));
  return node;
}

export function walkFieldExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.FIELD_ACCESS, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  if (children[1]) {
    node.setAttribute('field', text(children[1]));
    node.dataset.fieldStart = String(children[1].startIndex);
    node.dataset.fieldEnd = String(children[1].endIndex);
  }
  return node;
}

export function walkIndexExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.INDEX, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

export function walkSliceExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.SLICE, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  if (children[2]) node.appendChild(dispatch(children[2], doc, source));
  return node;
}

export function walkNullExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.NULL_REF, doc), n);
  const typeN = namedChildren(n)[0];
  if (typeN) node.setAttribute('type-name', text(typeN));
  return node;
}
