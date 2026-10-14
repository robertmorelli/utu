// parse-exprs-basic.js — literals, calls, members, and operators

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';
import { decodeEscapes } from './string-escapes.js';

const LITERAL_KINDS = new Map([
  ['int_lit', 'int'], ['float_lit', 'float'], ['string_lit', 'string'],
  ['multiline_string_lit', 'string-multi'], ['bool_lit', 'bool'], ['null_lit', 'null'],
]);

export function walkLiteral(n, doc, source, dispatch) {
  const node = stamp(el(T.LIT, doc), n);
  const valueNode = LITERAL_KINDS.has(n.type) ? n : namedChildren(n)[0];
  const value = text(valueNode ?? n);
  const kind = valueNode
    ? (LITERAL_KINDS.get(valueNode.type) ?? valueNode.type)
    : (value === 'true' || value === 'false' ? 'bool' : 'null');
  node.setAttribute('kind', kind);
  node.setAttribute('value', value);
  if (kind === 'string' && decodeEscapes(value.slice(1, -1)) === null) node.setAttribute('data-invalid-escape', 'true');
  return node;
}

/**
 * `text ${e} text` is `"text " + e.to_str() + " text"`: its pieces joined
 * with `+`, left to right, and empty text left out (`${e}` alone is
 * `e.to_str()`). Each call is placed at its expression.
 */
export function walkTemplateString(n, doc, source, dispatch) {
  let joined = null;
  const join = part => {
    if (!joined) { joined = part; return; }
    const sum = stamp(el(T.BINARY, doc), n);
    sum.setAttribute('op', '+');
    append(sum, [joined, part]);
    joined = sum;
  };
  const literal = (value, at) => {
    const node = stamp(el(T.LIT, doc), at);
    node.setAttribute('kind', 'string');
    node.setAttribute('value', JSON.stringify(value));
    return node;
  };
  for (const child of namedChildren(n)) {
    if (/^template_(full|head|middle|tail)$/.test(child.type)) {
      const raw = text(child);
      const value = decodeEscapes(raw.slice(1, raw.endsWith('${') ? -2 : -1));
      if (value === null) {
        const bad = literal('', child);
        bad.setAttribute('data-invalid-escape', 'true');
        join(bad);
      } else if (value) {
        join(literal(value, child));
      }
      continue;
    }
    if (child.type === 'comment') continue;
    const member = stamp(el(T.FIELD_ACCESS, doc), child);
    member.appendChild(dispatch(child, doc, source));
    member.setAttribute('field', 'to_str');
    member.setAttribute('data-field-start', String(child.startIndex));
    member.setAttribute('data-field-end', String(child.endIndex));
    const call = stamp(el(T.CALL, doc), child);
    call.appendChild(member);
    join(call);
  }
  return joined ?? literal('', n);
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

export function walkRangeExpr(n, doc, source, dispatch) {
  const node = stamp(el('ir-range', doc), n);
  node.setAttribute('inclusive', String(n.childForFieldName('kind')?.text === '...'));
  for (const field of ['start', 'end']) {
    const child = n.childForFieldName(field);
    if (child) node.appendChild(dispatch(child, doc, source));
  }
  return node;
}

export function walkUnaryExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.UNARY, doc), n);
  const children = namedChildren(n);
  const opN = children.find(c => c.type === 'unary_op');
  if (opN) node.setAttribute('op', text(opN));
  const exprN = children.find(c => c.type !== 'unary_op');
  const operand = exprN ? dispatch(exprN, doc, source) : null;
  // `-1` and `-1.5` are literals, so they work where only a constant does
  // (global initializers). Hex and binary spellings stay a negation.
  if (node.getAttribute('op') === '-' && operand?.localName === 'ir-lit'
      && ['int', 'float'].includes(operand.getAttribute('kind'))
      && /^[0-9][0-9_]*(\.[0-9_]+)?([eE][+-]?[0-9]+)?$/.test(operand.getAttribute('value') ?? '')) {
    const literal = stamp(el(T.LIT, doc), n);
    for (const attribute of operand.getAttributeNames()) {
      if (!attribute.startsWith('data-') && attribute !== 'id') literal.setAttribute(attribute, operand.getAttribute(attribute));
    }
    literal.setAttribute('value', `-${operand.getAttribute('value')}`);
    return literal;
  }
  if (operand) node.appendChild(operand);
  return node;
}

function walkInfix(tag, n, doc, source, dispatch) {
  const node = stamp(el(tag, doc), n);
  const children = namedChildren(n);
  if (children.length < 2) return node;
  const lhs = children[0];
  const rhs = children.at(-1);
  node.setAttribute('op', source.slice(lhs.endIndex, rhs.startIndex).trim());
  append(node, [dispatch(lhs, doc, source), dispatch(rhs, doc, source)]);
  return node;
}

export function walkBinaryExpr(n, doc, source, dispatch) {
  return walkInfix(T.BINARY, n, doc, source, dispatch);
}

export function walkAssignExpr(n, doc, source, dispatch) {
  return walkInfix(T.ASSIGN, n, doc, source, dispatch);
}

export function walkElseExpr(n, doc, source, dispatch) {
  return walkOperands(T.ELSE, n, doc, source, dispatch);
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
    node.setAttribute('data-method-start', String(methodNode.startIndex));
    node.setAttribute('data-method-end', String(methodNode.endIndex));
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
    node.setAttribute('data-method-start', String(methodNode.startIndex));
    node.setAttribute('data-method-end', String(methodNode.endIndex));
  }
  append(node, walkChildren(n, doc, source, dispatch));
  return node;
}

export function walkOptionalFieldExpr(n, doc, source, dispatch) {
  return walkMember(T.OPTIONAL_FIELD, n, doc, source, dispatch);
}

export function walkFieldExpr(n, doc, source, dispatch) {
  return walkMember(T.FIELD_ACCESS, n, doc, source, dispatch);
}

function walkMember(tag, n, doc, source, dispatch) {
  const node = stamp(el(tag, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.appendChild(dispatch(children[0], doc, source));
  if (children[1]) {
    node.setAttribute('field', text(children[1]));
    node.setAttribute('data-field-start', String(children[1].startIndex));
    node.setAttribute('data-field-end', String(children[1].endIndex));
  }
  return node;
}

function walkOperands(tag, n, doc, source, dispatch) {
  const node = stamp(el(tag, doc), n);
  append(node, namedChildren(n).map(child => dispatch(child, doc, source)));
  return node;
}

export function walkIndexExpr(n, doc, source, dispatch) {
  return walkOperands(T.INDEX, n, doc, source, dispatch);
}

export function walkSliceExpr(n, doc, source, dispatch) {
  return walkOperands(T.SLICE, n, doc, source, dispatch);
}

export function walkNullExpr(n, doc, source, dispatch) {
  const node = stamp(el(T.NULL_REF, doc), n);
  const typeN = namedChildren(n)[0];
  if (typeN) node.setAttribute('type-name', text(typeN));
  return node;
}
