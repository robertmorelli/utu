import { DOMParser } from 'linkedom/worker';
import { treeToIR } from './parse.js';
import { T } from './ir-tags.js';
import { createSyntheticNode } from './ir-helpers.js';

export function createStandardDsls({ parser, createDocument }) {
  return {
    // @wat is first-class but not yet implemented.
    // Return null so expand-dsls skips the node rather than throwing.
    es:  { expand: expandEsDsl, allowResidual: true },
    wat: { expand() { return null; } },
    utu: {
      expand({ body }) {
        const inner = stripDslDelims(body);
        const prefix = 'fn __dsl() void { ';
        const src = `${prefix}${inner}; }`;
        const doc = treeToIR(parser.parse(src), src, createDocument);
        const expr = doc.body.firstChild?.querySelector(':scope > ir-fn > ir-block')?.firstElementChild;
        if (!expr) throw new Error('standard dsls (utu): could not parse DSL body as expression');
        localizeRanges(expr, prefix.length);
        return { node: expr };
      },
    },
    ir: {
      expand({ doc, body }) {
        // Parse the @ir/\...\/ body as XML so that self-closing tags like
        // <ir-lit .../> are honored. HTML mode would silently nest any
        // following siblings inside a non-void custom element, producing
        // malformed IR (e.g. an <ir-ident/> swallowed as a child of <ir-lit/>).
        const inner = stripDslDelims(body).trim();
        const xml = new DOMParser().parseFromString(`<ir-root>${inner}</ir-root>`, 'text/xml');
        const root = xml.documentElement;
        if (!root || root.localName !== 'ir-root') {
          throw new Error('standard dsls (ir): failed to parse IR body');
        }
        if (root.childElementCount !== 1) {
          throw new Error('standard dsls (ir): expected exactly one IR node');
        }
        // importNode adopts the XML node into the destination HTML document
        // so it can be grafted in by expand-dsls.
        const node = doc.importNode(root.firstElementChild, true);
        return { node };
      },
    },
  };
}

function stripDslDelims(body) {
  return body.startsWith('/\\') && body.endsWith('\\/') ? body.slice(2, -2) : body;
}

function expandEsDsl({ doc, node, body, freshName }) {
  if (!node) return null;
  const binding = node.closest(T.GLOBAL) ?? node.closest(T.LET);
  if (!binding || binding.lastElementChild !== node) return null;
  const bindingName = binding.getAttribute('name');
  const typeNode = firstTypeChild(binding);
  if (!bindingName || !typeNode) return null;

  const sig = signatureFromType(typeNode);
  if (!sig) return null;

  const importName = freshName('__es');
  const publicName = sig.isFunction ? bindingName : importName;
  const extern = buildExternFn(doc, node, publicName, sig, importName);
  const bodyText = stripDslDelims(body);
  const result = {
    wasmImports: [{
      key: importName,
      spec: { module: 'es', name: importName, params: sig.params, result: sig.result, localName: publicName },
    }],
    outputFiles: [{
      key: importName,
      path: 'imports.js',
      contents: { module: 'es', field: importName, body: bodyText },
    }],
  };

  if (binding.localName === T.GLOBAL && sig.isFunction) {
    return { ...result, replace: { target: binding, node: extern, kind: 'dsl-es-extern-fn' } };
  }

  const call = buildImportCall(doc, node, publicName);
  if (binding.localName === T.GLOBAL) {
    const wrapper = buildValueWrapper(doc, binding, bindingName, sig.result, call);
    return {
      ...result,
      globals: [{ key: importName, node: extern }],
      replace: { target: binding, node: wrapper, kind: 'dsl-es-value-fn' },
    };
  }

  return {
    ...result,
    globals: [{ key: importName, node: extern }],
    node: call,
  };
}

function firstTypeChild(node) {
  return [...node.children].find(child => child.localName?.startsWith('ir-type-')) ?? null;
}

function signatureFromType(typeNode) {
  if (typeNode.localName === T.TYPE_FN) {
    const children = [...typeNode.children];
    const ret = children[children.length - 1];
    const rawList = children[0]?.localName === 'ir-unknown' && children[0].getAttribute('ts-type') === 'type_list'
      ? children[0].getAttribute('raw')
      : null;
    return {
      isFunction: true,
      params: rawList ? splitTypeList(rawList) : children.slice(0, -1).map(typeNameFromNode).filter(Boolean),
      result: typeNameFromNode(ret) ?? 'void',
    };
  }
  return { isFunction: false, params: [], result: typeNameFromNode(typeNode) };
}

function splitTypeList(raw) {
  return raw.split(',').map(part => part.trim()).filter(Boolean);
}

function typeNameFromNode(typeNode) {
  if (!typeNode) return null;
  switch (typeNode.localName) {
    case T.TYPE_REF: return typeNode.getAttribute('name');
    case T.TYPE_VOID: return 'void';
    case T.TYPE_NULLABLE: {
      const inner = typeNameFromNode(typeNode.firstElementChild);
      return inner ? `?${inner}` : null;
    }
    default: return null;
  }
}

function buildExternFn(doc, site, name, sig, importName) {
  const fn = createSyntheticNode(doc, T.EXTERN_FN, site, 'expand-dsls', 'dsl-es-extern');
  fn.setAttribute('name', name);
  fn.dataset.extern = 'es';
  fn.dataset.importModule = 'es';
  fn.dataset.importName = importName;
  const fnName = createSyntheticNode(doc, T.FN_NAME, site, 'expand-dsls', 'dsl-es-extern-name');
  fnName.setAttribute('name', name);
  fnName.setAttribute('raw', name);
  fnName.setAttribute('kind', 'free');
  fn.appendChild(fnName);
  const params = createSyntheticNode(doc, T.PARAM_LIST, site, 'expand-dsls', 'dsl-es-extern-params');
  sig.params.forEach((type, index) => {
    const param = createSyntheticNode(doc, T.PARAM, site, 'expand-dsls', 'dsl-es-extern-param');
    param.setAttribute('name', `arg${index}`);
    param.appendChild(buildTypeRef(doc, site, type));
    params.appendChild(param);
  });
  fn.appendChild(params);
  fn.appendChild(buildTypeRef(doc, site, sig.result));
  return fn;
}

function buildValueWrapper(doc, site, name, resultType, call) {
  const fn = createSyntheticNode(doc, T.FN, site, 'expand-dsls', 'dsl-es-value-wrapper');
  fn.setAttribute('name', name);
  const fnName = createSyntheticNode(doc, T.FN_NAME, site, 'expand-dsls', 'dsl-es-value-wrapper-name');
  fnName.setAttribute('name', name);
  fnName.setAttribute('raw', name);
  fnName.setAttribute('kind', 'free');
  fn.appendChild(fnName);
  fn.appendChild(createSyntheticNode(doc, T.PARAM_LIST, site, 'expand-dsls', 'dsl-es-value-wrapper-params'));
  fn.appendChild(buildTypeRef(doc, site, resultType));
  const block = createSyntheticNode(doc, T.BLOCK, site, 'expand-dsls', 'dsl-es-value-wrapper-body');
  block.appendChild(call);
  fn.appendChild(block);
  return fn;
}

function buildTypeRef(doc, site, type) {
  if (type === 'void') return createSyntheticNode(doc, T.TYPE_VOID, site, 'expand-dsls', 'dsl-es-type');
  const node = createSyntheticNode(doc, T.TYPE_REF, site, 'expand-dsls', 'dsl-es-type');
  node.setAttribute('name', type);
  return node;
}

function buildImportCall(doc, site, name) {
  const call = createSyntheticNode(doc, T.CALL, site, 'expand-dsls', 'dsl-es-call');
  const callee = createSyntheticNode(doc, T.IDENT, site, 'expand-dsls', 'dsl-es-callee');
  const args = createSyntheticNode(doc, T.ARG_LIST, site, 'expand-dsls', 'dsl-es-args');
  callee.setAttribute('name', name);
  call.appendChild(callee);
  call.appendChild(args);
  return call;
}

function localizeRanges(root, offset) {
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (node.dataset.start != null) node.dataset.start = String(Number(node.dataset.start) - offset);
    if (node.dataset.end != null) node.dataset.end = String(Number(node.dataset.end) - offset);
  }
}
