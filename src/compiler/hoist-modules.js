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

import { replaceNodeMeta } from './ir-helpers.js';
import { moduleMemberName } from './module-names.js';

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
      [...mod.querySelectorAll(':scope > [name]')]
        .map(d => {
          const n = d.getAttribute('name');
          return [n, moduleMemberName(moduleName, n)];
        })
    );

    // ── 2. Replace <ir-type-self> nodes (& as a type reference) ─────────────
    for (const self of [...mod.querySelectorAll('ir-type-self')]) {
      const ref = replaceNodeMeta(doc.createElement('ir-type-ref'), self, 'hoist-modules', 'type-self');
      ref.setAttribute('name', moduleName);
      self.replaceWith(ref);
    }

    // ── 3. Rewrite function names ────────────────────────────────────────────
    // Four shapes — `&.method`, `Type.method`, `&:op`, and a free `fn` — that
    // differ only in how the receiver is renamed and how the name recomposes.
    // They were four walks, each re-syncing the parent `ir-fn[name]` by hand;
    // missing that sync silently breaks every lookup keyed on the function
    // name, with no diagnostic anywhere near the cause.
    for (const fnName of [...mod.querySelectorAll('ir-fn-name')]) {
      const irFn = fnName.parentElement;
      const kind = fnName.getAttribute('kind');

      if (kind === 'free') {
        const prefixed = renamings.get(fnName.getAttribute('name'));
        if (!prefixed) continue;
        fnName.setAttribute('name', prefixed);
        irFn?.setAttribute('name', prefixed);
        continue;
      }

      const recvKind = fnName.getAttribute('receiver-kind');
      const recv = fnName.getAttribute('receiver');
      // `&` is in the renaming map as the module's own name. An operator on an
      // unknown receiver keeps it; a method on one is left for diagnostics.
      const renamed = recvKind === 'self'
        ? (renamings.get(recv) ?? moduleName)
        : (renamings.get(recv) ?? (kind === 'operator' ? recv : null));
      if (renamed == null) continue;

      fnName.setAttribute('receiver', renamed);
      if (recvKind) fnName.removeAttribute('receiver-kind');
      const separator = kind === 'operator' ? ':' : '.';
      irFn?.setAttribute('name', `${renamed}${separator}${fnName.getAttribute('name')}`);
    }

    // ── 4. Rename ir-type-ref nodes throughout the subtree ───────────────────
    for (const ref of [...mod.querySelectorAll('ir-type-ref')]) {
      const renamed = renamings.get(ref.getAttribute('name'));
      if (renamed) ref.setAttribute('name', renamed);
    }

    // ── 5. Rename the declaration nodes themselves ────────────────────────────
    for (const decl of mod.querySelectorAll(':scope > [name]')) {
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
  for (const child of root.querySelectorAll(':scope > [name]')) {
    const name = child.getAttribute?.('name');
    if (!name) continue;
    if (seen.has(name)) {
      throw new Error(`pass4: duplicate top-level name '${name}' after hoistModules`);
    }
    seen.add(name);
  }
}
