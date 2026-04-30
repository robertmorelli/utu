// resolve-bindings.js — Pass 6
//
// resolveBindings(doc, typeIndex) → void
//
// Scope-aware descent into every function body. Stamps data-binding-id on
// every ir-ident that resolves to a definition. Unresolved idents get
// data-error="unknown-variable:name".
//
// Scope chain (outermost to innermost):
//   global   — ir-fn, ir-extern-fn, and ir-global declarations
//   fn       — ir-self-param, each ir-param
//   block    — ir-let (added in statement order), ir-capture (for loops)
//   arm      — ir-alt-arm binding, ir-promote binding
//
// data-binding-id values point to:
//   ir-param, ir-self-param, ir-let, ir-capture, ir-fn, ir-extern-fn, ir-global
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';

/**
 * @param {Document} doc
 */
export function resolveBindings(doc) {
  const root = doc.body.firstChild;
  if (!root) return;

  // ── Global scope: top-level fns and globals ───────────────────────────────
  const globalScope = new Map();
  for (const n of root.querySelectorAll(
    ':scope > ir-fn, :scope > ir-extern-fn, :scope > ir-global, ' +
    ':scope > ir-export-lib > ir-fn, :scope > ir-export-lib > ir-global, ' +
    ':scope > ir-export-main > ir-fn, :scope > ir-export-main > ir-global'
  )) {
    // fns are keyed by their short method name for simple ident lookups
    // e.g. `ir-fn[name="Foo.bar"]` is NOT in global scope by "Foo.bar" —
    // method calls go through method resolution (pass 8), not binding lookup.
    // Only free functions (kind="free") land here.
    const fnName = n.querySelector(':scope > ir-fn-name[kind="free"]');
    const key = fnName ? fnName.getAttribute('name') : n.getAttribute('name');
    if (key) globalScope.set(key, n);
  }

  // ── Walk each function body ───────────────────────────────────────────────
  for (const fn of root.querySelectorAll(
    ':scope > ir-fn, :scope > ir-export-lib > ir-fn, :scope > ir-export-main > ir-fn'
  )) {
    const scopes = [globalScope, new Map()]; // fn scope on top of global
    const fnScope = scopes[1];

    const selfParam = fn.querySelector(':scope > ir-self-param');
    if (selfParam) fnScope.set(selfParam.getAttribute('name'), selfParam);

    for (const param of fn.querySelectorAll(':scope > ir-param-list > ir-param')) {
      fnScope.set(param.getAttribute('name'), param);
    }

    const body = fn.querySelector(':scope > ir-block');
    if (body) walkBlock(body, scopes);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lookup(name, scopes) {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const found = scopes[i].get(name);
    if (found) return found;
  }
  return null;
}

function walkBlock(block, scopes) {
  const frame = new Map();
  scopes.push(frame);
  for (const child of block.children) {
    walkNode(child, scopes, frame);
  }
  scopes.pop();
}

function walkNode(node, scopes, frame) {
  switch (node.localName) {
    case 'ir-let': {
      // Walk the init expression first (RHS can't see the name being bound)
      const init = node.lastElementChild;
      if (init) walkNode(init, scopes, frame);
      frame.set(node.getAttribute('name'), node);
      return;
    }
    case 'ir-ident': {
      const name = node.getAttribute('name');
      const decl = lookup(name, scopes);
      if (decl) {
        node.dataset.bindingId = decl.id;
        node.dataset.bindingOriginId = decl.dataset.originId ?? decl.id;
        node.dataset.bindingKind = decl.localName;
        node.dataset.bindingName = decl.getAttribute('name')
          ?? decl.querySelector?.(':scope > ir-fn-name')?.getAttribute('name')
          ?? name;
      }
      else      stampDiagnostic(node, DIAGNOSTIC_KINDS.UNKNOWN_VARIABLE, `Unknown variable '${name}'`, { name });
      return;
    }
    case 'ir-block':
      walkBlock(node, scopes);
      return;
    case 'ir-for': {
      // Walk range sources in current scope, then add capture and walk body
      for (const src of node.querySelectorAll(':scope > ir-for-source')) {
        for (const child of src.children) walkNode(child, scopes, frame);
      }
      const capture = node.querySelector(':scope > ir-capture');
      const body    = node.querySelector(':scope > ir-block');
      if (body) {
        const forFrame = new Map();
        if (capture) {
          for (const name of (capture.getAttribute('names') ?? '').split(',').filter(Boolean)) {
            forFrame.set(name, capture);
          }
        }
        scopes.push(forFrame);
        walkBlock(body, scopes);
        scopes.pop();
      }
      return;
    }
    case 'ir-alt': {
      // Walk scrutinee, then each arm with its optional binding
      const [scrutinee, ...arms] = [...node.children];
      if (scrutinee) walkNode(scrutinee, scopes, frame);
      for (const arm of arms) {
        const binding = arm.getAttribute('binding');
        const armBody = arm.lastElementChild;
        if (binding && armBody) {
          const armFrame = new Map();
          armFrame.set(binding, arm);
          scopes.push(armFrame);
          walkNode(armBody, scopes, armFrame);
          scopes.pop();
        } else if (armBody) {
          walkNode(armBody, scopes, frame);
        }
      }
      return;
    }
    case 'ir-promote': {
      // Walk scrutinee, then arm body with capture binding, then default
      const children = [...node.children];
      if (children[0]) walkNode(children[0], scopes, frame); // scrutinee
      const binding = node.getAttribute('binding');
      // promote-arm and default-arm are children 1 and 2
      if (children[1]) {
        const promFrame = new Map();
        if (binding) promFrame.set(binding, node);
        scopes.push(promFrame);
        walkNode(children[1], scopes, promFrame);
        scopes.pop();
      }
      if (children[2]) walkNode(children[2], scopes, frame); // default arm
      return;
    }
    case 'ir-type-member': {
      const typeNode = node.firstElementChild;
      const args = node.querySelector(':scope > ir-arg-list');
      if (typeNode) walkNode(typeNode, scopes, frame);
      if (args) walkNode(args, scopes, frame);
      return;
    }
    case 'ir-mod-call': {
      const typeArgs = node.querySelector(':scope > ir-type-args');
      const args = node.querySelector(':scope > ir-arg-list');
      if (typeArgs) walkNode(typeArgs, scopes, frame);
      if (args) walkNode(args, scopes, frame);
      return;
    }
    default:
      for (const child of node.children) walkNode(child, scopes, frame);
  }
}
