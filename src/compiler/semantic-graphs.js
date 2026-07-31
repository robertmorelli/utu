// Retained semantic graphs used by compiler passes and analysis clients.

import { unwrapNullable } from './type-strings.js';
import { actualType, resolvedFunctionOf } from './type-graph.js';
import { buildProgramIndex } from './program-index.js';
import { buildDeclarationGraph } from './declaration-graph.js';
export { retainGraph, retainedGraphs } from './graph-store.js';

export function buildCallGraph(root, typeGraph = null) {
  const functions = new Map();
  const edges = [];
  const directEffects = new Map();
  const nodes = (...kinds) => typeGraph
    ? kinds.flatMap(kind => typeGraph.nodesByKind.get(kind) ?? [])
    : [...root.querySelectorAll(kinds.join(', '))];
  const surfaces = nodes('ir-fn', 'ir-closure', 'ir-export-main', 'ir-test', 'ir-bench');
  const awaitSites = nodes('ir-await');
  for (const fn of surfaces) {
    const id = fn.id;
    if (!id) continue;
    functions.set(id, { id, node: fn, name: fn.getAttribute('name') ?? fn.localName });
    const effects = new Set();
    if (awaitSites.some(node =>
      node.closest('ir-fn, ir-closure, ir-export-main, ir-test, ir-bench') === fn)) effects.add('await');
    directEffects.set(id, effects);
  }
  for (const call of nodes('ir-call')) {
    const caller = call.closest('ir-fn, ir-closure, ir-export-main, ir-test, ir-bench');
    if (!caller?.id) continue;
    const declaration = typeGraph ? resolvedFunctionOf(typeGraph, call) : null;
    const callee = declaration?.id ?? call.dataset.fnId ?? null;
    edges.push({ from: caller.id, to: callee, call, declaration, indirect: !callee });
  }
  const effects = new Map([...directEffects].map(([id, set]) => [id, new Set(set)]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (!edge.to) continue;
      for (const effect of effects.get(edge.to) ?? []) {
        const target = effects.get(edge.from);
        if (!target.has(effect)) { target.add(effect); changed = true; }
      }
    }
  }
  const sites = {
    awaits: awaitSites,
    promiseThen: nodes('ir-promise-then'),
    promiseCatch: nodes('ir-promise-catch'),
  };
  const targets = new Map(edges.filter(edge => edge.declaration).map(edge => [edge.call.id, edge.declaration]));
  const callableTypes = new Map(nodes('ir-call').map(call => [call.id,
    typeGraph ? actualType(typeGraph, call.firstElementChild) : call.firstElementChild?.dataset?.typeName ?? null]));
  return {
    kind: 'call', programRevision: typeGraph?.programRevision ?? null,
    functions, edges, effects, sites, targets, callableTypes,
  };
}

export function buildControlFlowGraph(root, program = null) {
  const nodes = new Map();
  const edges = [];
  const add = (id, node, kind = node?.localName ?? 'point') => {
    if (!nodes.has(id)) nodes.set(id, { id, node, kind });
    return id;
  };
  const link = (from, to, kind = 'next') => {
    if (from && to) edges.push({ from, to, kind });
  };

  const visit = (body, surface) => {
    const entry = add(`${surface.id}:entry`, surface, 'entry');
    const exit = add(`${surface.id}:exit`, surface, 'exit');
    link(entry, flowBlock(body, exit, { exit, breaks: [] }, add, link), 'enter');
  };
  const index = program ?? buildProgramIndex(root.ownerDocument);
  for (const { body, owner } of index.surfaces) visit(body, owner);
  return { kind: 'control-flow', programRevision: index.revision, nodes, edges };
}

function flowBlock(block, next, ctx, add, link) {
  let target = next;
  for (const node of [...block.children].reverse()) target = flowNode(node, target, ctx, add, link);
  return target;
}

function flowNode(node, next, ctx, add, link) {
  if (!node) return next;
  const id = add(node.id, node);
  if (node.localName === 'ir-return') { link(id, ctx.exit, 'return'); return id; }
  if (node.localName === 'ir-break') { link(id, ctx.breaks.at(-1) ?? next, 'break'); return id; }
  if (node.localName === 'ir-if') {
    for (const branch of [...node.children].slice(1)) {
      const start = branch.localName === 'ir-block' ? flowBlock(branch, next, ctx, add, link) : flowNode(branch, next, ctx, add, link);
      link(id, start, 'branch');
    }
    if (node.children.length < 3) link(id, next, 'false');
    return id;
  }
  if (node.localName === 'ir-while') {
    const loop = { ...ctx, breaks: [...ctx.breaks, next] };
    const body = node.lastElementChild;
    link(id, body ? flowBlock(body, id, loop, add, link) : id, 'loop');
    link(id, next, 'exit');
    return id;
  }
  if (/^ir-(match|alt|promote)$/.test(node.localName)) {
    for (const arm of node.querySelectorAll(':scope > ir-match-arm, :scope > ir-alt-arm, :scope > ir-promote-arm, :scope > ir-default-arm')) {
      const body = arm.lastElementChild;
      const start = body?.localName === 'ir-block'
        ? flowBlock(body, next, ctx, add, link)
        : flowNode(body, next, ctx, add, link);
      link(id, start, 'arm');
    }
    return id;
  }
  link(id, next);
  return id;
}

export function buildTypeDeclarationGraph(typeIndex) {
  return Object.assign(buildDeclarationGraph([...typeIndex],
    ([name]) => name,
    ([, entry]) => [entry.superName, entry.arrayElem, ...(entry.fields ?? []).map(field => field.type)]
      .filter(Boolean)), { kind: 'declaration' });
}

export function buildLayoutGraph(typeIndex) {
  const nodes = new Map();
  const edges = [];
  for (const [name, entry] of typeIndex) {
    if (!/^wasm-(gc-|array)/.test(entry.kind ?? '')) continue;
    nodes.set(name, { name, entry });
  }
  for (const [name, { entry }] of nodes) {
    const deps = [entry.superName, entry.arrayElem, ...(entry.fields ?? []).map(field => field.type)]
      .map(type => unwrapNullable(type ?? '')).filter(type => nodes.has(type));
    for (const to of new Set(deps)) edges.push({ from: name, to });
  }
  return { kind: 'layout', typeIndex, nodes, edges, recursive: edges.length > 0 };
}

