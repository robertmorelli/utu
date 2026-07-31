import { cloneGraphSubtree, createSyntheticNode, replaceNodeMeta, sourceId } from './ir-helpers.js';
import { instantiatedModuleName, recordInstantiation } from './module-names.js';
import { hoistModule } from './hoist-modules.js';
import { lowerPipesIn } from './lower-pipe.js';
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';

// instantiate-modules.js — Pass 3
//
// instantiateModules(doc) → void
//
// Handles all remaining `<ir-using>` nodes (all within-file after pass 2),
// then auto-instantiates any modules referenced inline without a prior using.
//
// Sweep 1 — emit concrete module copies from explicit usings:
//   using M[T1,T2] |Alias|  → clone M, substitute T1/T2 throughout, rename to Alias
//   using M |Alias|          → clone M, rename to Alias
//   using M                  → no-op (module already in tree by name), remove node
//
// Sweep 1b — inline auto-instantiation:
//   ir-type-inst[module="M"] with type args  → derive mangled name M__T1__T2,
//     instantiate once (if not already done), rewrite to ir-type-ref[name="M__T1__T2"]
//   ir-mod-call[module="M"] with type args   → same instantiation, rewrite to ir-call
//
// Sweep 2 — cleanup:
//   Remove all <ir-module> nodes that still carry <ir-module-params> — they
//   were templates and every instantiation of them has already been emitted.
//   One removal, regardless of how many instantiations were produced.

/**
 * @param {Document} doc - the merged linkedom document from pass 2
 * @param {object} [opts]
 * @param {boolean} [opts.debugAssertions]
 */
export function instantiateModules(doc, { debugAssertions = false, graph = null } = {}) {
  const root = doc.body.firstChild; // <ir-source-file>
  if (!root) return;

  // Nested modules are a parse error — catch them early with a clear message.
  const nested = root.querySelector('ir-module ir-module');
  if (nested) throw new Error(`Nested module '${nested.getAttribute('name')}' is not allowed`);

  const findModule = name => graph?.modules.get(name) ?? root.querySelector(`ir-module[name="${name}"]`);
  const requests = (...tags) => graph
    ? [...graph.requests.values()].map(fact => fact.node)
      .filter(node => tags.includes(node.localName) && root.contains(node))
    : [...root.querySelectorAll(tags.join(', '))];

  // ── Sweep 1: process all ir-using nodes ───────────────────────────────────
  for (const using of requests('ir-using')) {
    const moduleName = using.getAttribute('module');
    const alias      = using.getAttribute('alias');
    const typeArgsEl = using.querySelector(':scope > ir-type-args');

    // No module name means the node is malformed — just drop it.
    if (!moduleName) { using.remove(); continue; }

    const needsCopy = alias || typeArgsEl;
    if (!needsCopy) {
      // Plain `using M` — module is already in scope, nothing to produce.
      using.remove();
      continue;
    }

    const srcModule = findModule(moduleName);
    if (!srcModule) {
      graph?.fail(using, 'unknown-module', `Module '${moduleName}' not found`, { module: moduleName });
      throw new Error(`Module '${moduleName}' not found during instantiation`);
    }
    const args = typeArgsEl ? [...typeArgsEl.children] : null;
    if (args && !validModuleArity(using, srcModule, args)) {
      using.remove();
      continue;
    }
    // A typed `using` is a transparent alias for the same canonical
    // instantiation produced by inline `M[T]`, not a second nominal heap type.
    const concreteName = args ? mangleName(moduleName, args) : alias;
    if (args && alias) rewriteModuleAlias(root, using, alias, concreteName);
    if (args && !alias) rewriteOpenUsing(root, using, srcModule, concreteName);
    if (!hasConcreteDecl(root, concreteName)) {
      const clone = materializeModule(srcModule, using, root, graph, {
        from: moduleName, as: concreteName, args,
        kind: typeArgsEl ? 'module-instantiation' : 'module-alias',
        record: Boolean(args),
      });
      root.insertBefore(clone, using);
      if (!clone.querySelector(':scope > ir-module-params')) {
        lowerPipesIn(clone);
        hoistModule(clone, root, graph);
      }
    }
    using.remove();
  }

  // ── Sweep 1b: inline auto-instantiation ──────────────────────────────────
  // Collect every ir-type-inst and ir-mod-call that references a parameterised
  // module and instantiate it on-demand using a deterministic mangled name.
  // This handles `Array[I32]` used directly in types and expressions without
  // a prior explicit `using Array[I32] |Alias|`.

  // First pass: collect unique (moduleName, concreteTypeNodes[]) combos.
  const inlineInsts = new Map(); // mangled name → { moduleName, typeArgEls }
  for (const node of requests('ir-type-inst', 'ir-mod-call')) {
    const spec = inlineSpec(node);
    const source = spec && findModule(spec.moduleName);
    if (!spec || !source?.querySelector('ir-module-params')) continue;
    if (!validModuleArity(node, source, spec.typeArgEls)) continue;
    if (!inlineInsts.has(spec.mangled)) inlineInsts.set(spec.mangled, { ...spec, site: node });
  }

  // Second pass: instantiate each unique combo (skip if already exists from sweep 1).
  for (const [mangled, { moduleName, typeArgEls, site }] of inlineInsts) {
    if (findModule(mangled)) continue;
    const srcModule = findModule(moduleName);
    if (!srcModule) {
      graph?.fail(site, 'unknown-module', `Module '${moduleName}' not found`, { module: moduleName });
      throw new Error(`Module '${moduleName}' not found during inline instantiation`);
    }
    const clone = materializeModule(srcModule, site, root, graph, {
      from: moduleName, as: mangled, args: typeArgEls,
      kind: 'inline-module-instantiation', record: true,
    });
    root.insertBefore(clone, root.firstChild);
    lowerPipesIn(clone);
    hoistModule(clone, root, graph);
  }

  // Third pass: rewrite inline type and call requests to their concrete names.
  for (const node of requests('ir-type-inst', 'ir-mod-call')) {
    const spec = inlineSpec(node);
    if (!spec || (!findModule(spec.mangled) && !hasConcreteDecl(root, spec.mangled))) continue;
    if (node.localName === 'ir-type-inst') rewriteInlineType(node, spec.mangled);
    else rewriteInlineCall(node, spec.mangled);
  }
  rewriteConcreteQualifiedTypes(root);

  // ── Sweep 2: remove parameterised template modules ────────────────────────
  // Select every ir-module that still has an ir-module-params child.
  // These were never directly usable — only their instantiations matter.
  for (const mod of [...root.querySelectorAll('ir-module:has(ir-module-params)')]) {
    mod.remove();
  }

  if (debugAssertions) assertInstantiateModules(doc);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validModuleArity(site, module, args) {
  const expected = module.querySelectorAll(':scope > ir-module-params > ir-module-param').length;
  if (args.length === expected) return true;
  const name = module.getAttribute('name') ?? site.getAttribute('module') ?? 'module';
  stampDiagnostic(site, DIAGNOSTIC_KINDS.INVALID_MODULE_ARITY,
    `Module '${name}' expects ${expected} type argument(s), got ${args.length}`,
    { module: name, expected, actual: args.length });
  return false;
}

function inlineSpec(node) {
  const moduleName = node.getAttribute('module') ?? namedModuleName(node);
  const typeArgEls = [...(node.querySelector(':scope > ir-type-args')?.children ?? [])];
  return moduleName && typeArgEls.length
    ? { moduleName, typeArgEls, mangled: mangleName(moduleName, typeArgEls) }
    : null;
}

function rewriteOpenUsing(root, using, sourceModule, concreteName) {
  const members = new Map([...sourceModule.querySelectorAll(':scope > [name]')]
    .map(node => [node.getAttribute('name'), `${concreteName}__${node.getAttribute('name')}`]));
  const freeNames = new Map([...sourceModule.querySelectorAll(':scope > ir-fn > ir-fn-name[kind="free"]')]
    .map(node => [node.getAttribute('name'), `${concreteName}__${node.getAttribute('name')}`]));
  for (const ref of root.querySelectorAll('ir-type-ref')) {
    if (sourceModule.contains(ref) || using.contains(ref)) continue;
    const name = members.get(ref.getAttribute('name'));
    if (name) ref.setAttribute('name', name);
  }
  for (const node of root.querySelectorAll('[type-name]')) {
    if (sourceModule.contains(node) || using.contains(node)) continue;
    const name = members.get(node.getAttribute('type-name'));
    if (name) node.setAttribute('type-name', name);
  }
  for (const ident of root.querySelectorAll('ir-ident')) {
    if (sourceModule.contains(ident) || using.contains(ident)) continue;
    const name = freeNames.get(ident.getAttribute('name'));
    if (name) ident.setAttribute('name', name);
  }
}

function rewriteModuleAlias(root, using, alias, concreteName) {
  for (const qualified of root.querySelectorAll('ir-type-qualified')) {
    if (using.contains(qualified)) continue;
    const owner = qualified.firstElementChild;
    const rawOwner = owner?.getAttribute('name') ?? owner?.getAttribute('raw');
    if (rawOwner !== alias) continue;
    owner.setAttribute('name', concreteName);
    qualified.setAttribute('raw', qualified.getAttribute('raw')?.replace(alias, concreteName) ?? concreteName);
  }
  for (const ident of root.querySelectorAll(`ir-ident[name="${alias}"]`)) {
    if (!using.contains(ident)) ident.setAttribute('name', concreteName);
  }
  for (const node of root.querySelectorAll(`ir-type-inst[module="${alias}"], ir-mod-call[module="${alias}"]`)) {
    if (!using.contains(node)) node.setAttribute('module', concreteName);
  }
}

function rewriteConcreteQualifiedTypes(root) {
  // The inner `M[T]` of `M[T].Type` is rewritten only after its concrete
  // module has already been hoisted. Resolve the remaining outer qualifier
  // against the declarations produced by that hoist.
  for (const qualified of [...root.querySelectorAll('ir-type-qualified')]) {
    const owner = qualified.firstElementChild?.getAttribute('name');
    const member = qualified.getAttribute('type-name');
    if (!owner || !member) continue;
    const name = `${owner}__${member}`;
    if (!hasConcreteDecl(root, name)) continue;
    const ref = replaceNodeMeta(qualified.ownerDocument.createElement('ir-type-ref'), qualified,
      'instantiate-modules', 'concrete-qualified-type');
    ref.setAttribute('name', name);
    qualified.replaceWith(ref);
  }
}

function hasConcreteDecl(root, name) {
  return root.querySelector(`ir-struct[name="${name}"], ir-enum[name="${name}"], ir-type-def[name="${name}"]`);
}

function rewriteInlineType(node, name) {
  const displayName = typeNodeToDisplayText(node);
  const ref = replaceNodeMeta(node.ownerDocument.createElement('ir-type-ref'), node, 'instantiate-modules', 'inline-type-inst');
  ref.setAttribute('name', name);
  ref.dataset.displayName = displayName;
  node.replaceWith(ref);
}

function rewriteInlineCall(node, type) {
  const doc = node.ownerDocument;
  const call = replaceNodeMeta(doc.createElement('ir-call'), node, 'instantiate-modules', 'inline-mod-call');
  const callee = createSyntheticNode(doc, 'ir-type-member', node, 'instantiate-modules', 'inline-mod-callee');
  const method = [...node.querySelectorAll(':scope > ir-ident, :scope > ir-fn-name')].at(-1)?.getAttribute('name');
  callee.setAttribute('type', type);
  callee.setAttribute('method', method ?? '');
  for (const key of ['methodStart', 'methodEnd']) if (node.dataset[key]) callee.dataset[key] = node.dataset[key];
  call.appendChild(callee);
  const args = node.querySelector('ir-arg-list');
  if (args) {
    const clone = cloneGraphSubtree(args);
    call.appendChild(clone);
  }
  node.replaceWith(call);
}

function materializeModule(source, cause, root, graph, { from, as, args, kind, record = false }) {
  const clone = cloneGraphSubtree(source);
  Object.assign(clone.dataset, {
    synthetic: 'true', rewritePass: 'instantiate-modules', rewriteKind: kind,
    rewriteOf: sourceId(source), instantiatedFrom: from,
  });
  if (as) clone.dataset.instantiatedAs = as;
  if (args) {
    const params = [...clone.querySelectorAll('ir-module-param')].map(node => node.getAttribute('name'));
    substituteTypeParams(clone, params, args, graph);
    clone.querySelector('ir-module-params')?.remove();
    if (record) {
      const names = args.map(typeNodeToText);
      const displayNames = args.map(typeNodeToDisplayText);
      recordInstantiation(clone, from, names, displayNames);
      for (const decl of clone.querySelectorAll(':scope > ir-type-def, :scope > ir-struct, :scope > ir-enum')) {
        if (decl.getAttribute('name') === '&') recordInstantiation(decl, from, names, displayNames);
      }
    }
  }
  if (as) clone.setAttribute('name', as);
  graph?.resolve(cause, source);
  graph?.registerModule(clone, cause, kind);
  return clone;
}

/**
 * Walk `node`'s subtree and replace every `<ir-type-ref>` whose name matches
 * a type parameter with a clone of the corresponding concrete type node.
 *
 * @param {Element}   node          - root of the module clone
 * @param {string[]}  paramNames    - e.g. ['P1', 'P2']
 * @param {Element[]} concreteTypes - parallel array of concrete ir type nodes
 */
function substituteTypeParams(node, paramNames, concreteTypes, graph = null) {
  if (paramNames.length === 0) return;
  // ir-type-ref — P used as a plain type reference
  for (const ref of [...node.querySelectorAll('ir-type-ref')]) {
    const idx = paramNames.indexOf(ref.getAttribute('name'));
    if (idx < 0) continue;
    const clone = cloneGraphSubtree(concreteTypes[idx]);
    graph?.edge('substitutes', clone, concreteTypes[idx], { parameter: paramNames[idx], source: sourceId(ref) });
    ref.replaceWith(clone);
  }
  // ir-type-inst[module="P"] — P used as a module reference (e.g. P[I32])
  for (const inst of [...node.querySelectorAll('ir-type-inst')]) {
    const idx = paramNames.indexOf(inst.getAttribute('module'));
    if (idx < 0) continue;
    const clone = cloneGraphSubtree(concreteTypes[idx]);
    graph?.edge('substitutes', clone, concreteTypes[idx], { parameter: paramNames[idx], source: sourceId(inst) });
    inst.replaceWith(clone);
  }
  // ir-dsl[body] inside ir-type-def — the body string may embed type param
  // names (e.g. elem="T1"). Replace them with the concrete type's text repr.
  for (const dsl of [...node.querySelectorAll('ir-type-def ir-dsl')]) {
    let body = dsl.getAttribute('body') ?? '';
    for (let i = 0; i < paramNames.length; i++) {
      body = body.replaceAll(paramNames[i], typeNodeToText(concreteTypes[i]));
    }
    dsl.setAttribute('body', body);
  }
}

// The naming convention lives in module-names.js; this only supplies the
// argument spellings.
function mangleName(moduleName, typeArgEls) {
  return instantiatedModuleName(moduleName, typeArgEls.map(typeNodeToText));
}

// Extract the module name from an ir-mod-call node's first identifier-like child.
function namedModuleName(node) {
  const first = node.firstElementChild;
  return first?.getAttribute('name') ?? first?.getAttribute('raw') ?? null;
}

// Produce a short text name for a concrete type node (for DSL body substitution).
function typeNodeToDisplayText(node) {
  switch (node.localName) {
    case 'ir-type-ref': return node.dataset.displayName ?? node.getAttribute('name') ?? 'unknown';
    case 'ir-type-inst': {
      const mod = node.getAttribute('module') ?? '';
      const args = typeArgChildren(node).map(typeNodeToDisplayText);
      return args.length ? `${mod}[${args.join(', ')}]` : mod;
    }
    case 'ir-type-nullable': return `?${typeNodeToDisplayText(node.firstElementChild)}`;
    case 'ir-type-void': return 'void';
    default: return node.dataset.displayName ?? node.getAttribute('name') ?? node.localName;
  }
}

function typeNodeToText(node) {
  switch (node.localName) {
    case 'ir-type-ref':      return node.getAttribute('name') ?? 'unknown';
    case 'ir-type-inst': {
      // Descend through the ir-type-args wrapper — mapping the wrapper itself
      // yielded the literal text "ir-type-args" — and spell the result with the
      // mangled form, since that is the name the nested instantiation actually
      // hoists to. `Promise[Array[I32]]` must reach `Promise__Array__I32`, not
      // `Promise__Array[ir-type-args]`.
      const mod = node.getAttribute('module') ?? '';
      const args = typeArgChildren(node).map(typeNodeToText);
      return args.length ? instantiatedModuleName(mod, args) : mod;
    }
    case 'ir-type-nullable': return `?${typeNodeToText(node.firstElementChild)}`;
    case 'ir-type-void':     return 'void';
    default:                 return node.getAttribute('name') ?? node.localName;
  }
}

/** The type arguments of an ir-type-inst, past the ir-type-args wrapper. */
function typeArgChildren(node) {
  const args = node.querySelector(':scope > ir-type-args');
  return [...(args?.children ?? node.children)];
}

function assertInstantiateModules(doc) {
  const root = doc?.body?.firstChild;
  if (!root || root.localName !== 'ir-source-file') {
    throw new Error('pass3: missing ir-source-file root');
  }
  const leftoverUsing = root.querySelector('ir-using');
  if (leftoverUsing) {
    throw new Error('pass3: found ir-using after instantiateModules');
  }
  const templateModule = root.querySelector('ir-module ir-module-params');
  if (templateModule) {
    throw new Error('pass3: found parameterized template module after instantiateModules');
  }
}
