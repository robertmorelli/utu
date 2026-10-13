// backend-facts.js — what code generation needs to know, carried through lowering.
//
// The checked program's graphs answer every question codegen asks: a node's
// type, what it is expected to be (for context-typed blocks and literals), the
// declaration an identifier names, the function a call targets, the field an
// access reads, how a call was resolved, and protocol calls. Lowerings change
// representation, not meaning, so instead of re-analyzing what they produce,
// they record these facts for the nodes they make and carry them across the
// nodes they clone or replace. Debug builds re-derive the facts from scratch
// on the lowered program and compare (backendFactsDifference). See
// docs/fact-store.md.
//
// Facts about a node are keyed by the node. Bindings and call targets are
// keyed by id, as the scope and call graphs that produce them are (a few
// lowerings give a wrapper its operand's id, and both then share them).
// Node kinds without a type rule are typed by their `data-type-name`
// attribute, here as in the type graph (TYPE_RULE_KINDS).

import { TYPE_RULE_KINDS } from './type-graph.js';

export class BackendFacts {
  constructor() {
    this.types = new Map();
    this.expectations = new Map();
    this.fields = new Map();
    this.protocolCalls = new Map();
    // Call → how it was resolved (`resolvedAs`).
    this.resolutions = new Map();
    // Identifier id → declaration, and declarations a lowering replaced → their replacements.
    this.bindings = new Map();
    this.redeclared = new Map();
    // Call id → function declaration id.
    this.callTargets = new Map();
  }

  /** The facts of a settled graph set, as the backend plan reads them. */
  static fromGraphs({ types, scope, calls }) {
    const facts = new BackendFacts();
    const columns = types?.facts;
    for (let r = 0; r < (columns?.nodes.length ?? 0); r++) {
      const node = columns.nodes[r];
      if (!node.id) continue;
      const actual = columns.typeName(r);
      if (actual && node.localName !== 'ir-fn' && node.localName !== 'ir-extern-fn') facts.types.set(node, actual);
      // Kept for every node: lowerings read the context of what they replace.
      const expected = columns.expected[r].map(edge => edge.read()).find(Boolean);
      if (expected) facts.expectations.set(node, expected);
      if (columns.field[r]) facts.fields.set(node, columns.field[r]);
      const protocolCall = columns.rareFact(r, 'protocolCall');
      if (protocolCall) facts.protocolCalls.set(node, protocolCall);
      const resolvedAs = columns.resolution[r]?.resolvedAs;
      if (resolvedAs) facts.resolutions.set(node, resolvedAs);
    }
    for (const [id, decl] of scope?.resolutions ?? []) facts.bindings.set(id, decl);
    for (const [id, decl] of calls?.targets ?? []) facts.callTargets.set(id, decl.id);
    return facts;
  }

  type(node) {
    if (!node) return null;
    if (!TYPE_RULE_KINDS.has(node.localName)) return node.attr?.('data-type-name') ?? null;
    return this.types.get(node) ?? null;
  }

  setType(node, type) {
    if (type) this.types.set(node, type);
    else this.types.delete(node);
  }

  expectation(node) { return this.expectations.get(node) ?? null; }

  /** The declaration the identifier with this id names now. */
  declaration(id) {
    let declaration = this.bindings.get(id);
    while (declaration && this.redeclared.has(declaration)) declaration = this.redeclared.get(declaration);
    return declaration ?? null;
  }

  /** A lowering replaced `old` (an alt arm, a promote) with the declaration `replacement`. */
  redeclare(old, replacement) {
    if (old !== replacement) this.redeclared.set(old, replacement);
  }

  setExpectation(node, type) {
    if (type) this.expectations.set(node, type);
    else this.expectations.delete(node);
  }

  /** Give a clone the facts its original has. */
  copy(from, to) {
    for (const map of this.byNode()) copyEntry(map, from, to);
    if (from.id !== to.id) for (const map of this.byId()) copyEntry(map, from.id, to.id);
  }

  /**
   * A node standing in for another takes its type and what it is expected to
   * be, unless already given its own; how the original was resolved belongs
   * to the original's form.
   */
  inherit(from, to) {
    for (const map of [this.types, this.expectations]) {
      if (!map.has(to) && map.has(from)) map.set(to, map.get(from));
    }
  }

  byNode() { return [this.types, this.expectations, this.fields, this.protocolCalls, this.resolutions]; }
  byId() { return [this.bindings, this.callTargets]; }
}

function copyEntry(map, from, to) {
  const value = map.get(from);
  if (value !== undefined) map.set(to, value);
}

/**
 * Code generation asks what blocks are expected to be (a block expected
 * `void` produces nothing) and what `null` literals and `null`-typed values
 * are (they take their type from context).
 */
export function expectationMatters(node, type) {
  return node.localName === 'ir-block' || type === 'null'
    || (node.localName === 'ir-lit' && node.getAttribute('kind') === 'null');
}

const NAMES = ['type', 'expectation', 'field', 'protocol call', 'resolution', 'binding', 'call target'];

/**
 * How `facts` differs from `reference` on the nodes of `program`, as a list of
 * `{ kind, node, have, want }` (empty when they agree).
 */
export function backendFactsDifference(facts, reference, program) {
  const differences = [];
  const json = value => (value && typeof value === 'object'
    ? JSON.stringify(value, (_, v) => (v?.nodeType ? v.id : v)) : value);
  const have = [...facts.byNode(), ...facts.byId()];
  const want = [...reference.byNode(), ...reference.byId()];
  const nodeMaps = facts.byNode().length;
  for (const node of program.all) {
    if (!node.id) continue;
    for (let k = 0; k < have.length; k++) {
      const key = k < nodeMaps ? node : node.id;
      const a = json(have[k].get(key));
      const b = json(want[k].get(key));
      if (a !== b) differences.push({ kind: NAMES[k], node, have: a, want: b });
    }
  }
  return differences;
}
