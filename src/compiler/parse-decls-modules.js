// parse-decls-modules.js — module and using declaration walkers

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

import { walkModuleTypeArgList } from './parse-decls-common.js';

export function walkModuleDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.MODULE, doc), n);
  const nameCh = n.childForFieldName?.('name') ?? namedChildren(n)[0];
  if (nameCh) node.setAttribute('name', text(nameCh));
  for (const child of namedChildren(n)) {
    if (child === nameCh) continue;
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

export function walkUsingDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.USING, doc), n);
  const children = namedChildren(n);
  let i = 0;
  if (children[i] && (children[i].type === 'module_name' || children[i].type === 'identifier' || children[i].type === 'type_ident')) {
    node.setAttribute('module', text(children[i]));
    i++;
  }
  if (children[i] && children[i].type === 'module_type_arg_list') {
    node.appendChild(walkModuleTypeArgList(children[i], doc, source, dispatch));
    i++;
  }
  if (children[i] && children[i].type === 'captured_module_name') {
    const inner = namedChildren(children[i])[0];
    if (inner) node.setAttribute('alias', text(inner));
    i++;
  }
  if (children[i]) {
    if (children[i].type === 'string_lit') {
      node.setAttribute('from', text(children[i]).slice(1, -1));
    } else if (children[i].type === 'platform_path') {
      node.setAttribute('from', text(children[i]));
    }
  }
  return node;
}

