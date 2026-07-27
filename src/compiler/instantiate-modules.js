import { restampSubtree } from './parse.js';
import { createSyntheticNode, replaceNodeMeta, sourceId } from './ir-helpers.js';
import { instantiatedModuleName, recordInstantiation } from './module-names.js';

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
export function instantiateModules(doc, { debugAssertions = false } = {}) {
  const root = doc.body.firstChild; // <ir-source-file>
  if (!root) return;

  // Nested modules are a parse error — catch them early with a clear message.
  const nested = root.querySelector('ir-module ir-module');
  if (nested) throw new Error(`Nested module '${nested.getAttribute('name')}' is not allowed`);

  const findModule = name => root.querySelector(`ir-module[name="${name}"]`);

  // ── Sweep 1: process all ir-using nodes ───────────────────────────────────
  for (const using of [...root.querySelectorAll('ir-using')]) {
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
    if (!srcModule) throw new Error(`Module '${moduleName}' not found during instantiation`);

    // `using M |Alias|` on a parameterized module: clone including ir-module-params
    // so the alias is itself parameterized. `Alias[I64, I64]` will find it by
    // name on the next pass through sweep 1 and instantiate it normally.
    // The original parameterized M is still cleaned up in sweep 2.

    // Preserve the origin file: if srcModule was itself cloned from another
    // file it already carries data-origin-file; otherwise it's from this doc.
    const originFile = srcModule.dataset.originFile ?? root.dataset.file;
    const clone = srcModule.cloneNode(true);
    // Re-stamp ids — cloneNode copies them and they'd collide in the document.
    restampSubtree(clone, originFile);
    clone.dataset.synthetic = 'true';
    clone.dataset.rewritePass = 'instantiate-modules';
    clone.dataset.rewriteKind = typeArgsEl ? 'module-instantiation' : 'module-alias';
    clone.dataset.rewriteOf = srcModule.dataset.originId ?? srcModule.id ?? '';
    clone.dataset.instantiatedVia = using.dataset.originId ?? using.id ?? '';
    clone.dataset.instantiatedFrom = moduleName;
    clone.dataset.instantiatedFromOriginId = srcModule.dataset.originId ?? srcModule.id ?? '';
    if (alias) clone.dataset.instantiatedAs = alias;

    if (typeArgsEl) {
      const paramNames    = [...clone.querySelectorAll('ir-module-param')]
        .map(p => p.getAttribute('name'));
      const concreteTypes = [...typeArgsEl.children];
      // originFile for substituted type nodes: they come from the using
      // statement which lives in the current file.
      substituteTypeParams(clone, paramNames, concreteTypes, root.dataset.file);
    }

    // Only remove params when fully instantiated. A bare alias clone keeps them
    // so downstream `using Alias[T1,T2] |X|` can instantiate it normally.
    if (typeArgsEl) clone.querySelector('ir-module-params')?.remove();
    if (alias) clone.setAttribute('name', alias);

    root.insertBefore(clone, using);
    using.remove();
  }

  // ── Sweep 1b: inline auto-instantiation ──────────────────────────────────
  // Collect every ir-type-inst and ir-mod-call that references a parameterised
  // module and instantiate it on-demand using a deterministic mangled name.
  // This handles `Array[I32]` used directly in types and expressions without
  // a prior explicit `using Array[I32] |Alias|`.

  // First pass: collect unique (moduleName, concreteTypeNodes[]) combos.
  const inlineInsts = new Map(); // mangled name → { moduleName, typeArgEls }
  for (const node of [...root.querySelectorAll('ir-type-inst, ir-mod-call')]) {
    const moduleName = node.getAttribute('module') ??
                       node.querySelector(':scope > ir-ident, :scope > ir-type-ref')?.getAttribute('name');
    if (!moduleName) continue;
    const srcMod = findModule(moduleName);
    if (!srcMod?.querySelector('ir-module-params')) continue; // not parameterised
    const typeArgEls = [...(node.querySelector(':scope > ir-type-args')?.children ?? [])];
    if (typeArgEls.length === 0) continue; // no type args — not an instantiation
    const mangled = mangleName(moduleName, typeArgEls);
    if (!inlineInsts.has(mangled)) inlineInsts.set(mangled, { moduleName, typeArgEls });
  }

  // Second pass: instantiate each unique combo (skip if already exists from sweep 1).
  for (const [mangled, { moduleName, typeArgEls }] of inlineInsts) {
    if (findModule(mangled)) continue; // explicit `using` already produced it
    const srcModule = findModule(moduleName);
    if (!srcModule) throw new Error(`Module '${moduleName}' not found during inline instantiation`);
    const originFile = srcModule.dataset.originFile ?? root.dataset.file;
    const clone = srcModule.cloneNode(true);
    restampSubtree(clone, originFile);
    clone.dataset.synthetic = 'true';
    clone.dataset.rewritePass = 'instantiate-modules';
    clone.dataset.rewriteKind = 'inline-module-instantiation';
    clone.dataset.rewriteOf = srcModule.dataset.originId ?? srcModule.id ?? '';
    clone.dataset.instantiatedFrom = moduleName;
    clone.dataset.instantiatedFromOriginId = srcModule.dataset.originId ?? srcModule.id ?? '';
    clone.dataset.instantiatedAs = mangled;
    // Record the arguments so consumers never have to split the mangled name
    // apart — which is ambiguous once an argument is itself instantiated.
    recordInstantiation(clone, moduleName, typeArgEls.map(typeNodeToText));
    for (const decl of clone.querySelectorAll(':scope > ir-type-def, :scope > ir-struct, :scope > ir-enum')) {
      if (decl.getAttribute('name') === '&') recordInstantiation(decl, moduleName, typeArgEls.map(typeNodeToText));
    }
    clone.dataset.instantiatedAt = nodeOriginId(typeArgEls[0], srcModule);
    const paramNames = [...clone.querySelectorAll('ir-module-param')].map(p => p.getAttribute('name'));
    substituteTypeParams(clone, paramNames, typeArgEls, root.dataset.file);
    clone.querySelector('ir-module-params')?.remove();
    clone.setAttribute('name', mangled);
    root.insertBefore(clone, root.firstChild);
  }

  // Third pass: rewrite inline ir-type-inst → ir-type-ref, ir-mod-call → ir-call.
  for (const node of [...root.querySelectorAll('ir-type-inst')]) {
    const moduleName = node.getAttribute('module');
    if (!moduleName) continue;
    const typeArgEls = [...(node.querySelector(':scope > ir-type-args')?.children ?? [])];
    if (typeArgEls.length === 0) continue;
    const mangled = mangleName(moduleName, typeArgEls);
    if (!findModule(mangled) && !root.querySelector(`ir-struct[name="${mangled}"], ir-enum[name="${mangled}"], ir-type-def[name="${mangled}"]`)) continue;
    const ref = replaceNodeMeta(node.ownerDocument.createElement('ir-type-ref'), node, 'instantiate-modules', 'inline-type-inst');
    ref.setAttribute('name', mangled);
    node.replaceWith(ref);
  }

  for (const node of [...root.querySelectorAll('ir-mod-call')]) {
    const moduleName = node.getAttribute('module') ??
                       namedModuleName(node);
    if (!moduleName) continue;
    const typeArgEls = [...(node.querySelector(':scope > ir-type-args')?.children ?? [])];
    if (typeArgEls.length === 0) continue;
    const mangled = mangleName(moduleName, typeArgEls);
    if (!findModule(mangled) && !root.querySelector(`ir-struct[name="${mangled}"], ir-enum[name="${mangled}"], ir-type-def[name="${mangled}"]`)) continue;
    // Rewrite: ir-mod-call → ir-call with ir-type-member callee
    const doc2 = node.ownerDocument;
    const call   = replaceNodeMeta(doc2.createElement('ir-call'), node, 'instantiate-modules', 'inline-mod-call');
    const callee = createSyntheticNode(doc2, 'ir-type-member', node, 'instantiate-modules', 'inline-mod-callee');
    const args   = node.querySelector('ir-arg-list');
    // The method name is the last identifier child of ir-mod-call.
    const methodName = [...node.querySelectorAll(':scope > ir-ident, :scope > ir-fn-name')].at(-1)?.getAttribute('name');
    callee.setAttribute('type', mangled);
    callee.setAttribute('method', methodName ?? '');
    if (node.dataset.methodStart) callee.dataset.methodStart = node.dataset.methodStart;
    if (node.dataset.methodEnd) callee.dataset.methodEnd = node.dataset.methodEnd;
    call.appendChild(callee);
    if (args) {
      const clone = args.cloneNode(true);
      restampSubtree(clone, args.dataset.originFile);
      call.appendChild(clone);
    }
    node.replaceWith(call);
  }

  // ── Sweep 2: remove parameterised template modules ────────────────────────
  // Select every ir-module that still has an ir-module-params child.
  // These were never directly usable — only their instantiations matter.
  for (const mod of [...root.querySelectorAll('ir-module:has(ir-module-params)')]) {
    mod.remove();
  }

  if (debugAssertions) assertInstantiateModules(doc);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Walk `node`'s subtree and replace every `<ir-type-ref>` whose name matches
 * a type parameter with a clone of the corresponding concrete type node.
 *
 * @param {Element}   node          - root of the module clone
 * @param {string[]}  paramNames    - e.g. ['P1', 'P2']
 * @param {Element[]} concreteTypes - parallel array of concrete ir type nodes
 */
function substituteTypeParams(node, paramNames, concreteTypes, originFile) {
  if (paramNames.length === 0) return;
  // ir-type-ref — P used as a plain type reference
  for (const ref of [...node.querySelectorAll('ir-type-ref')]) {
    const idx = paramNames.indexOf(ref.getAttribute('name'));
    if (idx < 0) continue;
    const clone = concreteTypes[idx].cloneNode(true);
    // Re-stamp: same type arg used in multiple instantiations would collide.
    restampSubtree(clone, originFile);
    clone.dataset.substitutedTypeParam = paramNames[idx];
    clone.dataset.substitutedFrom = concreteTypes[idx].dataset.originId ?? concreteTypes[idx].id ?? '';
    ref.replaceWith(clone);
  }
  // ir-type-inst[module="P"] — P used as a module reference (e.g. P[I32])
  for (const inst of [...node.querySelectorAll('ir-type-inst')]) {
    const idx = paramNames.indexOf(inst.getAttribute('module'));
    if (idx < 0) continue;
    const clone = concreteTypes[idx].cloneNode(true);
    restampSubtree(clone, originFile);
    clone.dataset.substitutedTypeParam = paramNames[idx];
    clone.dataset.substitutedFrom = concreteTypes[idx].dataset.originId ?? concreteTypes[idx].id ?? '';
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
    case 'ir-type-void':     return 'void';
    default:                 return node.getAttribute('name') ?? node.localName;
  }
}

/** The type arguments of an ir-type-inst, past the ir-type-args wrapper. */
function typeArgChildren(node) {
  const args = node.querySelector(':scope > ir-type-args');
  return [...(args?.children ?? node.children)];
}

// First node that has an origin id. `sourceId` owns what "origin id" means.
function nodeOriginId(...nodes) {
  return nodes.map(sourceId).find(Boolean) ?? '';
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
