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
//   closure  — ir-closure params; also a capture boundary (see below)
//
// Which bodies get walked is decided by code-surfaces.js, not here.
//
// data-binding-id values point to:
//   ir-param, ir-self-param, ir-let, ir-capture, ir-fn, ir-extern-fn, ir-global
//
// Free variables: a frame may mark itself as a closure boundary. When an ident
// resolves to a declaration below such a boundary, the binding is free in that
// closure and is recorded as a capture. Nested closures record the same
// binding at every level it crosses, because each one has to thread it inward.
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';
import { bodyOf, createSyntheticNode, paramsOf, selfParamOf } from './ir-helpers.js';
import { forEachCodeBody } from './code-surfaces.js';
import { T } from './ir-tags.js';

/**
 * @param {Document} doc
 */
export function resolveBindings(doc) {
  const root = doc.body.firstChild;
  if (!root) return;

  // ── Global scope: top-level fns and globals ───────────────────────────────
  const globalScope = newFrame();
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
    if (key) globalScope.vars.set(key, n);
  }

  // ── Walk every executable body ────────────────────────────────────────────
  // The surface list lives in code-surfaces.js; a pass that enumerates it by
  // hand eventually forgets one, and does so invisibly under every target but
  // `analysis`.
  forEachCodeBody(root, (body, surface) => {
    const scopes = [globalScope, newFrame()]; // surface scope on top of global
    const surfaceScope = scopes[1];

    // Tests and benches take no parameters; the queries simply find nothing.
    const selfParam = selfParamOf(surface);
    if (selfParam) surfaceScope.vars.set(selfParam.getAttribute('name'), selfParam);

    for (const param of paramsOf(surface)) {
      surfaceScope.vars.set(param.getAttribute('name'), param);
    }

    walkBlock(body, scopes);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function newFrame(closure = null) {
  return { vars: new Map(), closure, caps: closure ? new Map() : null };
}

/** Resolve `name`, returning the declaration and the scope index it came from. */
function lookup(name, scopes) {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const found = scopes[i].vars.get(name);
    if (found) return { decl: found, index: i };
  }
  return null;
}

/**
 * Record `decl` as a free variable of every closure frame that sits above the
 * scope the declaration came from. A binding used two levels deep is captured
 * by both closures — the outer one has to hold it to pass it inward.
 */
function recordCaptures(name, decl, index, scopes) {
  for (let i = index + 1; i < scopes.length; i++) {
    const frame = scopes[i];
    if (frame.closure && !frame.caps.has(name)) frame.caps.set(name, decl);
  }
}

function walkBlock(block, scopes) {
  const frame = newFrame();
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
      frame.vars.set(node.getAttribute('name'), node);
      return;
    }
    case 'ir-ident': {
      const name = node.getAttribute('name');
      const hit = lookup(name, scopes);
      if (hit) {
        const { decl, index } = hit;
        node.dataset.bindingId = decl.id;
        node.dataset.bindingOriginId = decl.dataset.originId ?? decl.id;
        node.dataset.bindingKind = decl.localName;
        node.dataset.bindingName = decl.getAttribute('name')
          ?? decl.querySelector?.(':scope > ir-fn-name')?.getAttribute('name')
          ?? name;
        // Top-level fns and globals live outside every frame that a closure
        // could capture; they are addressed directly, never through an
        // environment.
        if (index > 0) recordCaptures(name, decl, index, scopes);
      }
      else      stampDiagnostic(node, DIAGNOSTIC_KINDS.UNKNOWN_VARIABLE, `Unknown variable '${name}'`, { name });
      return;
    }
    case 'ir-closure': {
      const closureFrame = newFrame(node);
      for (const param of paramsOf(node)) {
        closureFrame.vars.set(param.getAttribute('name'), param);
      }
      scopes.push(closureFrame);
      const body = bodyOf(node);
      if (body) walkBlock(body, scopes);
      scopes.pop();
      attachEnv(node, closureFrame.caps);
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
      const body    = bodyOf(node);
      if (body) {
        const forFrame = newFrame();
        if (capture) {
          for (const name of (capture.getAttribute('names') ?? '').split(',').filter(Boolean)) {
            forFrame.vars.set(name, capture);
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
          const armFrame = newFrame();
          armFrame.vars.set(binding, arm);
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
        const promFrame = newFrame();
        if (binding) promFrame.vars.set(binding, node);
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

/**
 * Attach the closure's free variables as an `ir-closure-env`. Capture mode
 * (snapshot for scalars, shared for GC references) is decided later, once
 * types are known — this pass only records *which* bindings are free.
 */
function attachEnv(closure, caps) {
  const doc = closure.ownerDocument;
  const env = createSyntheticNode(doc, T.CLOSURE_ENV, closure, 'resolve-bindings', 'closure-env');
  for (const [name, decl] of caps) {
    const cap = createSyntheticNode(doc, T.CLOSURE_CAP, closure, 'resolve-bindings', 'closure-capture');
    cap.setAttribute('name', name);
    cap.dataset.bindingId = decl.id;
    cap.dataset.bindingOriginId = decl.dataset.originId ?? decl.id;
    cap.dataset.bindingKind = decl.localName;
    env.appendChild(cap);
  }
  closure.appendChild(env);
}
