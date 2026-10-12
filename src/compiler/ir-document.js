// ir-document.js — the compiler's IR document: the part of the DOM the passes
// use, built for a compiler instead of a browser.
//
// Passes were written against linkedom. This keeps their API (elements,
// attributes, dataset, children, selectors, mutation, cloning) and drops what
// made it slow: there is no live-range bookkeeping, attributes are an ordered
// Map instead of Attr objects, `dataset` names are converted once and cached,
// `getElementById` is a map lookup, and selectors are parsed once into
// matchers (`:scope > x` scans only children).
//
// Semantics follow an HTML document, as linkedom's did: element and attribute
// names are lowercase, `tagName` is uppercase, `dataset.fooBar` is the
// `data-foo-bar` attribute. Plan A in docs/self-hosting.md replaces this with a
// typed node store behind the same interface.

const ELEMENT = 1;
const TEXT = 3;
const DOCUMENT = 9;

// ── Names ─────────────────────────────────────────────────────────────────────

const DATA_NAMES = new Map();
const CAMEL_NAMES = new Map();

/** `typeName` → `data-type-name`. */
function dataAttribute(property) {
  let name = DATA_NAMES.get(property);
  if (name === undefined) {
    name = `data-${property.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;
    DATA_NAMES.set(property, name);
  }
  return name;
}

/** `data-type-name` → `typeName`. */
function camelName(attribute) {
  let name = CAMEL_NAMES.get(attribute);
  if (name === undefined) {
    name = attribute.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    CAMEL_NAMES.set(attribute, name);
  }
  return name;
}

// ── Attribute shapes ─────────────────────────────────────────────────────────
//
// Elements with the same attribute names, set in the same order, share one
// Shape (the names and where each one is), as V8's hidden classes do; an
// element stores only its values. Most IR nodes carry the same dozen spans and
// provenance attributes, so this is one small array per node instead of a hash
// map.

class Shape {
  constructor(names) {
    this.names = names;
    this.index = new Map(names.map((name, i) => [name, i]));
    this.added = new Map();
    this.removed = new Map();
  }

  with(name) {
    let next = this.added.get(name);
    if (!next) this.added.set(name, next = new Shape([...this.names, name]));
    return next;
  }

  without(name) {
    let next = this.removed.get(name);
    if (!next) this.removed.set(name, next = new Shape(this.names.filter(other => other !== name)));
    return next;
  }
}

const EMPTY = new Shape([]);

// ── Nodes ─────────────────────────────────────────────────────────────────────

class IRNode {
  constructor(document) {
    this.ownerDocument = document;
    this.parentNode = null;
  }

  get parentElement() {
    const parent = this.parentNode;
    return parent?.nodeType === ELEMENT ? parent : null;
  }

  get nextSibling() {
    const siblings = this.parentNode?.childNodes;
    return siblings ? siblings[siblings.indexOf(this) + 1] ?? null : null;
  }

  get previousSibling() {
    const siblings = this.parentNode?.childNodes;
    return siblings ? siblings[siblings.indexOf(this) - 1] ?? null : null;
  }

  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node.nodeType === DOCUMENT;
  }

  remove() {
    const parent = this.parentNode;
    if (!parent) return;
    detach(this);
    mutated(parent, 'childList');
  }

  before(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    for (const node of nodes) parent.insertBefore(asNode(this.ownerDocument, node), this);
  }

  after(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    const next = this.nextSibling;
    for (const node of nodes) parent.insertBefore(asNode(this.ownerDocument, node), next);
  }

  replaceWith(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    const replacements = nodes.map(node => asNode(this.ownerDocument, node)).filter(node => node !== this);
    for (const node of replacements) parent.insertBefore(node, this);
    if (!nodes.includes(this)) this.remove();
  }
}

class IRText extends IRNode {
  constructor(document, data) {
    super(document);
    this.data = String(data);
  }
  get nodeType() { return TEXT; }
  get nodeName() { return '#text'; }
  get textContent() { return this.data; }
  set textContent(value) { this.data = String(value); mutated(this, 'characterData'); }
  cloneNode() { return new IRText(this.ownerDocument, this.data); }
  get outerHTML() { return escapeText(this.data); }
}

class IRElement extends IRNode {
  constructor(document, localName) {
    super(document);
    this.localName = localName;
    this.shape = EMPTY;
    this.values = [];
    this.childNodes = [];
    // Text children are rare; while there are none, childNodes is children.
    this.textChildren = 0;
    this._dataset = null;
  }

  get nodeType() { return ELEMENT; }
  get tagName() { return this.localName.toUpperCase(); }
  get nodeName() { return this.tagName; }

  // ── Attributes ──
  /** The value of an attribute already in lowercase, or undefined. */
  attr(name) {
    const i = this.shape.index.get(name);
    return i === undefined ? undefined : this.values[i];
  }

  getAttribute(name) {
    let i = this.shape.index.get(name);
    if (i === undefined) {
      const lower = name.toLowerCase();
      if (lower === name || (i = this.shape.index.get(lower)) === undefined) return null;
    }
    return this.values[i];
  }

  setAttribute(name, value) {
    let key = name;
    let i = this.shape.index.get(key);
    if (i === undefined) {
      key = name.toLowerCase();
      i = this.shape.index.get(key);
    }
    const text = String(value);
    if (key === 'id') this.ownerDocument.ids.set(text, this);
    if (i === undefined) {
      this.shape = this.shape.with(key);
      this.values.push(text);
    } else {
      this.values[i] = text;
    }
    mutated(this, 'attributes');
  }

  removeAttribute(name) {
    const key = name.toLowerCase();
    const i = this.shape.index.get(key);
    if (i === undefined) return;
    this.shape = this.shape.without(key);
    this.values.splice(i, 1);
    mutated(this, 'attributes');
  }

  hasAttribute(name) {
    return this.shape.index.has(name) || this.shape.index.has(name.toLowerCase());
  }

  getAttributeNames() {
    return [...this.shape.names];
  }

  get attributes() {
    return this.shape.names.map((name, i) => ({ name, value: this.values[i] }));
  }

  get id() { return this.attr('id') ?? ''; }
  set id(value) { this.setAttribute('id', value); }

  get dataset() {
    return this._dataset ??= datasetOf(this);
  }

  // ── Children ──
  get children() {
    return this.textChildren ? this.childNodes.filter(isElement) : this.childNodes;
  }
  get childElementCount() { return this.children.length; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get firstElementChild() {
    if (!this.textChildren) return this.childNodes[0] ?? null;
    return this.childNodes.find(isElement) ?? null;
  }
  get lastElementChild() {
    if (!this.textChildren) return this.childNodes[this.childNodes.length - 1] ?? null;
    return this.childNodes.findLast(isElement) ?? null;
  }
  get nextElementSibling() {
    const siblings = this.parentNode?.childNodes;
    if (!siblings) return null;
    for (let i = siblings.indexOf(this) + 1; i < siblings.length; i++) if (siblings[i].nodeType === ELEMENT) return siblings[i];
    return null;
  }
  get previousElementSibling() {
    const siblings = this.parentNode?.childNodes;
    if (!siblings) return null;
    for (let i = siblings.indexOf(this) - 1; i >= 0; i--) if (siblings[i].nodeType === ELEMENT) return siblings[i];
    return null;
  }

  appendChild(node) {
    return this.insertBefore(node, null);
  }

  insertBefore(node, reference) {
    if (node.nodeType === DOCUMENT) throw new Error('ir-document: cannot insert a document');
    if (node.parentNode) detach(node);
    const at = reference ? this.childNodes.indexOf(reference) : -1;
    if (at < 0) this.childNodes.push(node);
    else this.childNodes.splice(at, 0, node);
    node.parentNode = this;
    if (node.nodeType === TEXT) this.textChildren++;
    mutated(this, 'childList');
    return node;
  }

  append(...nodes) {
    for (const node of nodes) this.insertBefore(asNode(this.ownerDocument, node), null);
  }

  prepend(...nodes) {
    const first = this.firstChild;
    for (const node of nodes) this.insertBefore(asNode(this.ownerDocument, node), first);
  }

  removeChild(node) {
    if (node.parentNode !== this) throw new Error('ir-document: not a child');
    node.remove();
    return node;
  }

  replaceChild(node, old) {
    this.insertBefore(node, old);
    old.remove();
    return old;
  }

  contains(other) {
    for (let node = other; node; node = node.parentNode) if (node === this) return true;
    return false;
  }

  cloneNode(deep = false) {
    return cloneInto(this, this.ownerDocument, deep);
  }

  get textContent() {
    let text = '';
    for (const child of this.childNodes) text += child.textContent;
    return text;
  }

  set textContent(value) {
    for (const child of [...this.childNodes]) detach(child);
    const text = String(value ?? '');
    if (text) this.insertBefore(new IRText(this.ownerDocument, text), null);
    mutated(this, 'childList');
  }

  // ── Selectors ──
  querySelector(selector) {
    return select(this, compile(selector), true)[0] ?? null;
  }

  querySelectorAll(selector) {
    return select(this, compile(selector), false);
  }

  matches(selector) {
    return compile(selector).some(complex => matchComplex(this, complex, complex.length - 1, null));
  }

  closest(selector) {
    const compiled = compile(selector);
    for (let node = this; node?.nodeType === ELEMENT; node = node.parentNode) {
      if (compiled.some(complex => matchComplex(node, complex, complex.length - 1, null))) return node;
    }
    return null;
  }

  get outerHTML() {
    let html = `<${this.localName}`;
    this.shape.names.forEach((name, i) => { html += ` ${name}="${escapeAttribute(this.values[i])}"`; });
    html += '>';
    for (const child of this.childNodes) html += child.outerHTML;
    return `${html}</${this.localName}>`;
  }
}

class IRDocument {
  constructor() {
    this.ids = new Map();
    this.observers = new Set();
    this.documentElement = new IRElement(this, 'html');
    this.documentElement.parentNode = this;
    this.head = new IRElement(this, 'head');
    this.body = new IRElement(this, 'body');
    this.documentElement.childNodes.push(this.head, this.body);
    this.head.parentNode = this.documentElement;
    this.body.parentNode = this.documentElement;
    const document = this;
    // Code generation asks whether the IR changed after analysis sealed it.
    this.defaultView = {
      MutationObserver: class {
        constructor() { this.records = []; }
        observe() { document.observers.add(this); }
        takeRecords() { return this.records.splice(0); }
        disconnect() { document.observers.delete(this); }
      },
    };
  }

  get nodeType() { return DOCUMENT; }
  get parentNode() { return null; }
  get childNodes() { return [this.documentElement]; }
  get firstChild() { return this.documentElement; }

  createElement(tag) {
    return new IRElement(this, tag.toLowerCase());
  }

  createTextNode(text) {
    return new IRText(this, text);
  }

  importNode(node, deep = false) {
    return cloneInto(node, this, deep);
  }

  getElementById(id) {
    const hit = this.ids.get(id);
    if (hit && hit.attr('id') === id && hit.isConnected) return hit;
    for (const node of walk(this.documentElement)) {
      if (node.attr('id') === id) {
        this.ids.set(id, node);
        return node;
      }
    }
    return null;
  }

  querySelector(selector) { return this.documentElement.querySelector(selector); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
}

export function createIRDocument() {
  return new IRDocument();
}

// ── Mutation helpers ─────────────────────────────────────────────────────────

function isElement(node) {
  return node.nodeType === ELEMENT;
}

function asNode(document, value) {
  return typeof value === 'object' && value !== null ? value : new IRText(document, value);
}

function detach(node) {
  const parent = node.parentNode;
  const siblings = parent.childNodes;
  siblings.splice(siblings.indexOf(node), 1);
  if (node.nodeType === TEXT) parent.textChildren--;
  node.parentNode = null;
}

/** Record an edit for observers, as a MutationObserver over the document would. */
function mutated(target, type) {
  const observers = target.ownerDocument?.observers;
  if (!observers?.size || !target.isConnected) return;
  for (const observer of observers) observer.records.push({ type, target });
}

function cloneInto(node, document, deep) {
  if (node.nodeType === TEXT) return new IRText(document, node.data);
  if (node.nodeType !== ELEMENT) throw new Error('ir-document: can only clone elements and text');
  const copy = new IRElement(document, node.localName);
  copy.shape = node.shape;
  copy.values = node.values.slice();
  const id = copy.attr('id');
  if (id !== undefined && !document.ids.has(id)) document.ids.set(id, copy);
  if (deep) {
    for (const child of node.childNodes) {
      const childCopy = cloneInto(child, document, true);
      childCopy.parentNode = copy;
      copy.childNodes.push(childCopy);
      if (childCopy.nodeType === TEXT) copy.textChildren++;
    }
  }
  return copy;
}

// One handler for every element's dataset; the proxy's target is the element.
const DATASET = {
  get(element, property) {
    return typeof property === 'string' ? element.attr(dataAttribute(property)) : undefined;
  },
  set(element, property, value) {
    element.setAttribute(dataAttribute(property), value);
    return true;
  },
  deleteProperty(element, property) {
    element.removeAttribute(dataAttribute(property));
    return true;
  },
  has(element, property) {
    return typeof property === 'string' && element.shape.index.has(dataAttribute(property));
  },
  ownKeys(element) {
    return element.shape.names.filter(name => name.startsWith('data-')).map(camelName);
  },
  getOwnPropertyDescriptor(element, property) {
    const value = typeof property === 'string' ? element.attr(dataAttribute(property)) : undefined;
    return value === undefined ? undefined : { value, writable: true, enumerable: true, configurable: true };
  },
};

function datasetOf(element) {
  return new Proxy(element, DATASET);
}

function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Elements below `root`, in document order. */
function walk(root) {
  const out = [];
  collect(root, out, null);
  return out;
}

// Depth-first, pushing matches as they are reached: document order.
function collect(node, out, test) {
  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== ELEMENT) continue;
    if (test === null || test(child)) out.push(child);
    if (child.childNodes.length) collect(child, out, test);
  }
}

// ── Selectors ─────────────────────────────────────────────────────────────────
//
// The grammar the passes use: tag, `*`, `[a]`, `[a="v"]`, `[a^="v"]`,
// `[a*="v"]`, `:not(…)`, `:has(…)`, `:first-child`, the descendant and `>`
// combinators, `:scope` at the start, and comma lists.

const COMPILED = new Map();

function compile(selector) {
  let compiled = COMPILED.get(selector);
  if (!compiled) {
    compiled = parseSelectorList(selector);
    COMPILED.set(selector, compiled);
  }
  return compiled;
}

function parseSelectorList(text) {
  const state = { text, at: 0 };
  const list = [parseComplex(state)];
  while (skipSpace(state) === ',') {
    state.at++;
    list.push(parseComplex(state));
  }
  if (state.at < text.length && skipSpace(state) !== ')') throw new Error(`ir-document: unsupported selector ${text}`);
  return list;
}

// A complex selector: [{ compound, combinator }], read left to right; the
// combinator joins a compound to the one before it (' ' or '>').
function parseComplex(state) {
  const parts = [];
  let combinator = null;
  for (;;) {
    skipSpace(state);
    const compound = parseCompound(state);
    parts.push({ compound, combinator });
    const before = state.at;
    const next = skipSpace(state);
    if (next === '>') {
      combinator = '>';
      state.at++;
    } else if (next !== undefined && next !== ',' && next !== ')' && state.at > before) {
      combinator = ' ';
    } else {
      break;
    }
  }
  return parts;
}

function parseCompound(state) {
  const compound = { tag: null, attributes: [], not: [], has: [], scope: false, firstChild: false };
  const { text } = state;
  const name = /^[a-zA-Z*][a-zA-Z0-9-]*/.exec(text.slice(state.at));
  if (name) {
    if (name[0] !== '*') compound.tag = name[0].toLowerCase();
    state.at += name[0].length;
  }
  for (;;) {
    const c = text[state.at];
    if (c === '[') {
      const end = text.indexOf(']', state.at);
      const body = text.slice(state.at + 1, end);
      const match = /^\s*([a-zA-Z0-9_-]+)\s*(?:([\^*]?=)\s*(?:"((?:\\.|[^"])*)"|'([^']*)'|([^\s\]]+)))?\s*$/.exec(body);
      if (!match) throw new Error(`ir-document: unsupported attribute selector [${body}]`);
      const value = match[3] ?? match[4] ?? match[5];
      compound.attributes.push({ name: match[1].toLowerCase(), op: match[2] ?? null, value: value?.replace(/\\(.)/g, '$1') });
      state.at = end + 1;
    } else if (c === ':') {
      const pseudo = /^:([a-z-]+)/.exec(text.slice(state.at));
      state.at += pseudo[0].length;
      if (pseudo[1] === 'scope') compound.scope = true;
      else if (pseudo[1] === 'first-child') compound.firstChild = true;
      else if (pseudo[1] === 'not' || pseudo[1] === 'has') {
        state.at++; // (
        const inner = { text, at: state.at };
        const list = [parseComplex(inner)];
        while (skipSpace(inner) === ',') { inner.at++; list.push(parseComplex(inner)); }
        skipSpace(inner);
        state.at = inner.at + 1; // )
        compound[pseudo[1]].push(list);
      } else {
        throw new Error(`ir-document: unsupported pseudo-class :${pseudo[1]}`);
      }
    } else {
      break;
    }
  }
  return compound;
}

function skipSpace(state) {
  while (state.at < state.text.length && /\s/.test(state.text[state.at])) state.at++;
  return state.text[state.at];
}

function matchCompound(element, compound, scope) {
  if (compound.tag && element.localName !== compound.tag) return false;
  if (compound.scope && element !== scope) return false;
  for (const { name, op, value } of compound.attributes) {
    const actual = element.attr(name);
    if (actual === undefined) return false;
    if (op === '=' && actual !== value) return false;
    if (op === '^=' && !actual.startsWith(value)) return false;
    if (op === '*=' && !actual.includes(value)) return false;
  }
  if (compound.firstChild && element.parentNode?.firstElementChild !== element) return false;
  for (const list of compound.not) {
    if (list.some(complex => matchComplex(element, complex, complex.length - 1, scope))) return false;
  }
  for (const list of compound.has) {
    const found = walk(element).some(descendant => list.some(complex => matchComplex(descendant, complex, complex.length - 1, element)));
    if (!found) return false;
  }
  return true;
}

// Match right to left: the compound at `index`, then its combinator's context.
function matchComplex(element, complex, index, scope) {
  const { compound, combinator } = complex[index];
  if (!matchCompound(element, compound, scope)) return false;
  if (index === 0) return true;
  if (combinator === '>') {
    const parent = element.parentNode;
    return parent?.nodeType === ELEMENT && matchComplex(parent, complex, index - 1, scope);
  }
  for (let ancestor = element.parentNode; ancestor?.nodeType === ELEMENT; ancestor = ancestor.parentNode) {
    if (matchComplex(ancestor, complex, index - 1, scope)) return true;
  }
  return false;
}

function select(scope, compiled, first) {
  const out = [];
  // `:scope > x` (alone or in a list of such) only looks at children.
  if (compiled.every(complex => complex.length === 2 && complex[0].compound.scope && complex[1].combinator === '>'
      && !complex[0].compound.tag && !complex[0].compound.attributes.length)) {
    for (const child of scope.childNodes) {
      if (child.nodeType !== ELEMENT) continue;
      if (compiled.some(complex => matchCompound(child, complex[1].compound, scope))) {
        out.push(child);
        if (first) break;
      }
    }
    return out;
  }
  const test = compiled.length === 1 && compiled[0].length === 1
    ? simpleTest(compiled[0][0].compound, scope)
    : node => compiled.some(complex => matchComplex(node, complex, complex.length - 1, scope));
  if (first) return firstMatch(scope, test);
  collect(scope, out, test);
  return out;
}

// A lone compound: test only what it names.
function simpleTest(compound, scope) {
  const { tag, attributes, not, has, firstChild } = compound;
  if (!attributes.length && !not.length && !has.length && !firstChild && !compound.scope) {
    return tag ? node => node.localName === tag : () => true;
  }
  return node => matchCompound(node, compound, scope);
}

function firstMatch(node, test) {
  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== ELEMENT) continue;
    if (test(child)) return [child];
    if (child.childNodes.length) {
      const found = firstMatch(child, test);
      if (found.length) return found;
    }
  }
  return [];
}

// ── XML fragments (`@ir` bodies) ─────────────────────────────────────────────

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text) {
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity];
    return String.fromCodePoint(entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
  });
}

/**
 * Parse XML markup into `document`'s nodes, returning the top-level nodes.
 * Elements, attributes, self-closing tags, text, and comments; enough for the
 * IR fragments the standard library writes in `@ir` bodies.
 */
export function parseXmlFragment(markup, document) {
  const top = [];
  const stack = [];
  const add = node => (stack.length ? stack.at(-1).appendChild(node) : top.push(node));
  const tag = /<!--[\s\S]*?-->|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
  let at = 0;
  for (let match; (match = tag.exec(markup));) {
    if (match.index > at) add(document.createTextNode(decode(markup.slice(at, match.index))));
    at = tag.lastIndex;
    if (match[0].startsWith('<!--')) continue;
    if (match[1]) {
      if (!stack.length || stack.at(-1).localName !== match[1].toLowerCase()) throw new Error(`ir-document: unexpected </${match[1]}>`);
      stack.pop();
      continue;
    }
    const element = document.createElement(match[2]);
    for (const attribute of match[3].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
      element.setAttribute(attribute[1], decode(attribute[2] ?? attribute[3] ?? ''));
    }
    add(element);
    if (!match[4]) stack.push(element);
  }
  if (at < markup.length) add(document.createTextNode(decode(markup.slice(at))));
  if (stack.length) throw new Error(`ir-document: unclosed <${stack.at(-1).localName}>`);
  return top;
}
