// parse-decls.js — Declaration walkers for parse phase 1
//
// Each exported walker has signature (n, doc, source, dispatch) → Element.
// Import helpers from parse.js; do NOT import dispatchNode (no circular deps).

import { stamp, el, text, namedChildren, append, walkChildren } from './parse-helpers.js';
import { T } from './ir-tags.js';

function walkModuleDecl(n, doc, source, dispatch) {
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

function walkUsingDecl(n, doc, source, dispatch) {
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

function walkStructDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.STRUCT, doc), n);
  for (const child of namedChildren(n)) {
    switch (child.type) {
      case 'nom_qualifier':   node.appendChild(walkNomQualifier(child, doc, source, dispatch)); break;
      case 'type_ident':      node.setAttribute('name', text(child)); break;
      case 'promoted_type':   node.setAttribute('name', '&'); break;
      case 'impl_list':       node.appendChild(walkImplList(child, doc, source, dispatch)); break;
      case 'field':           node.appendChild(walkField(child, doc, source, dispatch)); break;
    }
  }
  return node;
}

function walkProtoDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.PROTO, doc), n);
  for (const child of namedChildren(n)) {
    switch (child.type) {
      case 'type_ident':      node.setAttribute('name', text(child)); break;
      case 'promoted_type':   node.setAttribute('name', '&'); break;
      default: {
        const ir = dispatch(child, doc, source);
        if (ir) node.appendChild(ir);
      }
    }
  }
  return node;
}

function walkEnumDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.ENUM, doc), n);
  for (const child of namedChildren(n)) {
    switch (child.type) {
      case 'nom_qualifier':   node.appendChild(walkNomQualifier(child, doc, source, dispatch)); break;
      case 'type_ident':      node.setAttribute('name', text(child)); break;
      case 'promoted_type':   node.setAttribute('name', '&'); break;
      case 'impl_list':       node.appendChild(walkImplList(child, doc, source, dispatch)); break;
      case 'variant':         node.appendChild(walkVariant(child, doc, source, dispatch)); break;
    }
  }
  return node;
}

function walkFnDecl(n, doc, source, dispatch) {
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

function walkFnName(n, doc, source, dispatch) {
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

function walkTypeDecl(n, doc, source, dispatch) {
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

function walkGlobalDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.GLOBAL, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  for (const child of children.slice(1)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

function walkExportLibDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.EXPORT_LIB, doc), n);
  append(node, walkChildren(n, doc, source, dispatch));
  return node;
}

function walkExportMainDecl(n, doc, source, dispatch) {
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

function walkTestDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.TEST, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('label', text(children[0]).slice(1, -1));
  if (children[1]) node.appendChild(walkBlock(children[1], doc, source, dispatch));
  return node;
}

function walkBenchDecl(n, doc, source, dispatch) {
  const node = stamp(el(T.BENCH, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('label', text(children[0]).slice(1, -1));
  for (const child of children.slice(1)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

function walkMeasure(n, doc, source, dispatch) {
  const node = stamp(el(T.MEASURE, doc), n);
  const blockN = namedChildren(n)[0];
  if (blockN) node.appendChild(walkBlock(blockN, doc, source, dispatch));
  return node;
}

// ── Sub-declaration helpers ───────────────────────────────────────────────────

function walkNomQualifier(n, doc, source, dispatch) {
  const node = stamp(el(T.NOM_QUALIFIER, doc), n);
  const tags = namedChildren(n).map(c => text(c));
  node.setAttribute('tags', tags.join(','));
  return node;
}

function walkImplList(n, doc, source, dispatch) {
  const node = stamp(el(T.IMPL_LIST, doc), n);
  const impls = namedChildren(n).map(c => text(c));
  node.setAttribute('impls', impls.join(','));
  return node;
}

function walkField(n, doc, source, dispatch) {
  const node = stamp(el(T.FIELD, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

function walkVariant(n, doc, source, dispatch) {
  const node = stamp(el(T.VARIANT, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  for (const child of children.slice(1)) {
    if (child.type === 'field') node.appendChild(walkField(child, doc, source, dispatch));
  }
  return node;
}

function walkSelfParam(n, doc, source, dispatch) {
  const node = stamp(el(T.SELF_PARAM, doc), n);
  const ident = namedChildren(n)[0];
  if (ident) node.setAttribute('name', text(ident));
  return node;
}

function walkParam(n, doc, source, dispatch) {
  const node = stamp(el(T.PARAM, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

function walkParamList(n, doc, source, dispatch) {
  const node = stamp(el(T.PARAM_LIST, doc), n);
  for (const child of namedChildren(n)) {
    if (child.type === 'param') node.appendChild(walkParam(child, doc, source, dispatch));
  }
  return node;
}

function walkModuleParams(n, doc, source, dispatch) {
  const node = stamp(el(T.MODULE_PARAMS, doc), n);
  for (const child of namedChildren(n)) {
    if (child.type === 'module_type_param') node.appendChild(walkModuleParam(child, doc, source, dispatch));
  }
  return node;
}

function walkModuleParam(n, doc, source, dispatch) {
  const node = stamp(el(T.MODULE_PARAM, doc), n);
  node.setAttribute('raw', text(n));
  const raw = text(n).trim();
  if (raw.startsWith('in ')) {
    node.setAttribute('variance', 'in');
    node.setAttribute('name', raw.slice(3));
  } else if (raw.startsWith('out ')) {
    node.setAttribute('variance', 'out');
    node.setAttribute('name', raw.slice(4));
  } else {
    const child = namedChildren(n)[0];
    node.setAttribute('name', child ? text(child) : raw);
  }
  return node;
}

function walkModuleTypeArgList(n, doc, source, dispatch) {
  const wrap = stamp(el('ir-type-args', doc), n);
  for (const child of namedChildren(n)) {
    const ir = dispatch(child, doc, source);
    if (ir) wrap.appendChild(ir);
  }
  return wrap;
}

// ── Protocol members ──────────────────────────────────────────────────────────

function walkProtoGetter(n, doc, source, dispatch) {
  const node = stamp(el(T.PROTO_GET, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

function walkProtoSetter(n, doc, source, dispatch) {
  const node = stamp(el(T.PROTO_SET, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

function walkProtoGetSetter(n, doc, source, dispatch) {
  const node = stamp(el(T.PROTO_GET_SET, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  if (children[1]) node.appendChild(dispatch(children[1], doc, source));
  return node;
}

function walkProtoMethod(n, doc, source, dispatch) {
  const node = stamp(el(T.PROTO_METHOD, doc), n);
  const children = namedChildren(n);
  if (children[0]) node.setAttribute('name', text(children[0]));
  for (const child of children.slice(1)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

// ── Block (shared by decls and exprs) ─────────────────────────────────────────

function walkBlock(n, doc, source, dispatch) {
  const node = stamp(el(T.BLOCK, doc), n);
  for (const child of namedChildren(n)) {
    const ir = dispatch(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

export const walkers = {
  'module_decl':            walkModuleDecl,
  'type_decl':              walkTypeDecl,
  'using_decl':             walkUsingDecl,
  'struct_decl':            walkStructDecl,
  'proto_decl':             walkProtoDecl,
  'enum_decl':              walkEnumDecl,
  'fn_decl':                walkFnDecl,
  'global_decl':            walkGlobalDecl,
  'export_lib_decl':        walkExportLibDecl,
  'export_main_decl':       walkExportMainDecl,
  'test_decl':              walkTestDecl,
  'bench_decl':             walkBenchDecl,
  'measure_decl':           walkMeasure,
  'nom_qualifier':          walkNomQualifier,
  'field':                  walkField,
  'variant':                walkVariant,
  'param':                  walkParam,
  'self_param':             walkSelfParam,
  'proto_getter':           walkProtoGetter,
  'proto_setter':           walkProtoSetter,
  'proto_get_setter':       walkProtoGetSetter,
  'proto_method':           walkProtoMethod,
  'module_type_param_list': walkModuleParams,
  'module_type_param':      walkModuleParam,
  'module_type_arg_list':   walkModuleTypeArgList,
  'param_list':             walkParamList,
  'impl_list':              walkImplList,
  'block':                  walkBlock,
};
