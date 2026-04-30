// parse-decls-functions.js — function and operator declaration walkers

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

import { walkBlock, walkParamList, walkSelfParam } from './parse-decls-common.js';

export function walkFnDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.FN, doc), n);
  for (const child of namedChildren(n)) {
    switch (child.type) {
      case 'fn_name': {
        node.setAttribute('name', text(child));
        node.appendChild(walkFnName(child, doc, source, dispatch));
        break;
      }
      case 'self_param':  node.appendChild(walkSelfParam(child, doc, source, dispatch)); break;
      case 'param_list':  node.appendChild(walkParamList(child, doc, source, dispatch)); break;
      case 'return_type': {
        // Tree-sitter wraps the actual return type in a return_type node; unwrap it.
        const inner = namedChildren(child)[0];
        if (inner) node.appendChild(dispatch(inner, doc, source));
        break;
      }
      case 'void_type': {
        // dead-code insurance: return_type wrapper should be caught above
        node.appendChild(stamp(el(T.TYPE_VOID, doc), child));
        break;
      }
      case 'block':       node.appendChild(walkBlock(child, doc, source, dispatch)); break;
      default: {
        const ir = dispatch(child, doc, source);
        if (ir) node.appendChild(ir);
      }
    }
  }
  return node;
}

export function walkFnName(n, doc, source, dispatch) {
  const node = stamp(el(T.FN_NAME, doc), n);
  node.setAttribute('raw', text(n));
  const children = namedChildren(n);
  if (children.length === 1) {
    node.setAttribute('kind', 'free');
    node.setAttribute('name', text(children[0]));
  } else {
    node.setAttribute('kind', 'method');
    node.setAttribute('name', text(children[children.length - 1]));
    const recv = children[0];
    node.setAttribute('receiver', text(recv));
    if (recv.type === 'promoted_type') node.setAttribute('receiver-kind', 'self');
    else node.setAttribute('receiver-kind', 'type');
    if (children.length > 2) {
      for (let i = 1; i < children.length - 1; i++) {
        const ir = dispatch(children[i], doc, source);
        if (ir) node.appendChild(ir);
      }
    }
  }
  return node;
}

export function walkOpDecl(n, doc, source, dispatch) {
  // fn TypeIdent:opName |a, b| ReturnType { ... }
  // Emitted as ir-fn[kind="operator", op="add", receiver="T1", name="T1:add"]
  const node = stamp(el(T.FN, doc), n);
  node.setAttribute('kind', 'operator');
  const children = namedChildren(n);
  // children: receiver(0), opName(1), capture(2), return_type(3), block(4)
  const receiverN = children[0];
  const opNameN   = children[1];
  const captureN  = children[2];
  const returnN = children[3];
  const blockN  = children[4];

  const receiver = receiverN ? text(receiverN) : '';
  const opName   = opNameN   ? text(opNameN)   : '';
  node.setAttribute('name',     `${receiver}:${opName}`);
  node.setAttribute('op',       opName);
  node.setAttribute('receiver', receiver);

  // Synthesise fn-name so hoistModules can rewrite it
  const fnName = stamp(el(T.FN_NAME, doc), n);
  fnName.setAttribute('kind',     'operator');
  fnName.setAttribute('name',     opName);
  fnName.setAttribute('receiver', receiver);
  fnName.setAttribute('raw',      `${receiver}:${opName}`);
  node.appendChild(fnName);

  // Captures → param-list (types resolved to receiver type during type inference)
  if (captureN) {
    const paramList = stamp(el(T.PARAM_LIST, doc), captureN);
    for (const ident of namedChildren(captureN)) {
      const param = stamp(el(T.PARAM, doc), ident);
      param.setAttribute('name', text(ident));
      paramList.appendChild(param);
    }
    node.appendChild(paramList);
  }

  // Return type must be explicit in source.
  // Operator semantics belong to stdlib declarations, not parser defaults.
  const inner = namedChildren(returnN)[0];
  if (inner) node.appendChild(dispatch(inner, doc, source));

  // Block
  if (blockN) node.appendChild(walkBlock(blockN, doc, source, dispatch));

  return node;
}

