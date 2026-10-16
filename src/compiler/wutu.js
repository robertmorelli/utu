// Wutu is entirely a compile-time frontend. Each @wutu literal is parsed
// (wutu-parse.js) and rewritten into ordinary Utu that calls the typed Browser
// ABI; there is no interpreter or virtual DOM to ship.
//
// Static templates create DOM directly. When any template in the project is
// reactive (`@reactive` / `@island`), every template instead goes through the
// small reconciler in src/runtime/wutu.js so components can join a view.
import { compilerError, DIAGNOSTIC_KINDS } from './diagnostics.js';
import { hasLexicalShadow } from './hoist-modules.js';
import { expressionFromSource } from './source-expansion.js';
import { BOOLEAN_ATTRIBUTES, WutuSyntaxError, parseWutu, wutuVocabulary } from './wutu-parse.js';
import { decodeEscapes } from './string-escapes.js';

// Event interfaces from lib.dom's HTMLElementEventMap, for `on name { … }`.
const EVENT_TYPES = Object.fromEntries([
  ['MouseEvent', 'click dblclick auxclick contextmenu mousedown mouseup mousemove mouseenter mouseleave mouseover mouseout'],
  ['WheelEvent', 'wheel'],
  ['KeyboardEvent', 'keydown keyup keypress'],
  ['PointerEvent', 'pointerdown pointerup pointermove pointerenter pointerleave pointerover pointerout pointercancel gotpointercapture lostpointercapture'],
  ['FocusEvent', 'focus blur focusin focusout'],
  ['InputEvent', 'beforeinput'],
  ['SubmitEvent', 'submit'],
  ['DragEvent', 'drag dragstart dragend dragenter dragleave dragover drop'],
  ['TouchEvent', 'touchstart touchend touchmove touchcancel'],
  ['AnimationEvent', 'animationstart animationend animationiteration animationcancel'],
  ['TransitionEvent', 'transitionstart transitionend transitionrun transitioncancel'],
  ['ClipboardEvent', 'copy cut paste'],
].flatMap(([type, names]) => names.split(' ').map(name => [name, type])));

export { parseWutu, wutuVocabulary };

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const REACTIVE_DIRECTIVE = /@(?:reactive|island)/;
const MAX_EXPANSIONS = 10000;

/** Browser element interfaces returned by the reconciler, so properties stay typed. */
const ELEMENT_INTERFACES = {
  input: 'Input', select: 'Select', textarea: 'TextArea', form: 'Form', button: 'Button',
  a: 'Anchor', img: 'Image', canvas: 'Canvas', video: 'Video', audio: 'Audio',
  option: 'Option', label: 'Label', details: 'Details', dialog: 'Dialog',
  progress: 'Progress', meter: 'Meter', output: 'Output',
};

/** Reconciler entry points: [parameter types, return type, JS glue]. */
const RUNTIME_HELPERS = {
  attr: ['Browser.Element, Str, Str', 'void', '(n,k,v)=>globalThis.__utuWutu.attr(n,k,v)'],
  boolean: ['Browser.Element, Str, Bool', 'void', '(n,k,v)=>globalThis.__utuWutu.attr(n,k,!!v)'],
  append: ['Externref', 'void', '(v)=>globalThis.__utuWutu.append(v)'],
  put: ['Externref', 'void', '(v)=>globalThis.__utuWutu.put(v)'],
  node: ['Browser.Node', 'void', '(v)=>globalThis.__utuWutu.append(v)'],
  event: ['Browser.Element, Str, cl(Browser.Event) void', 'void', '(n,e,h)=>globalThis.__utuWutu.listen(n,e,h)'],
  leave: ['', 'void', '()=>{globalThis.__utuWutu.leave()}'],
  index: ['U64', 'void', '(i)=>globalThis.__utuWutu.pushCall(String(i))'],
  // A slot's or a loop's key: the template's hash and the site's position
  // (one string per template, not one per site).
  call: ['Str, I32', 'void', '(h,p)=>globalThis.__utuWutu.pushCall("call:"+h+":"+p)'],
  loop: ['Str, I32', 'void', '(h,p)=>globalThis.__utuWutu.pushCall("loop:"+h+":"+p)'],
  globalKey: ['Str', 'void', '(k)=>globalThis.__utuWutu.pushGlobal(k)'],
  key: ['Str', 'void', '(k)=>globalThis.__utuWutu.pushKey(k)'],
  unkey: ['', 'void', '()=>globalThis.__utuWutu.popKey()'],
  mount: ['cl() Browser.HTMLElement, Str', 'Browser.HTMLElement', '(f,k)=>globalThis.__utuWutu.mount(f,k)'],
  style: ['Str', 'void', '(s)=>globalThis.__utuWutu.style(s)'],
};

const STATIC_STYLE_HELPER = ['Str', 'void',
  "(s)=>{if([...document.querySelectorAll('style')].some(n=>n.textContent===s))return;const n=document.createElement('style');n.textContent=s;document.head.append(n);}"];

/**
 * A JS string literal that is safe inside an `@es/\ ... \/` envelope: a
 * slash next to a backslash would otherwise open or close the envelope.
 * JSON never escapes `/`, so a preceding backslash always ends an escape.
 */
function esString(text) {
  return JSON.stringify(text).replace(/\/(?=\\)|(?<=\\)\//g, '\\u002f');
}

/** Deterministic FNV-1a hash, base 36: stable class names and view identities. */
function hash(text) {
  let n = 2166136261;
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619);
  return (n >>> 0).toString(36);
}

export function expandWutu(doc, parser, createDocument, reactiveProject = false) {
  const reconcile = reactiveProject
    || [...doc.querySelectorAll('ir-dsl[name="wutu"]')].some(site => REACTIVE_DIRECTIVE.test(site.getAttribute('body') ?? ''));
  const counter = { serial: 0, expansions: 0 };
  // Expansion can produce new @wutu sites (templates inside interpolations),
  // so repeat until none remain. A site without a body is a recovered parse
  // error that the syntax diagnostics already report.
  for (;;) {
    const sites = [...doc.querySelectorAll('ir-dsl[name="wutu"]')].filter(site => site.getAttribute('body') != null);
    if (!sites.length) return;
    for (const site of sites) {
      if (++counter.expansions > MAX_EXPANSIONS) throw new Error('Wutu expansion limit exceeded');
      try {
        new SiteExpander({ site, parser, createDocument, reconcile, counter }).expand();
      } catch (error) {
        throw siteDiagnostic(site, error);
      }
    }
  }
}

function siteDiagnostic(site, error) {
  if (error.wutuOffset == null) return compilerError(DIAGNOSTIC_KINDS.INVALID_DSL_USAGE, error.message, site);
  const offset = Number(site.attr('data-body-inner-start')) + error.wutuOffset;
  const point = site.cloneNode(false);
  stampSourceRange(point, offset, offset + 1);
  return compilerError(DIAGNOSTIC_KINDS.INVALID_DSL_USAGE, error.message, point);
}

/** Give `node` the absolute source range [start, end) of its own file. */
function stampSourceRange(node, start, end) {
  const source = node.ownerDocument.__utuSourceText ?? '';
  const position = offset => {
    const lines = source.slice(0, offset).split('\n');
    return [lines.length, lines.at(-1).length + 1];
  };
  node.setAttribute('data-start', start);
  node.setAttribute('data-end', end);
  const [row, col] = position(start);
  const [endRow, endCol] = position(end);
  node.setAttribute('data-row', row);
  node.setAttribute('data-col', col);
  node.setAttribute('data-end-row', endRow);
  node.setAttribute('data-end-col', endCol);
}

class SiteExpander {
  constructor({ site, parser, createDocument, reconcile, counter }) {
    this.site = site;
    this.parser = parser;
    this.createDocument = createDocument;
    this.reconcile = reconcile;
    this.body = site.getAttribute('body');
    this.innerStart = Number(site.attr('data-body-inner-start'));
    this.viewHash = hash(this.body);
    do { this.prefix = `__wutu_${counter.serial++}_`; } while (this.body.includes(this.prefix));
    this.nodeCount = 0;
    this.splices = new Map();
    this.aliases = [];
    this.styles = new Map();
    this.declarations = [];
    this.declared = new Map();
  }

  expand() {
    const template = parseWutu(this.body.startsWith('/\\') ? this.body.slice(2, -2) : this.body);
    this.prepare(template.root, null);
    for (const css of template.global) this.styles.set(hash(css), css);

    const code = [], events = [];
    const root = this.emitElement(template.root, code, events, false);
    // Shared sheets install in source order so later sheets win the cascade.
    const prelude = template.styleUses.map(style =>
      `${this.helper('style')}(${this.island(style.value, style.range, template.root)});`);
    // Each site owns its CSS import so ordinary reachability shaking removes
    // styles for unused components. The tiny host helper installs it once.
    const css = [...this.styles.values()].join('').replace(/^[ \t]*#[ \t][^\r\n]*/gm, '');
    if (css) {
      const key = esString('wutu-' + hash(css));
      prelude.unshift(`let ${this.prefix}install_css: fun() void = @es/\\ () => { if (!document.getElementById(${key})) { const s=document.createElement('style'); s.id=${key}; s.textContent=${esString(css)}; document.head.append(s); } } \\/; ${this.prefix}install_css();`);
    }
    code.unshift(...prelude);

    const render = `{ ${this.declarations.join('\n')} ${code.join('\n')} ${events.join('\n')} ${root}; }`;
    let value = render;
    if (template.reactive) {
      const mount = this.helper('mount');
      value = `${this.declarations.at(-1)} ${mount}(cl() Browser.HTMLElement ${render}, ${template.scope ?? '""'})`;
    }
    const source = `{ ${this.reconcile ? 'wutu.init();' : ''} ${value}; }`;
    this.site.replaceWith(expressionFromSource(this.parser, source, this.site, this.splices, { createDocument: this.createDocument }));
  }

  /** Link parents, number elements, and collect `as` aliases (pre-order). */
  prepare(node, parent) {
    node.parent = parent;
    if (node.kind === 'element') {
      node.index = this.nodeCount++;
      node.uid = `${this.prefix}node${node.index}`;
      if (node.binding) this.aliases.push(node);
    }
    for (const child of [...(node.children ?? []), ...(node.otherwise ?? [])]) this.prepare(child, node);
  }

  /**
   * Resolve an identifier to the nearest alias visible from `owner`: an
   * enclosing element's own alias, or a unique alias inside an enclosing
   * subtree. Unresolved names are ordinary Utu identifiers.
   */
  resolveAlias(name, owner, offset) {
    const within = (node, ancestor) => {
      for (let n = node; n; n = n.parent) if (n === ancestor) return true;
      return false;
    };
    for (let scope = owner; scope; scope = scope.parent) {
      if (scope.binding === name) return scope.uid;
      const matches = this.aliases.filter(node => node.binding === name && within(node, scope));
      if (matches.length === 1) return matches[0].uid;
      if (matches.length > 1) throw new WutuSyntaxError(`Ambiguous element alias '${name}'; reference it inside its own subtree`, offset);
    }
    return name;
  }

  /**
   * Parse a Utu island with its exact source range and register it as a
   * splice. Returns the placeholder identifier to embed in generated code.
   * Sources without a range (string literals) are embedded verbatim.
   */
  island(source, range, owner) {
    if (!range) return source;
    const key = `${this.prefix}expr${this.splices.size}`;
    let expr;
    try {
      expr = expressionFromSource(this.parser, source, this.site, new Map(), {
        sourceStart: this.innerStart + range.start,
        createDocument: this.createDocument,
      });
    } catch (error) {
      throw new WutuSyntaxError(error.message, range.start);
    }
    for (const ident of [expr, ...expr.querySelectorAll('ir-ident')].filter(n => n.localName === 'ir-ident')) {
      const name = ident.getAttribute('name');
      if (hasLexicalShadow(ident, name)) continue;
      ident.setAttribute('name', this.resolveAlias(name, owner, Number(ident.attr('data-start')) - this.innerStart));
    }
    this.splices.set(key, expr);
    return key;
  }

  /**
   * Splice compiler-generated code whose diagnostics belong to one template
   * statement rather than the whole literal. Embedded islands keep their own
   * exact ranges; the generated scaffolding takes `range`.
   */
  locatedSplice(source, range) {
    const key = `${this.prefix}expr${this.splices.size}`;
    const expr = expressionFromSource(this.parser, source, this.site, this.splices, { createDocument: this.createDocument });
    const [start, end] = [this.innerStart + range.start, this.innerStart + range.end];
    for (const node of [expr, ...expr.querySelectorAll('*')]) {
      if (node.attr('data-synthetic') === 'true') stampSourceRange(node, start, end);
    }
    this.splices.set(key, expr);
    return key;
  }

  /** The text a written string (`"…"`) means, or null for any other source. */
  literal(source) {
    return /^"[^"]*"$/.test(source) ? decodeEscapes(source.slice(1, -1)) : null;
  }

  /** An element's classes, its scoped CSS's among them (registered here). */
  classesOf(node) {
    const classes = [...node.classes];
    if (node.css.length) {
      const css = node.css.map(rule => rule.css).join(''), key = 'w' + hash(css);
      this.styles.set(key, `.${key}{${css}}`);
      classes.push(key);
    }
    return classes;
  }

  /** The attributes known when compiling: the classes (unless a written class merges them) and written values. */
  staticAttributes(node, classes) {
    const attributes = {};
    const dynamicClass = node.attrs.some(attr => attr.name === 'class');
    if (classes.length && !dynamicClass) attributes.class = classes.join(' ');
    for (const attr of node.attrs) {
      if (attr.dynamic || attr.property || attr.name === 'class') continue;
      const value = this.literal(attr.value);
      if (value != null) attributes[attr.name] = value;
    }
    return attributes;
  }

  /**
   * Whether nothing in an element's subtree changes between renders: no
   * expressions, events, bindings, styles, or aliases; only written text.
   * (Raw-text elements are left to the general path.)
   */
  isStill(node) {
    if (node.binding || node.events.length || node.twoWay.length || node.styles?.length) return false;
    if (['script', 'style', 'textarea', 'template'].includes(node.tag)) return false;
    if (node.attrs.some(attr => attr.dynamic || attr.property || this.literal(attr.value) == null)) return false;
    return node.children.every(child => child.kind === 'element' ? this.isStill(child)
      : child.kind === 'text' && this.literal(child.expr) != null);
  }

  /** A still subtree's description: `[tag, {attributes}, ...children]`. */
  description(node) {
    return [node.tag, this.staticAttributes(node, this.classesOf(node)),
      ...node.children.map(child => child.kind === 'element' ? this.description(child) : this.literal(child.expr))];
  }

  /** Declare (once per site) a typed binding to a reconciler entry point. */
  helper(kind) {
    if (this.declared.has(kind)) return this.declared.get(kind);
    // Static projects never load the reconciler; `@style` installs directly.
    const [params, result, js] = kind === 'style' && !this.reconcile ? STATIC_STYLE_HELPER : RUNTIME_HELPERS[kind];
    const name = this.prefix + kind;
    this.declarations.push(`let ${name}: fun(${params}) ${result} = @es/\\ ${js} \\/;`);
    this.declared.set(kind, name);
    return name;
  }

  /**
   * The reconciler's shell() or still(), typed to return the element's
   * concrete interface. An element is known by its template's hash and its
   * index there (`v<hash>:<index>`), put together in the glue.
   */
  element(entry, tag, svg) {
    const kind = `${entry}_${svg ? 'svg_' : ''}${tag}`;
    if (this.declared.has(kind)) return this.declared.get(kind);
    const type = svg ? 'Browser.SVGElement' : `Browser.HTML${ELEMENT_INTERFACES[tag] ?? ''}Element`;
    const name = this.prefix + kind;
    this.declarations.push(`let ${name}: fun(Str, Str, I32) ${type} = @es/\\ (d,h,i)=>globalThis.__utuWutu.${entry}(d,${svg},"v"+h+":"+i) \\/;`);
    this.declared.set(kind, name);
    return name;
  }

  /**
   * Emit statements creating `node` into `code`; listeners go to `events` so
   * they attach after siblings exist. Returns the element's local name.
   */
  emitElement(node, code, events, svg) {
    svg = svg || node.tag === 'svg';
    const id = node.uid;
    const properties = [];
    const site = `${JSON.stringify(this.viewHash)}, ${node.index}`;
    // A still subtree is one call; it joins its parent where it is made.
    if (this.reconcile && this.isStill(node)) {
      code.push(`let ${id} = ${this.element('still', node.tag, svg)}(${JSON.stringify(JSON.stringify(this.description(node)))}, ${site});`);
      return id;
    }
    const classes = this.classesOf(node);
    // Reconciled, the static attributes come with the element, in its shell.
    const shell = this.reconcile ? this.staticAttributes(node, classes) : {};
    if (this.reconcile) {
      code.push(`let ${id} = ${this.element('shell', node.tag, svg)}(${JSON.stringify(JSON.stringify([node.tag, shell]))}, ${site});`);
    } else {
      const create = svg ? `createElementNS("${SVG_NAMESPACE}", ` : 'createElement(';
      code.push(`let ${id} = Browser.document.${create}${JSON.stringify(node.tag)});`);
      if (classes.length) code.push(`${id}.setAttribute("class", ${JSON.stringify(classes.join(' '))});`);
    }

    for (const attr of node.attrs) {
      if (attr.name in shell && attr.name !== 'class') continue;
      const value = this.island(attr.value, attr.range, node);
      const name = JSON.stringify(attr.name);
      if (attr.property) {
        // Avoid assigning an unchanged value: selection/caret survives updates.
        properties.push(`if ${id}.${attr.name} != (${value}) { ${id}.${attr.name} = (${value}); };`);
        continue;
      }
      const isBoolean = BOOLEAN_ATTRIBUTES.has(attr.name) && attr.dynamic;
      const mergedClass = attr.name === 'class' && classes.length ? `${JSON.stringify(classes.join(' ') + ' ')}.concat((${value}))` : null;
      if (this.reconcile) {
        if (isBoolean) code.push(`${this.helper('boolean')}(${id}, ${name}, (${value}));`);
        else code.push(`${this.helper('attr')}(${id}, ${name}, ${mergedClass ?? `(${value})`});`);
      } else if (mergedClass) {
        code.push(`${id}.setAttribute("class", ${mergedClass});`);
      } else if (isBoolean) {
        code.push(`if (${value}) { ${id}.setAttribute(${name}, ""); };`);
      } else {
        code.push(`${id}.setAttribute(${name}, (${value}));`);
      }
    }

    for (const style of node.styles ?? []) {
      const value = this.island(style.value, style.range, node);
      const property = JSON.stringify(style.property);
      // Browsers skip invalidation when a property is set to its current value.
      code.push(`${id}.style.setProperty(${property}, (${value}));`);
    }

    const parent = { node, id, childSvg: svg && node.tag !== 'foreignObject' };
    for (const child of node.children) this.emitChild(parent, child, code, events);
    if (this.reconcile) code.push(`${this.helper('leave')}();`);
    code.push(...properties);

    for (const binding of node.twoWay) this.emitBinding(node, binding, code, events);
    for (const event of node.events) {
      const handler = this.island(event.handler, event.range, node);
      const prevent = event.name === 'submit' ? 'event.preventDefault();' : '';
      const type = EVENT_TYPES[event.name];
      // `on mousemove { … }` gets `event: MouseEvent`, as HTMLElementEventMap
      // types it: a handler that names `event` (one that does not checks nothing).
      const named = /(^|[^\w.])event\b/.test(event.handler);
      const listener = !event.shorthand ? handler : type && named
        ? `cl(__wutu_event) void { alt __wutu_event { Browser.${type} |event| => { ${prevent} ${handler}; }, ~> {}, }; }`
        : `cl(event) void { ${prevent} ${handler}; }`;
      const name = JSON.stringify(event.name);
      events.push(this.reconcile
        ? `${this.helper('event')}(${id}, ${name}, (${listener}));`
        : `${id}.addEventListener(${name}, (${listener}));`);
    }
    return id;
  }

  /** `bind:value|checked|number`: write the property on render, read it back on input. */
  emitBinding(node, binding, code, events) {
    if (!this.reconcile) throw new WutuSyntaxError('bind requires an @reactive view in this source file', binding.start);
    const id = node.uid;
    const numeric = binding.property === 'number';
    const property = numeric ? 'valueAsNumber' : binding.property;
    const target = this.island(binding.value, binding.range, node);
    // Type errors in the generated sync code (say, bind:value on an I32
    // field) point at the bind statement, not the whole template.
    const statement = { start: binding.start, end: binding.range.end };
    const sync = `if ${numeric ? `${id}.validity.valid and ` : ''}${id}.${property} != (${target}) { ${id}.${property} = (${target}); }`;
    code.push(`${this.locatedSplice(sync, statement)};`);
    const event = binding.property === 'checked' ? 'change' : 'input';
    // NaN != NaN: an unparsable number entry leaves the state unchanged.
    const update = numeric
      ? `if ${id}.${property} == ${id}.${property} { ${target} = ${id}.${property}; }`
      : `${target} = ${id}.${property}`;
    events.push(`${this.helper('event')}(${id}, "${event}", cl(event) void { ${this.locatedSplice(update, statement)}; });`);
  }

  /** Statements for a list of children; their listeners attach after them. */
  emitFragment(parent, children) {
    const body = [], handlers = [];
    for (const child of children) this.emitChild(parent, child, body, handlers);
    return body.concat(handlers).join('\n');
  }

  emitChild(parent, child, body, handlers) {
    switch (child.kind) {
      case 'if': {
        const condition = this.island(child.condition, child.conditionRange, child);
        const then = this.emitFragment(parent, child.children);
        const otherwise = this.emitFragment(parent, child.otherwise);
        body.push(`if (${condition}) { ${then} } else { ${otherwise} };`);
        return;
      }
      case 'for':
        body.push(this.emitLoop(parent, child));
        return;
      case 'element': {
        // Reconciled, an element joins its parent when it is entered.
        const value = this.emitElement(child, body, handlers, parent.childSvg);
        if (!this.reconcile) body.push(`${parent.id}.append(${value});`);
        return;
      }
      default: {
        // Text and interpolated values. A reconciled value gets a stable call
        // key, for the elements a component it calls makes; written text
        // (no range) makes none.
        const value = `(${this.island(child.expr, child.range, child)})`;
        if (!this.reconcile) {
          body.push(`${parent.id}.append(${value});`);
          return;
        }
        if (!child.range) {
          body.push(`${this.helper('append')}(${value});`);
          return;
        }
        body.push(`${this.helper('call')}(${JSON.stringify(this.viewHash)}, ${child.range.start});`);
        body.push(`${this.helper('put')}(${value});`);
      }
    }
  }

  emitLoop(parent, loop) {
    const parts = loop.captures.split(',').map(part => part.trim());
    // An unkeyed iteration is known by its index: one the loop does not name is added.
    const unkeyed = this.reconcile && !loop.key;
    const index = parts[1] ?? `${this.prefix}index${this.nodeCount++}`;
    const captures = parts.length > 1 || !unkeyed ? loop.captures : `${loop.captures}, ${index}`;
    const iterable = this.island(loop.iterable, loop.iterableRange, loop);
    let enterKey = '', leaveKey = '';
    if (this.reconcile && loop.key) {
      const push = this.helper(loop.globalKey ? 'globalKey' : 'key');
      enterKey = `${push}(${this.island(loop.key, loop.keyRange, loop)});`;
    } else if (this.reconcile) {
      // Unkeyed iterations are identified by the loop's site and position.
      enterKey = `${this.helper('loop')}(${JSON.stringify(this.viewHash)}, ${loop.iterableRange.start});${this.helper('index')}(${index});`;
    }
    const fragment = this.emitFragment(parent, loop.children);
    if (this.reconcile) {
      const pop = `${this.helper('unkey')}();`;
      leaveKey = loop.key ? pop : pop + pop;
    }
    return `${iterable} each |${captures}| { ${enterKey} ${fragment} ${leaveKey} };`;
  }
}
