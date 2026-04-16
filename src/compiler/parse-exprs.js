// parse-exprs.js — Expression walkers for parse phase 1
//
// Each exported walker has signature (n, doc, source, dispatch) → Element.
// Import helpers from parse.js; do NOT import dispatchNode (no circular deps).

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

function walkLiteral(n, doc, source, dispatch) {
  const node = stamp(el(T.LIT, doc), n);
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

function walkIdentifier(n, doc, source, dispatch) {
  const node = stamp(el(T.IDENT, doc), n);
  node.setAttribute('name', text(n));
  return node;
}

function walkParenExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.PAREN, doc), n);
  const child = namedChildren(n)[0];
  if (child) node.appendChild(dispatch(child, doc, source));
  return node;
}

function walkTupleExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.TUPLE, doc), n);
  append(node, walkChildren(n, doc, source, dispatch));
  return node;
}

function walkUnaryExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.UNARY, doc), n);
  const children = namedChildren(n);
  const opN = children.find(c => c.type === 'unary_op');
  if (opN) node.setAttribute('op', text(opN));
  const exprN = children.find(c => c.type !== 'unary_op');
  if (exprN) node.appendChild(dispatch(exprN, doc, source));
  return node;
}

function walkBinaryExpr(n, doc, source, dispatch) {
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

function walkAssignExpr(n, doc, source, dispatch) {
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

function walkElseExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.ELSE, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

function walkPipeExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.PIPE, doc), n);
  const children = namedChildren(n);
  // children[0] = lhs expr, children[1] = pipe_target
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  if (children[1]) node.appendChild(walkPipeTarget(children[1], doc, source, dispatch));
  return node;
}

function walkPipeTarget(n, doc, source, dispatch) {
  const tgt = stamp(el('ir-pipe-target', doc), n);
  // Named children of pipe_target (after _pipe_path is transparent):
  // identifiers/type_idents forming the path, plus pipe_arg/pipe_arg_placeholder nodes
  for (const child of namedChildren(n)) {
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

function walkCallExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.CALL, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  const argListN = children.find(c => c.type === 'arg_list');
  if (argListN) node.appendChild(walkArgList(argListN, doc, source, dispatch));
  return node;
}

function walkArgList(n, doc, source, dispatch) {
  const node = stamp(el(T.ARG_LIST, doc), n);
  append(node, walkChildren(n, doc, source, dispatch));
  return node;
}

function walkNsCallExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.NS_CALL, doc), n);
  node.setAttribute('raw', text(n));
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('method', text(children[0]));
  const argListN = children.find(c => c.type === 'arg_list');
  if (argListN) node.appendChild(walkArgList(argListN, doc, source, dispatch));
  const raw = text(n);
  const dotIdx = raw.indexOf('.');
  if (dotIdx > 0) node.setAttribute('ns', raw.slice(0, dotIdx));
  return node;
}

function walkTypeMemberExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.TYPE_MEMBER, doc), n);
  node.setAttribute('raw', text(n));
  const children = namedChildren(n);
  if (children.length > 0) {
    node.setAttribute('method', text(children[children.length - 1]));
    for (const child of children.slice(0, -1)) {
      const ir = dispatch(child, doc, source);
      if (ir) node.appendChild(ir);
    }
  }
  return node;
}

function walkModCallExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.MOD_CALL, doc), n);
  node.setAttribute('raw', text(n));
  append(node, walkChildren(n, doc, source, dispatch));
  return node;
}

function walkFieldExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.FIELD_ACCESS, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  if (children[1]) node.setAttribute('field', text(children[1]));
  return node;
}

function walkIndexExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.INDEX, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

function walkSliceExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.SLICE, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  if (children[2]) node.appendChild(dispatch(children[2], doc, source));
  return node;
}

function walkNullExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.NULL_REF, doc), n);
  const typeN = namedChildren(n)[0];
  if (typeN) node.setAttribute('type', text(typeN));
  return node;
}

function walkIfExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.IF, doc), n);
  append(node, walkChildren(n, doc, source, dispatch));
  return node;
}

function walkWhileExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.WHILE, doc), n);
  const children = namedChildren(n);
  for (const child of children) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

function walkForExpr(n, doc, source, dispatch) {
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

function walkForSource(n, doc, source, dispatch) {
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

function walkCapture(n, doc, source, dispatch) {
  const node = stamp(el(T.CAPTURE, doc), n);
  const names = namedChildren(n).map(c => text(c));
  node.setAttribute('names', names.join(','));
  return node;
}

function walkMatchExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.MATCH, doc), n);
  for (const child of namedChildren(n)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

function walkMatchArm(n, doc, source, dispatch) {
  const node = stamp(el(T.MATCH_ARM, doc), n);
  const children = namedChildren(n);
  if (children[0]) {
    node.setAttribute('pattern', text(children[0]));
  }
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

function walkDefaultArm(n, doc, source, dispatch) {
  const node = stamp(el(T.DEFAULT_ARM, doc), n);
  const exprN = namedChildren(n)[0];
  if (exprN) node.appendChild(dispatch(exprN, doc, source));
  return node;
}

function walkAltExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.ALT, doc), n);
  for (const child of namedChildren(n)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

function walkAltArm(n, doc, source, dispatch) {
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

function walkPromoteExpr(n, doc, source, dispatch) {
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

function walkBlockExpr(n, doc, source, dispatch) {
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

function walkBlock(n, doc, source, dispatch) {
  const node = stamp(el(T.BLOCK, doc), n);
  for (const child of namedChildren(n)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

function walkBindExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.LET, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  for (const child of children.slice(1)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

function walkReturnExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.RETURN, doc), n);
  const exprN = namedChildren(n)[0];
  if (exprN) node.appendChild(dispatch(exprN, doc, source));
  return node;
}

function walkBreakExpr(n, doc, source, dispatch) {
  return stamp(el(T.BREAK, doc), n);
}

function walkFatalExpr(n, doc, source, dispatch) {
  return stamp(el(T.FATAL, doc), n);
}

function walkAssertExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.ASSERT, doc), n);
  const exprN = namedChildren(n)[0];
  if (exprN) node.appendChild(dispatch(exprN, doc, source));
  return node;
}

function walkStructInit(n, doc, source, dispatch, implicit) {
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

function walkFieldInit(n, doc, source, dispatch) {
  const node = stamp(el(T.FIELD_INIT, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('field', text(children[0]));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

function walkDslExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.DSL, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  const raw = source.slice(n.startIndex, n.endIndex);
  const bodyOffset = raw.indexOf('\\|');
  const bodyEndOffset = raw.lastIndexOf('|/');
  if (bodyOffset >= 0 && bodyEndOffset >= bodyOffset + 2) {
    node.setAttribute('body', raw.slice(bodyOffset, bodyEndOffset + 2));
    node.dataset.bodyStart = n.startIndex + bodyOffset;
    node.dataset.bodyEnd = n.startIndex + bodyEndOffset + 2;
    node.dataset.bodyInnerStart = n.startIndex + bodyOffset + 2;
    node.dataset.bodyInnerEnd = n.startIndex + bodyEndOffset;
  }
  return node;
}

export const walkers = {
  'literal':                     walkLiteral,
  'identifier':                  walkIdentifier,
  'paren_expr':                  walkParenExpr,
  'tuple_expr':                  walkTupleExpr,
  'unary_expr':                  walkUnaryExpr,
  'binary_expr':                 walkBinaryExpr,
  'assign_expr':                 walkAssignExpr,
  'else_expr':                   walkElseExpr,
  'pipe_expr':                   walkPipeExpr,
  'call_expr':                   walkCallExpr,
  'namespace_call_expr':         walkNsCallExpr,
  'type_member_expr':            walkTypeMemberExpr,
  'promoted_module_call_expr':   walkModCallExpr,
  'field_expr':                  walkFieldExpr,
  'index_expr':                  walkIndexExpr,
  'slice_expr':                  walkSliceExpr,
  'null_expr':                   walkNullExpr,
  'if_expr':                     walkIfExpr,
  'while_expr':                  walkWhileExpr,
  'for_expr':                    walkForExpr,
  'match_expr':                  walkMatchExpr,
  'alt_expr':                    walkAltExpr,
  'promote_expr':                walkPromoteExpr,
  'block_expr':                  walkBlockExpr,
  'block':                       walkBlock,
  'bind_expr':                   walkBindExpr,
  'return_expr':                 walkReturnExpr,
  'break_expr':                  walkBreakExpr,
  'fatal_expr':                  (n, doc, source, dispatch) => walkFatalExpr(n, doc, source, dispatch),
  'assert_expr':                 walkAssertExpr,
  'struct_init':                 (n, doc, source, dispatch) => walkStructInit(n, doc, source, dispatch, false),
  'implicit_struct_init':        (n, doc, source, dispatch) => walkStructInit(n, doc, source, dispatch, true),
  'dsl_expr':                    walkDslExpr,
  'match_arm':                   walkMatchArm,
  'match_default':               walkDefaultArm,
  'alt_arm':                     walkAltArm,
  'alt_default':                 walkDefaultArm,
  'for_source':                  walkForSource,
  'capture':                     walkCapture,
  'field_init':                  walkFieldInit,
  'arg_list':                    walkArgList,
};
