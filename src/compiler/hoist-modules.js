// hoist-modules.js — Pass 4
//
// hoistModules(doc) → void
//
// Eliminates the module abstraction entirely. After this pass:
//   - No <ir-module> nodes exist
//   - No <ir-type-self> nodes exist (& resolved to a concrete name)
//   - All declarations are direct children of <ir-source-file>
//   - Names are unique: declarations that were named & get the module name;
//     other declarations inside a module are prefixed (ModuleName__DeclName)
//     to prevent collisions across multiple instantiations
//
// The rest of the compiler can pretend modules never existed.

import { nextNodeId } from './parse.js';

/**
 * @param {Document} doc - linkedom document after passes 1-3
 * @param {object} [opts]
 * @param {boolean} [opts.debugAssertions]
 */
export function hoistModules(doc, { debugAssertions = false } = {}) {
  const root = doc.body.firstChild; // <ir-source-file>
  if (!root) return;

  for (const mod of [...root.querySelectorAll('ir-module')]) {
    const moduleName = mod.getAttribute('name');

    // ── 1. Build renaming map: & → moduleName, everything else → M__name ────
    const renamings = new Map(
      [...mod.children]
        .filter(d => d.getAttribute('name'))
        .map(d => {
          const n = d.getAttribute('name');
          return [n, n === '&' ? moduleName : `${moduleName}__${n}`];
        })
    );

    // ── 2. Replace <ir-type-self> nodes (& as a type reference) ─────────────
    for (const self of [...mod.querySelectorAll('ir-type-self')]) {
      const ref = doc.createElement('ir-type-ref');
      ref.id              = `n${nextNodeId()}`;
      ref.setAttribute('name', moduleName);
      ref.dataset.start      = self.dataset.start ?? '';
      ref.dataset.end        = self.dataset.end   ?? '';
      ref.dataset.originFile = self.dataset.originFile ?? '';
      self.replaceWith(ref);
    }

    // ── 3. Update ir-fn-name receivers and sync ir-fn[name] ──────────────────
    // self receivers (&.method) resolve to moduleName
    for (const fnName of [...mod.querySelectorAll('ir-fn-name[receiver-kind="self"]')]) {
      fnName.setAttribute('receiver', moduleName);
      fnName.removeAttribute('receiver-kind');
      // Sync parent ir-fn[name]: "&.method" → "ModuleName.method"
      const irFn = fnName.parentElement;
      if (irFn) irFn.setAttribute('name', `${moduleName}.${fnName.getAttribute('name')}`);
    }
    // type receivers (Foo.method inside a module) get the prefixed name
    for (const fnName of [...mod.querySelectorAll('ir-fn-name[receiver-kind="type"]')]) {
      const recv    = fnName.getAttribute('receiver');
      const renamed = renamings.get(recv);
      if (renamed) {
        fnName.setAttribute('receiver', renamed);
        fnName.removeAttribute('receiver-kind');
        // Sync parent ir-fn[name]: "Foo.method" → "M__Foo.method"
        const irFn = fnName.parentElement;
        if (irFn) irFn.setAttribute('name', `${renamed}.${fnName.getAttribute('name')}`);
      }
    }
    // free functions: ir-fn[name] is just the short name — prefix it
    for (const fnName of [...mod.querySelectorAll('ir-fn-name[kind="free"]')]) {
      const irFn  = fnName.parentElement;
      const short = fnName.getAttribute('name');
      const prefixed = renamings.get(short);
      if (irFn && prefixed) {
        irFn.setAttribute('name', prefixed);
        fnName.setAttribute('name', prefixed);
      }
    }

    // ── 4. Rename ir-type-ref nodes throughout the subtree ───────────────────
    for (const ref of [...mod.querySelectorAll('ir-type-ref')]) {
      const renamed = renamings.get(ref.getAttribute('name'));
      if (renamed) ref.setAttribute('name', renamed);
    }

    // ── 5. Rename the declaration nodes themselves ────────────────────────────
    for (const decl of [...mod.children]) {
      const renamed = renamings.get(decl.getAttribute('name'));
      if (renamed) decl.setAttribute('name', renamed);
    }

    // ── 6. Hoist children into <ir-source-file> at the module's position ─────
    while (mod.firstChild) root.insertBefore(mod.firstChild, mod);
    mod.remove();
  }

  if (debugAssertions) assertHoistModules(doc);
}

function assertHoistModules(doc) {
  const root = doc?.body?.firstChild;
  if (!root || root.localName !== 'ir-source-file') {
    throw new Error('pass4: missing ir-source-file root');
  }

  for (const sel of [
    'ir-module',
    'ir-using',
    'ir-module-params',
    'ir-module-param',
    'ir-type-self',
  ]) {
    if (root.querySelector(sel)) {
      throw new Error(`pass4: found ${sel} after hoistModules`);
    }
  }

  if (root.querySelector('ir-fn-name[receiver-kind="self"]')) {
    throw new Error('pass4: found unresolved self receiver (receiver-kind="self") after hoistModules');
  }

  const ampNamed = [...root.querySelectorAll('[name]')]
    .find(node => node.getAttribute('name') === '&');
  if (ampNamed) {
    throw new Error('pass4: found unresolved & name after hoistModules');
  }

  const seen = new Set();
  for (const child of [...root.children]) {
    const name = child.getAttribute?.('name');
    if (!name) continue;
    if (seen.has(name)) {
      throw new Error(`pass4: duplicate top-level name '${name}' after hoistModules`);
    }
    seen.add(name);
  }
}
