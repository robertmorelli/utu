// Materialize module declarations into the flat source-file namespace.

import { replaceNodeMeta } from './ir-helpers.js';
import { moduleMemberName } from './module-names.js';
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';

export function hoistModules(doc, { debugAssertions = false, graph = null } = {}) {
  const root = doc.body.firstChild;
  if (!root) return;
  for (const module of [...root.querySelectorAll('ir-module')]) hoistModule(module, root, graph);
  diagnoseDuplicateDeclarations(root);
  if (debugAssertions) assertHoistModules(doc);
}

export function hoistModule(module, root, graph = null) {
  const moduleName = module.getAttribute('name');
  const moduleDisplayName = module.dataset.displayName ?? moduleName;
  retainSourceDisplayNames(module, moduleDisplayName);
  const renamings = new Map([...module.querySelectorAll(':scope > [name]')]
    .map(node => {
      const name = node.getAttribute('name');
      return [name, moduleMemberName(moduleName, name)];
    }));

  rewriteExternalModuleReferences(root, module, moduleName, renamings);

  for (const self of [...module.querySelectorAll('ir-type-self')]) {
    const ref = replaceNodeMeta(module.ownerDocument.createElement('ir-type-ref'), self, 'hoist-modules', 'type-self');
    ref.setAttribute('name', moduleName);
    ref.dataset.displayName = moduleDisplayName;
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
    if (declaration.dataset.displayName) continue;
    const sourceName = declaration.getAttribute('name');
    if (sourceName === '&') declaration.dataset.displayName = moduleDisplayName;
  }
  for (const fn of module.querySelectorAll(':scope > ir-fn')) {
    const name = fn.querySelector(':scope > ir-fn-name');
    if (!name) continue;
    const receiver = name.getAttribute('receiver');
    const method = name.getAttribute('name');
    const displayName = receiver === '&' || name.getAttribute('receiver-kind') === 'self'
      ? `${moduleDisplayName}.${method}`
      : receiver ? `${receiver}.${method}` : method;
    fn.dataset.displayName = displayName;
    name.dataset.displayName = displayName;
  }
}

function hasLexicalShadow(ident, name) {
  const fn = ident.closest('ir-fn, ir-closure');
  if (fn?.querySelector(`:scope > ir-param-list > ir-param[name="${name}"], :scope > ir-self-param[name="${name}"]`)) return true;
  for (let node = ident.parentElement; node && node !== fn; node = node.parentElement) {
    if (node.localName !== 'ir-block') continue;
    for (const child of node.children) {
      if (child === ident || child.contains(ident)) break;
      if (child.localName === 'ir-let' && child.getAttribute('name') === name) return true;
    }
  }
  return false;
}

function rewriteExternalModuleReferences(root, module, moduleName, renamings) {
  // `M.Type` is represented as ir-type-qualified until the module's concrete
  // declarations are known. Resolve it while that module is still present;
  // leaving it for linkTypeDecls loses the namespace after hoisting.
  for (const qualified of [...root.querySelectorAll('ir-type-qualified')]) {
    if (module.contains(qualified)) continue;
    const owner = qualified.firstElementChild?.getAttribute('name')
      ?? qualified.firstElementChild?.getAttribute('module')
      ?? qualified.getAttribute('raw')?.split('.').slice(0, -1).join('.');
    if (owner !== moduleName) continue;
    const member = qualified.getAttribute('type-name');
    const name = renamings.get(member);
    if (!name) continue;
    const ref = replaceNodeMeta(qualified.ownerDocument.createElement('ir-type-ref'), qualified,
      'hoist-modules', 'qualified-type');
    ref.setAttribute('name', name);
    qualified.replaceWith(ref);
  }

  // Lowercase module free calls parse as an ordinary field access (`M.fn`).
  // Turn only known free members into identifiers; value field access remains
  // untouched and is resolved later from its receiver type.
  const freeNames = new Set([...module.querySelectorAll(':scope > ir-fn > ir-fn-name[kind="free"]')]
    .map(node => node.getAttribute('name')).filter(Boolean));
  for (const field of [...root.querySelectorAll('ir-field-access')]) {
    if (module.contains(field) || !freeNames.has(field.getAttribute('field'))) continue;
    const base = field.firstElementChild;
    if (base?.localName !== 'ir-ident' || base.getAttribute('name') !== moduleName) continue;
    const ident = replaceNodeMeta(field.ownerDocument.createElement('ir-ident'), field,
      'hoist-modules', 'module-free-member');
    ident.setAttribute('name', renamings.get(field.getAttribute('field')));
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
