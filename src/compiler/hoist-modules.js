// Materialize module declarations into the flat source-file namespace.

import { replaceNodeMeta } from './ir-helpers.js';
import { moduleMemberName } from './module-names.js';
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';

export function hoistModules(doc, { debugAssertions = false, graph = null } = {}) {
  const root = doc.body.firstChild;
  if (!root) return;
  const references = indexModuleReferences(root);
  for (const module of [...root.querySelectorAll('ir-module')]) hoistModule(module, root, graph, references);
  diagnoseDuplicateDeclarations(root);
  if (debugAssertions) assertHoistModules(doc);
}

/**
 * References to module members from anywhere in the program, by the module
 * name they mention. Built once per pass, so hoisting each module visits only
 * its own references rather than rescanning the whole program.
 */
function indexModuleReferences(root) {
  const byModule = new Map();
  const add = (name, node) => {
    if (!name) return;
    if (!byModule.has(name)) byModule.set(name, []);
    byModule.get(name).push(node);
  };
  for (const qualified of root.querySelectorAll('ir-type-qualified')) add(qualifiedOwner(qualified), qualified);
  for (const access of root.querySelectorAll('ir-field-access, ir-type-member')) add(access.firstElementChild?.getAttribute('name'), access);
  // `M.Type { … }` and other nodes naming a module's type directly.
  for (const node of root.querySelectorAll('[type-name*="."]')) add(node.getAttribute('type-name').split('.').slice(0, -1).join('.'), node);
  return byModule;
}

function qualifiedOwner(qualified) {
  return qualified.firstElementChild?.getAttribute('name')
    ?? qualified.firstElementChild?.getAttribute('module')
    ?? qualified.getAttribute('raw')?.split('.').slice(0, -1).join('.');
}

/**
 * Rewrite references to `module`'s members inside `subtree` to their hoisted
 * names, for code that arrives after `module` itself was hoisted.
 */
export function rewriteReferencesTo(module, subtree) {
  const moduleName = module.getAttribute('name');
  const renamings = new Map([...module.querySelectorAll(':scope > [name]')]
    .map(node => [node.getAttribute('name'), moduleMemberName(moduleName, node.getAttribute('name'))]));
  rewriteExternalModuleReferences(subtree, module, moduleName, renamings, indexModuleReferences(subtree).get(moduleName) ?? []);
}

export function hoistModule(module, root, graph = null, references = indexModuleReferences(root)) {
  const moduleName = module.getAttribute('name');
  const moduleDisplayName = module.attr('data-display-name') ?? moduleName;
  retainSourceDisplayNames(module, moduleDisplayName);
  const renamings = new Map([...module.querySelectorAll(':scope > [name]')]
    .map(node => {
      const name = node.getAttribute('name');
      return [name, moduleMemberName(moduleName, name)];
    }));

  rewriteExternalModuleReferences(root, module, moduleName, renamings, references.get(moduleName) ?? []);

  for (const self of [...module.querySelectorAll('ir-type-self')]) {
    const ref = replaceNodeMeta(module.ownerDocument.createElement('ir-type-ref'), self, 'hoist-modules', 'type-self');
    ref.setAttribute('name', moduleName);
    ref.setAttribute('data-display-name', moduleDisplayName);
    self.replaceWith(ref);
  }
  const valueNames = new Set([
    ...[...module.querySelectorAll(':scope > ir-global')].map(node => node.getAttribute('name')),
    ...[...module.querySelectorAll(':scope > ir-fn > ir-fn-name[kind="free"]')].map(node => node.getAttribute('name')),
  ]);
  for (const ident of module.querySelectorAll('ir-ident')) {
    const name = ident.getAttribute('name');
    if (valueNames.has(name) && !hasLexicalShadow(ident, name)) rename(ident, renamings);
  }
  for (const nameNode of module.querySelectorAll('ir-fn-name')) renameFunction(nameNode, renamings, moduleName);
  for (const ref of module.querySelectorAll('ir-type-ref')) rename(ref, renamings);
  for (const node of module.querySelectorAll('[type-name]')) {
    const renamed = renamings.get(node.getAttribute('type-name'));
    if (renamed) node.setAttribute('type-name', renamed);
  }
  for (const declaration of module.querySelectorAll(':scope > [name]')) {
    const from = declaration.getAttribute('name');
    rename(declaration, renamings);
    graph?.edge('hoists', module, declaration, { from, name: declaration.getAttribute('name') });
  }
  while (module.firstChild) root.insertBefore(module.firstChild, module);
  module.remove();
}

function retainSourceDisplayNames(module, moduleDisplayName) {
  for (const declaration of module.querySelectorAll(':scope > [name]')) {
    if (declaration.attr('data-display-name')) continue;
    const sourceName = declaration.getAttribute('name');
    if (sourceName === '&') declaration.setAttribute('data-display-name', moduleDisplayName);
  }
  for (const fn of module.querySelectorAll(':scope > ir-fn')) {
    const name = fn.querySelector(':scope > ir-fn-name');
    if (!name) continue;
    const receiver = name.getAttribute('receiver');
    const method = name.getAttribute('name');
    const displayName = receiver === '&' || name.getAttribute('receiver-kind') === 'self'
      ? `${moduleDisplayName}.${method}`
      : receiver ? `${receiver}.${method}` : method;
    fn.setAttribute('data-display-name', displayName);
    name.setAttribute('data-display-name', displayName);
  }
}

export function hasLexicalShadow(ident, name) {
  const fn = ident.closest('ir-fn, ir-closure');
  if (fn?.querySelector(`:scope > ir-param-list > ir-param[name="${name}"], :scope > ir-self-param[name="${name}"]`)) return true;
  for (let node = ident.parentElement; node && node !== fn; node = node.parentElement) {
    if (node.localName !== 'ir-block') continue;
    if (['ir-iterator', 'ir-for'].includes(node.parentElement?.localName)) {
      const names = node.parentElement.querySelector(':scope > ir-capture')?.getAttribute('names')?.split(',') ?? [];
      if (names.includes(name)) return true;
    }
    for (const child of node.children) {
      if (child === ident || child.contains(ident)) break;
      if (child.localName === 'ir-let' && child.getAttribute('name') === name) return true;
    }
  }
  return false;
}

function rewriteExternalModuleReferences(root, module, moduleName, renamings, references) {
  const live = tag => references.filter(node => node.localName === tag && node.isConnected);
  for (const node of references) {
    const typeName = node.getAttribute?.('type-name');
    if (!typeName?.startsWith(`${moduleName}.`) || !node.isConnected || module.contains(node)) continue;
    const renamed = renamings.get(typeName.slice(moduleName.length + 1));
    if (renamed) node.setAttribute('type-name', renamed);
  }
  // `M.Type` is represented as ir-type-qualified until the module's concrete
  // declarations are known. Resolve it while that module is still present;
  // leaving it for linkTypeDecls loses the namespace after hoisting.
  for (const qualified of live('ir-type-qualified')) {
    if (module.contains(qualified) || qualifiedOwner(qualified) !== moduleName) continue;
    const member = qualified.getAttribute('type-name');
    const name = renamings.get(member);
    if (!name) continue;
    const ref = replaceNodeMeta(qualified.ownerDocument.createElement('ir-type-ref'), qualified,
      'hoist-modules', 'qualified-type');
    ref.setAttribute('name', name);
    qualified.replaceWith(ref);
  }

  // Capitalized foreign members are valid expressions. When that grammar form
  // names a native module type, preserve the existing static-method semantics.
  const typeNames = new Set([...module.querySelectorAll(':scope > ir-struct, :scope > ir-enum, :scope > ir-type-def')]
    .map(node => node.getAttribute('name')));
  for (const access of live('ir-field-access')) {
    if (access.firstElementChild?.getAttribute('name') !== moduleName || !typeNames.has(access.getAttribute('field'))) continue;
    const parent = access.parentElement;
    if (parent?.localName !== 'ir-field-access' || parent.firstElementChild !== access) continue;
    const member = replaceNodeMeta(root.ownerDocument.createElement('ir-type-member'), parent, 'hoist-modules', 'qualified-member');
    member.setAttribute('method', parent.getAttribute('field'));
    const type = replaceNodeMeta(root.ownerDocument.createElement('ir-type-ref'), access, 'hoist-modules', 'qualified-type');
    type.setAttribute('name', renamings.get(access.getAttribute('field')));
    member.appendChild(type); parent.replaceWith(member);
  }

  // Lowercase module free calls parse as an ordinary field access (`M.fn`).
  // Turn only known free members into identifiers; value field access remains
  // untouched and is resolved later from its receiver type.
  const globalNames = new Set([...module.querySelectorAll(':scope > ir-global')]
    .map(node => node.getAttribute('name')));
  const freeNames = new Set([
    ...[...module.querySelectorAll(':scope > ir-fn > ir-fn-name[kind="free"]')]
      .map(node => node.getAttribute('name')),
    ...globalNames,
  ].filter(Boolean));
  for (const field of references.filter(node => node.isConnected && (node.localName === 'ir-field-access' || node.localName === 'ir-type-member'))) {
    const isTypeMember = field.localName === 'ir-type-member';
    const member = field.getAttribute(isTypeMember ? 'method' : 'field');
    // Free functions on type modules retain their method-resolution path,
    // including intrinsic inlining. Only globals need this extra rewrite.
    if (isTypeMember && !globalNames.has(member)) continue;
    if (module.contains(field) || !freeNames.has(member)) continue;
    const base = field.firstElementChild;
    if (!['ir-ident', 'ir-type-ref'].includes(base?.localName) || base.getAttribute('name') !== moduleName) continue;
    const ident = replaceNodeMeta(field.ownerDocument.createElement('ir-ident'), field,
      'hoist-modules', 'module-free-member');
    ident.setAttribute('name', renamings.get(member));
    field.replaceWith(ident);
  }
}

function renameFunction(nameNode, renamings, moduleName) {
  const fn = nameNode.parentElement;
  const kind = nameNode.getAttribute('kind');
  if (kind === 'free') {
    const name = renamings.get(nameNode.getAttribute('name'));
    if (name) {
      nameNode.setAttribute('name', name);
      fn?.setAttribute('name', name);
    }
    return;
  }
  const receiver = nameNode.getAttribute('receiver');
  const renamed = nameNode.getAttribute('receiver-kind') === 'self'
    ? (renamings.get(receiver) ?? moduleName)
    : (renamings.get(receiver) ?? (kind === 'operator' ? receiver : null));
  if (renamed == null) return;
  nameNode.setAttribute('receiver', renamed);
  nameNode.removeAttribute('receiver-kind');
  fn?.setAttribute('name', `${renamed}${kind === 'operator' ? ':' : '.'}${nameNode.getAttribute('name')}`);
}

function rename(node, renamings) {
  const name = renamings.get(node.getAttribute('name'));
  if (name) node.setAttribute('name', name);
}

function assertHoistModules(doc) {
  const root = doc?.body?.firstChild;
  if (!root || root.localName !== 'ir-source-file') throw new Error('pass4: missing ir-source-file root');
  for (const selector of ['ir-module', 'ir-using', 'ir-module-params', 'ir-module-param', 'ir-type-self']) {
    if (root.querySelector(selector)) throw new Error(`pass4: found ${selector} after hoistModules`);
  }
  if (root.querySelector('ir-fn-name[receiver-kind="self"]')) {
    throw new Error('pass4: found unresolved self receiver (receiver-kind="self") after hoistModules');
  }
  if ([...root.querySelectorAll('[name]')].some(node => node.getAttribute('name') === '&')) {
    throw new Error('pass4: found unresolved & name after hoistModules');
  }
}

function diagnoseDuplicateDeclarations(root) {
  const seen = new Map();
  for (const child of root.querySelectorAll(':scope > [name]')) {
    const name = child.getAttribute('name');
    if (!name) continue;
    const first = seen.get(name);
    if (!first) { seen.set(name, child); continue; }
    stampDiagnostic(child, DIAGNOSTIC_KINDS.DUPLICATE_DECLARATION,
      `Duplicate top-level declaration '${name}'`, {
        name,
        relatedNodes: [{ node: first, label: `First declaration of '${name}' is here` }],
      });
  }
}
