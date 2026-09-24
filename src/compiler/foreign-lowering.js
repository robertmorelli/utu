import { createSyntheticNode, replaceNodeMeta } from './ir-helpers.js';
import { stampDiagnostic } from './diagnostics.js';
import { accept, contextualType, jsArgument, jsOutput } from './foreign-abi.js';
import { buildTypeRef } from './standard-dsls.js';
const json = JSON.stringify;

/** The type a foreign property or index slot expects from an assigned value. */
export function foreignAssignmentType(graph, node) {
  const [target, value] = [...node.children];
  const getter = graph.slots.get(target)?.foreign;
  if (!getter || !['get', 'index'].includes(getter.kind) || getter.index === undefined) return null;
  return accept(graph, getter.index, getter.prop?.type ?? 'any', value);
}

export function foreignAssignment(graph, node) {
  const [target, value] = [...node.children];
  const getter = graph.slots.get(target)?.foreign;
  if (!getter || !['get', 'index'].includes(getter.kind)) return null;
  if (getter.prop?.readonly) {
    stampDiagnostic(node, 'type-mismatch', `Cannot assign to readonly foreign property '${getter.key ?? 'index'}'`);
    return null;
  }
  const type = foreignAssignmentType(graph, node) ?? getter.result;
  const operator = node.getAttribute('op') ?? '=';
  const access = getter.kind === 'index' ? 'self[key]' : getter.access;
  const input = jsArgument(graph, getter.index, getter.prop?.type ?? 'any', value, 'value', type);
  const assignment = operator === 'xor=' ? `${access} = !!${access} !== !!${input}`
    : `${access} ${{ 'and=': '&&=', 'or=': '||=' }[operator] ?? operator} ${input}`;
  return { kind: 'set', result: 'void', params: [...getter.params, type], args: [...getter.args, value],
    body: `${getter.prologue ?? ''}(${getter.kind === 'index' ? 'self,key,' : getter.root ? '' : 'self,'}value) => { ${assignment}; }` };
}

/** Lower resolved operations only; declarations and unused members produce no code. */
export function lowerForeignOperations(graph, buildExternFn) {
  if (!graph.doc.__utuForeign) return false;
  const doc = graph.doc, root = doc.body.firstChild;
  const imports = JSON.parse(root.dataset.dslImportsJs ?? '{}');
  const wasmImports = JSON.parse(root.dataset.dslWasmImports ?? '[]');
  const outputFiles = JSON.parse(root.dataset.dslOutputFiles ?? '[]');
  const interned = new Map();
  // Alt subjects may themselves be foreign operations replaced below.
  const subjects = new Map([...doc.querySelectorAll('ir-alt')].map(alt => [alt, graph.slots.get(alt.firstElementChild)?.actual]));
  const plans = [];
  const replacements = new Map();
  for (const [node, slot] of graph.slots) {
    if (slot.foreignError) {
      node.dataset.foreignError = slot.foreignError;
      stampDiagnostic(node, 'type-mismatch', slot.foreignError);
    }
    const boxed = doc.__utuForeign.values.get(slot.actual)?.ref?.boxed;
    if (boxed && contextualType(graph, node) === boxed) {
      plans.push([node, { kind: 'unbox', result: boxed, params: [slot.actual], args: [node], body: `(value) => ${jsOutput('value', boxed)}` }]);
    }
    let op = node.localName === 'ir-assign' ? foreignAssignment(graph, node) : slot.foreign;
    if (!op) continue;
    if (['get', 'index'].includes(op.kind) && node === node.parentElement?.firstElementChild
        && ['ir-call', 'ir-assign'].includes(node.parentElement.localName)) continue;
    // `Pkg.Shape.Square` folds to a literal; the enum object is never read.
    if (node === node.parentElement?.firstElementChild && graph.slots.get(node.parentElement)?.foreign?.kind === 'constant') continue;
    plans.push([node, op]);
  }
  // Host references share one Wasm representation, so parameters are erased to
  // the dynamic host type: `el.append(a, b)` is one import for every element type.
  const dynamic = doc.__utuForeign.type(0, 'any', graph);
  const foreign = type => graph.typeIndex.get(type.replace(/^\?/, ''))?.foreign;
  const erase = type => foreign(type) ? `?${dynamic}` : type;
  const intern = (op, site) => {
    op = { ...op, params: op.params.map(erase),
      result: foreign(op.result) ? `${op.result.startsWith('?') ? '?' : ''}${dynamic}` : op.result };
    const key = json([op.params, op.result, op.body]);
    let name = interned.get(key);
    if (!name) {
      name = `__foreign_${interned.size}`;
      interned.set(key, name);
      root.appendChild(buildExternFn(doc, site, name, { params: op.params, result: op.result }, name));
      imports.es ??= {}; imports.es[name] = op.body;
      wasmImports.push({ key: name, spec: { module: 'es', name, params: op.params, result: op.result, localName: name } });
      outputFiles.push({ key: name, path: 'imports.js', contents: { module: 'es', field: name, body: op.body } });
    }
    return name;
  };
  // Descendants move into the replacement calls before their parents consume them.
  for (const [node, op] of plans.reverse()) {
    if (op.kind === 'constant') {
      replacements.set(node, foldConstant(doc, node, op));
      continue;
    }
    const name = intern(op, node);
    const call = replaceNodeMeta(doc.createElement('ir-call'), node, 'foreign-abi', op.kind);
    precise(call, op);
    if (node.dataset.foreignError) call.dataset.foreignError = node.dataset.foreignError;
    const callee = createSyntheticNode(doc, 'ir-ident', node, 'foreign-abi', 'foreign-callee');
    callee.setAttribute('name', name);
    const args = createSyntheticNode(doc, 'ir-arg-list', node, 'foreign-abi', 'foreign-arguments');
    const target = replacements.get(node) ?? node;
    target.replaceWith(call);
    for (const arg of op.args) args.appendChild(replacements.get(arg) ?? arg);
    call.append(callee, args);
    replacements.set(node, call);
  }
  const narrowed = lowerForeignAlts(graph, intern, subjects);
  root.dataset.dslImportsJs = json(imports);
  root.dataset.dslWasmImports = json(wasmImports);
  root.dataset.dslOutputFiles = json(outputFiles);
  return plans.length > 0 || narrowed;
}

/** Declared enum members are compile-time literals, not host reads. */
function foldConstant(doc, node, op) {
  const literal = replaceNodeMeta(doc.createElement('ir-lit'), node, 'foreign-abi', 'constant');
  const text = op.result === 'Str' ? json(op.value) : Number.isInteger(op.value) ? `${op.value}.0` : String(op.value);
  literal.setAttribute('kind', op.result === 'Str' ? 'string' : 'float');
  literal.setAttribute('value', text);
  literal.setAttribute('type-name', op.result);
  node.replaceWith(literal);
  return literal;
}

/**
 * Imports are shared across host types with one representation; each call keeps
 * the declaration-level signature it was resolved with for checking.
 */
function precise(call, op) {
  call.dataset.foreignResult = op.result;
  call.dataset.foreignParams = json(op.params);
  return call;
}

/**
 * `alt value { Browser.HTMLInputElement |input| => a, ~> b }` becomes nested
 * promotes over one interned `instanceof` narrowing import per class.
 */
function lowerForeignAlts(graph, intern, subjects) {
  const abi = graph.doc.__utuForeign, doc = graph.doc;
  const alts = [...doc.querySelectorAll('ir-alt')].filter(alt => alt.querySelector(':scope > ir-alt-arm[data-foreign-class]'));
  for (const alt of alts.reverse()) {
    const [scrutinee, ...rest] = [...alt.children];
    const arms = rest.filter(child => child.localName === 'ir-alt-arm');
    const fallback = rest.find(child => child.localName === 'ir-default-arm');
    const subject = subjects.get(alt);
    const invalid = arms.find(arm => !arm.dataset.foreignClass);
    if (invalid || !subject) {
      stampDiagnostic(invalid ?? alt, 'type-mismatch', 'Every arm of an alt over a host value must name a declared class');
      continue;
    }
    const block = replaceNodeMeta(doc.createElement('ir-block'), alt, 'foreign-abi', 'alt-subject');
    const name = `__alt_${alt.id || 'subject'}`;
    const binding = createSyntheticNode(doc, 'ir-let', alt, 'foreign-abi', 'alt-subject-let');
    binding.setAttribute('name', name);
    binding.append(buildTypeRef(doc, alt, subject), scrutinee);
    let tail = fallback?.lastElementChild ?? createSyntheticNode(doc, 'ir-block', alt, 'foreign-abi', 'alt-no-match');
    for (const arm of arms.reverse()) {
      const index = Number(arm.dataset.foreignIndex), className = arm.dataset.foreignClass;
      const schema = abi.schemas[index];
      if (!Object.hasOwn(schema.exports, className)) {
        stampDiagnostic(block, 'type-mismatch', `${schema.prefix}.${className} is only a type; narrowing needs a declared runtime class`);
        continue;
      }
      const alias = `__abi${index}_class_${[...className].map(c => c.codePointAt(0).toString(16)).join('_')}`;
      const constructor = schema.moduleSpecifier ? alias : `globalThis[${json(className)}]`;
      const prologue = schema.moduleSpecifier ? `import { ${json(className)} as ${alias} } from ${json(schema.moduleSpecifier)}; ` : '';
      const variant = arm.getAttribute('variant');
      const op = { params: [subject], result: `?${variant}`,
        body: `${prologue}(value) => value instanceof ${constructor} ? value : null` };
      const test = intern(op, arm);
      const promote = replaceNodeMeta(doc.createElement('ir-promote'), arm, 'foreign-abi', 'alt-narrow');
      promote.setAttribute('binding', arm.getAttribute('binding') ?? `__alt_unused_${arm.id}`);
      const call = precise(createSyntheticNode(doc, 'ir-call', arm, 'foreign-abi', 'alt-instanceof'), op);
      const callee = createSyntheticNode(doc, 'ir-ident', arm, 'foreign-abi', 'alt-instanceof-callee');
      callee.setAttribute('name', test);
      const args = createSyntheticNode(doc, 'ir-arg-list', arm, 'foreign-abi', 'alt-instanceof-arguments');
      const ref = createSyntheticNode(doc, 'ir-ident', arm, 'foreign-abi', 'alt-subject-ref');
      ref.setAttribute('name', name);
      args.appendChild(ref); call.append(callee, args);
      const then = createSyntheticNode(doc, 'ir-promote-arm', arm, 'foreign-abi', 'alt-arm');
      then.appendChild(arm.lastElementChild);
      const otherwise = createSyntheticNode(doc, 'ir-default-arm', arm, 'foreign-abi', 'alt-default');
      otherwise.appendChild(tail);
      promote.append(call, then, otherwise);
      tail = promote;
    }
    block.append(binding, tail);
    alt.replaceWith(block);
  }
  return alts.length > 0;
}
