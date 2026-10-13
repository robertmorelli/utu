// fact-store.js — what the type graph knows about each node, in columns.
//
// One row per analyzed node, in document order; one column per fact. Types
// are TypeIds from the type table (type-table.js). Facts held by few nodes
// (protocol calls, foreign operations) are kept by row in a map. In the utu
// port each column is a mem or Vec. See docs/fact-store.md.
//
// Analyses and editor queries read slots as objects (`slot.actual`,
// `slot.function`, …); `views()` gives them that interface over the columns.

import { typeTable } from './type-table.js';

// Most nodes are expected nothing; they share this list until their first edge.
export const NO_EDGES = Object.freeze([]);

export class TypeFacts {
  /** `nodes` in document order; their rows are their positions. */
  constructor(doc, nodes) {
    const count = nodes.length;
    this.doc = doc;
    this.table = typeTable();
    this.nodes = nodes;
    // Row by node index (`node.$`); nodes made after this was built have none.
    this.rows = new Int32Array(doc?.count ?? 0).fill(-1);
    for (let r = 0; r < count; r++) this.rows[nodes[r].$] = r;
    // The node's type (a TypeId), or -1 for none.
    this.type = new Int32Array(count).fill(-1);
    // How the solver last set the type (`inferenceSource`), and whether it did.
    this.source = new Array(count).fill(undefined);
    this.project = new Uint8Array(count);
    this.expected = new Array(count).fill(NO_EDGES);
    this.rule = new Array(count).fill(undefined);
    this.function = new Array(count).fill(null);
    this.resolution = new Array(count).fill(null);
    this.field = new Array(count).fill(undefined);
    // Rare facts by row: protocolCall, foreign, foreignError, foreignChecked.
    this.rare = new Map();
  }

  /** A node's row, or -1 when it was not analyzed (or belongs to another document). */
  rowOf(node) {
    if (node == null) return -1;
    const r = this.rows[node.$];
    return r !== undefined && r >= 0 && this.nodes[r] === node ? r : -1;
  }

  typeName(r) {
    const id = this.type[r];
    return id < 0 ? null : this.table.names[id];
  }

  setTypeName(r, name) {
    this.type[r] = name == null ? -1 : this.table.id(name);
  }

  rareFact(r, key) {
    return this.rare.get(r)?.[key];
  }

  setRareFact(r, key, value) {
    let facts = this.rare.get(r);
    if (!facts) this.rare.set(r, facts = {});
    facts[key] = value;
  }

  /** The slots interface: get/has/size and iteration as [node, slot] in document order. */
  views() {
    return new SlotViews(this);
  }
}

class SlotViews {
  constructor(facts) {
    this.facts = facts;
  }
  get(node) {
    const r = this.facts.rowOf(node);
    return r < 0 ? undefined : new SlotView(this.facts, r);
  }
  has(node) {
    return this.facts.rowOf(node) >= 0;
  }
  get size() {
    return this.facts.nodes.length;
  }
  *entries() {
    const { nodes } = this.facts;
    for (let r = 0; r < nodes.length; r++) yield [nodes[r], new SlotView(this.facts, r)];
  }
  keys() {
    return this.facts.nodes[Symbol.iterator]();
  }
  *values() {
    for (let r = 0; r < this.facts.nodes.length; r++) yield new SlotView(this.facts, r);
  }
  [Symbol.iterator]() {
    return this.entries();
  }
}

/** One node's facts, read and written through the columns. */
class SlotView {
  constructor(facts, row) {
    this.facts = facts;
    this.row = row;
  }
  get node() { return this.facts.nodes[this.row]; }
  get actual() { return this.facts.typeName(this.row); }
  set actual(name) { this.facts.setTypeName(this.row, name); }
  get inferenceSource() { return this.facts.source[this.row]; }
  set inferenceSource(source) { this.facts.source[this.row] = source; }
  get project() { return this.facts.project[this.row] === 1; }
  set project(flag) { this.facts.project[this.row] = flag ? 1 : 0; }
  get expected() { return this.facts.expected[this.row]; }
  set expected(edges) { this.facts.expected[this.row] = edges; }
  get rule() { return this.facts.rule[this.row]; }
  set rule(rule) { this.facts.rule[this.row] = rule; }
  get function() { return this.facts.function[this.row]; }
  set function(fn) { this.facts.function[this.row] = fn; }
  get resolution() { return this.facts.resolution[this.row]; }
  set resolution(resolution) { this.facts.resolution[this.row] = resolution; }
  get field() { return this.facts.field[this.row]; }
  set field(field) { this.facts.field[this.row] = field; }
  get protocolCall() { return this.facts.rareFact(this.row, 'protocolCall'); }
  set protocolCall(fact) { this.facts.setRareFact(this.row, 'protocolCall', fact); }
  get foreign() { return this.facts.rareFact(this.row, 'foreign'); }
  set foreign(op) { this.facts.setRareFact(this.row, 'foreign', op); }
  get foreignError() { return this.facts.rareFact(this.row, 'foreignError'); }
  set foreignError(message) { this.facts.setRareFact(this.row, 'foreignError', message); }
  get foreignChecked() { return this.facts.rareFact(this.row, 'foreignChecked'); }
  set foreignChecked(checked) { this.facts.setRareFact(this.row, 'foreignChecked', checked); }
}

