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
// Which bodies get walked is decided by the retained program index.
//
// data-binding-id values point to:
//   ir-param, ir-self-param, ir-let, ir-capture, ir-fn, ir-extern-fn, ir-global
//
// Free variables: a scope may mark itself as a closure boundary. When an ident
// resolves to a declaration beyond such a boundary, the binding is free in that
// closure and is recorded as a capture. Nested closures record the same
// binding at every level it crosses, because each one has to thread it inward.
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';
import { bodyOf, paramsOf, selfParamOf } from './ir-helpers.js';
import { retainGraph, retainedGraphs } from './graph-store.js';
import { buildProgramIndex, nodesOf } from './program-index.js';

/**
 * @param {Document} doc
 */
export function resolveBindings(doc) {
  const root = doc.body.firstChild;
  if (!root) return null;
  const program = retainedGraphs(doc).program ?? buildProgramIndex(doc);
  const graph = {
    kind: 'scope', programRevision: program.revision, root: null,
    scopes: new Map(), resolutions: new Map(),
    declarationScopes: new Map(), captures: new Map(),
  };

  // ── Global scope: top-level fns and globals ───────────────────────────────
  const globalScope = newScope(graph, null, root);
  graph.root = globalScope;
  const globals = nodesOf(program, 'ir-fn', 'ir-extern-fn', 'ir-global').filter(node =>
    node.parentElement === root || node.parentElement?.localName === 'ir-export-lib'
    || node.parentElement?.localName === 'ir-export-main');
  for (const n of globals) {
    // fns are keyed by their short method name for simple ident lookups
    // e.g. `ir-fn[name="Foo.bar"]` is NOT in global scope by "Foo.bar" —
    // Method calls resolve from receiver types in the type graph.
    // Only free functions (kind="free") land here.
    const fnName = n.querySelector(':scope > ir-fn-name[kind="free"]');
    const key = fnName ? fnName.getAttribute('name') : n.getAttribute('name');
    if (key) declare(graph, globalScope, key, n);
  }

  // ── Walk every executable body ────────────────────────────────────────────
  // The program index owns the complete surface list for every target.
  const visit = (body, surface) => {
    const scope = newScope(graph, globalScope, surface);
    const self = selfParamOf(surface);
    if (self) declare(graph, scope, self.getAttribute('name'), self);
    for (const param of paramsOf(surface)) declare(graph, scope, param.getAttribute('name'), param);
    walkBlock(body, scope, graph);
  };
  // Bench setup expressions and the measured block share one lexical scope:
  // setup declarations are intentionally visible inside `measure { ... }`.
  // They are separate execution phases, but not separate source scopes.
  const benches = new Set(nodesOf(program, 'ir-bench'));
  for (const bench of benches) {
    const scope = newScope(graph, globalScope, bench);
    for (const child of bench.children) {
      if (child.localName === 'ir-measure') {
        const body = child.querySelector(':scope > ir-block');
        if (body) walkBlock(body, scope, graph);
      } else {
        walkNode(child, scope, graph);
      }
    }
  }
  for (const { body, owner } of program.surfaces) {
    if (!benches.has(owner)) visit(body, owner);
  }
  return retainGraph(doc, 'scope', graph);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function newScope(graph, parent, owner, closure = null) {
  const scope = {
    id: `s${graph.scopes.size}`, parent, owner, closure,
    declarations: new Map(), uses: new Set(), captures: closure ? new Map() : null,
  };
  graph.scopes.set(scope.id, scope);
  return scope;
}

function declare(graph, scope, name, node) {
  if (!name) return;
  scope.declarations.set(name, node);
  graph.declarationScopes.set(node.id, scope);
}

function lookup(name, scope) {
  for (let current = scope; current; current = current.parent) {
    const decl = current.declarations.get(name);
    if (decl) return { decl, scope: current };
  }
  return null;
}

function recordCaptures(graph, name, decl, from, to) {
  if (to === graph.root) return;
  for (let scope = from; scope && scope !== to; scope = scope.parent) {
    if (scope.closure && !scope.captures.has(name)) scope.captures.set(name, decl);
  }
}

function walkBlock(block, parent, graph) {
  const scope = newScope(graph, parent, block);
  for (const child of block.children) walkNode(child, scope, graph);
}

function walkScoped(node, parent, graph, binding, declaration) {
  if (!binding) return walkNode(node, parent, graph);
  const scope = newScope(graph, parent, declaration);
  declare(graph, scope, binding, declaration);
  walkNode(node, scope, graph);
}

function walkNode(node, scope, graph) {
  switch (node.localName) {
    case 'ir-let': {
      // Walk the init expression first (RHS can't see the name being bound)
      const init = node.lastElementChild;
      if (init) walkNode(init, scope, graph);
      declare(graph, scope, node.getAttribute('name'), node);
      return;
    }
    case 'ir-ident': {
      const name = node.getAttribute('name');
      scope.uses.add(node);
      const hit = lookup(name, scope);
      if (hit) {
        const { decl, scope: declarationScope } = hit;
        graph.resolutions.set(node.id, decl);
        // Top-level fns and globals live outside every scope that a closure
        // could capture; they are addressed directly, never through an
        // environment.
        recordCaptures(graph, name, decl, scope, declarationScope);
      }
      else      stampDiagnostic(node, DIAGNOSTIC_KINDS.UNKNOWN_VARIABLE, `Unknown variable '${name}'`, { name });
      return;
    }
    case 'ir-closure': {
      const closureFrame = newScope(graph, scope, node, node);
      for (const param of paramsOf(node)) {
        declare(graph, closureFrame, param.getAttribute('name'), param);
      }
      const body = bodyOf(node);
      if (body) walkBlock(body, closureFrame, graph);
      graph.captures.set(node.id, closureFrame.captures);
      return;
    }
    case 'ir-block':
      walkBlock(node, scope, graph);
      return;
    case 'ir-for': {
      // Walk range sources in current scope, then add capture and walk body
      for (const src of node.querySelectorAll(':scope > ir-for-source')) {
        for (const child of src.children) walkNode(child, scope, graph);
      }
      const capture = node.querySelector(':scope > ir-capture');
      const body    = bodyOf(node);
      if (body) {
        const forFrame = newScope(graph, scope, node);
        if (capture) {
          for (const name of (capture.getAttribute('names') ?? '').split(',').filter(Boolean)) {
            declare(graph, forFrame, name, capture);
          }
        }
        walkBlock(body, forFrame, graph);
      }
      return;
    }
    case 'ir-alt': {
      // Walk scrutinee, then each arm with its optional binding
      const [scrutinee, ...arms] = [...node.children];
      if (scrutinee) walkNode(scrutinee, scope, graph);
      for (const arm of arms) {
        const binding = arm.getAttribute('binding');
        const armBody = arm.lastElementChild;
        if (armBody) walkScoped(armBody, scope, graph, binding, arm);
      }
      return;
    }
    case 'ir-promote': {
      // Walk scrutinee, then arm body with capture binding, then default
      const children = [...node.children];
      if (children[0]) walkNode(children[0], scope, graph); // scrutinee
      const binding = node.getAttribute('binding');
      // promote-arm and default-arm are children 1 and 2
      if (children[1]) walkScoped(children[1], scope, graph, binding, node);
      if (children[2]) walkNode(children[2], scope, graph); // default arm
      return;
    }
    case 'ir-type-member': {
      const typeNode = node.firstElementChild;
      const args = node.querySelector(':scope > ir-arg-list');
      if (typeNode) walkNode(typeNode, scope, graph);
      if (args) walkNode(args, scope, graph);
      return;
    }
    case 'ir-mod-call': {
      const typeArgs = node.querySelector(':scope > ir-type-args');
      const args = node.querySelector(':scope > ir-arg-list');
      if (typeArgs) walkNode(typeArgs, scope, graph);
      if (args) walkNode(args, scope, graph);
      return;
    }
    default:
      for (const child of node.children) walkNode(child, scope, graph);
  }
}
