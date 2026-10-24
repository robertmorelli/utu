// Wutu template parser. Produces a plain tree consumed by the expander
// (wutu.js) and the formatter (wutu-tooling.js); it never touches the IR.
//
// Node kinds:
//   { kind: 'text', expr }                         "literal";
//   { kind: 'expression', expr, range }            = expr;  or  $[expr];
//   { kind: 'if', condition, conditionRange, children, otherwise, elseIf }
//   { kind: 'for', iterable, iterableRange, captures, key, keyRange, globalKey, children }
//   { kind: 'element', tag, classes, binding, attrs, events, twoWay, css, children }
//
// Element `css` entries are { source, css }: the authored statement (for the
// formatter) and its compiled form scoped to the element (for the expander).
//
// Every range is { start, end } relative to the template text, so callers can
// map diagnostics and Utu islands back to exact source offsets.
import { skipDsl } from './dsl-envelope.js';

const words = (text) => new Set(text.trim().split(/\s+/));

export const BOOLEAN_ATTRIBUTES = words(`
  hidden inert disabled required readonly checked multiple autofocus selected
  open reversed controls autoplay muted loop playsinline novalidate`);

export const VOID_TAGS = words('area base br col embed hr img input link meta param source track wbr');

export const SVG_TAGS = words(`
  svg g path circle ellipse line polyline polygon rect text tspan defs use symbol
  linearGradient radialGradient stop clipPath mask pattern marker title desc foreignObject`);

const SVG_ATTRIBUTES = words(`
  viewBox xmlns width height x y x1 y1 x2 y2 cx cy r rx ry d points fill fill-rule
  fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray
  stroke-dashoffset stroke-opacity opacity transform href offset stop-color stop-opacity
  gradientUnits gradientTransform preserveAspectRatio clip-path mask
  xlink:href xlink:title xml:space xmlns:xlink`);

// The DOM events with a handler attribute (`on` + the name), in any browser.
const EVENT_NAMES = words(`abort activate afterprint afterscriptexecute animationcancel animationend animationiteration animationstart appinstalled auxclick beforeactivate beforecopy beforecut beforedeactivate beforeinput beforeinstallprompt beforematch beforepaste beforeprint beforescriptexecute beforetoggle beforeunload beforexrselect begin blur cancel canplay canplaythrough change click close command contentvisibilityautostatechange contextlost contextmenu contextrestored copy cuechange cut dblclick deactivate devicemotion deviceorientation deviceorientationabsolute drag dragend dragenter dragexit dragleave dragover dragstart drop durationchange emptied encrypted end ended enterpictureinpicture error focus focusin focusout formdata freeze fullscreenchange fullscreenerror gamepadconnected gamepaddisconnected gesturechange gestureend gesturestart gotpointercapture hashchange help input interest invalid keydown keypress keyup languagechange leavepictureinpicture load loadeddata loadedmetadata loadstart loseinterest lostpointercapture message messageerror mousedown mouseenter mouseleave mousemove mouseout mouseover mouseup mousewheel mozfullscreenchange mozfullscreenerror mozpointerlockchange mozpointerlockerror offline online orientationchange overscroll pagehide pagereveal pageshow pageswap paste pause play playing pointercancel pointerdown pointerenter pointerleave pointerlockchange pointerlockerror pointermove pointerout pointerover pointerrawupdate pointerup popstate prerenderingchange progress ratechange readystatechange rejectionhandled repeat reset resize resume scroll scrollend scrollsnapchange scrollsnapchanging search securitypolicyviolation seeked seeking select selectionchange selectstart show slotchange stalled storage submit suspend timeupdate toggle touchcancel touchend touchmove touchstart transitioncancel transitionend transitionrun transitionstart unhandledrejection unload visibilitychange volumechange waiting waitingforkey webkitanimationend webkitanimationiteration webkitanimationstart webkitbeginfullscreen webkitcurrentplaybacktargetiswirelesschanged webkitendfullscreen webkitfullscreenchange webkitfullscreenerror webkitkeyadded webkitkeyerror webkitkeymessage webkitmouseforcechanged webkitmouseforcedown webkitmouseforceup webkitmouseforcewillbegin webkitneedkey webkitplaybacktargetavailabilitychanged webkitpresentationmodechanged webkittransitionend wheel zoom`);

/** Whether `name` is "on" and an event's name, in any case: an event handler's attribute. */
const isOnName = name => /^on/i.test(name) && EVENT_NAMES.has(name.slice(2).toLowerCase());

// Elements whose text HTML holds unescaped (raw text; a script's is code).
const RAW_TEXT_TAGS = words('style noscript iframe xmp noembed noframes plaintext');
const rawTextError = tag => `${tag === 'iframe' ? 'an' : 'a'} ${tag}'s text is unescaped in HTML (a value could close it), so Wutu writes it only as written: ${tag} { "…"; }`;

const HTML_TAGS = words(`
  html head embed param script area base link meta a abbr address article aside audio
  b bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist
  dd del details dfn dialog div dl dt em fieldset figcaption figure footer form h1 h2 h3
  h4 h5 h6 header hgroup hr i iframe img input ins kbd label legend li main map mark menu
  meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby
  s samp search section select slot small source span strong style sub summary sup table
  tbody td template textarea tfoot th thead time title tr track u ul var video wbr`);

const GLOBAL_ATTRIBUTES = words(`
  id class title role tabindex hidden inert lang dir draggable contenteditable spellcheck
  translate slot accesskey part exportparts inputmode enterkeyhint autocapitalize nonce is popover xml:lang`);

const TAG_ATTRIBUTES = Object.fromEntries(Object.entries({
  script: 'src type async defer nonce crossorigin integrity referrerpolicy nomodule',
  style: 'media nonce type',
  embed: 'src type width height',
  param: 'name value',
  area: 'alt coords shape href target download rel',
  base: 'href target',
  link: 'href rel type media sizes crossorigin',
  meta: 'name content charset http-equiv',
  a: 'href target rel download hreflang type',
  button: 'type disabled name value form popovertarget popovertargetaction',
  input: 'type name value placeholder required disabled readonly checked min max step minlength maxlength pattern multiple accept autocomplete autofocus size form',
  textarea: 'name placeholder required disabled readonly rows cols minlength maxlength autocomplete form',
  form: 'action method enctype target autocomplete novalidate',
  label: 'for',
  img: 'src alt width height loading decoding srcset sizes',
  source: 'src srcset sizes type media',
  select: 'name required disabled multiple size form',
  option: 'value selected disabled label',
  optgroup: 'label disabled',
  fieldset: 'disabled form name',
  output: 'for form name',
  details: 'open name',
  dialog: 'open',
  progress: 'value max',
  meter: 'value min max low high optimum',
  ol: 'start reversed type',
  li: 'value',
  time: 'datetime',
  del: 'datetime cite',
  ins: 'datetime cite',
  blockquote: 'cite',
  q: 'cite',
  canvas: 'width height',
  td: 'colspan rowspan headers',
  th: 'colspan rowspan headers scope abbr',
  video: 'src controls autoplay muted loop playsinline poster width height preload',
  audio: 'src controls autoplay muted loop preload',
  iframe: 'src title width height loading allow sandbox referrerpolicy',
}).map(([tag, names]) => [tag, words(names)]));

/** Vocabulary shared with editor completions. */
export const wutuVocabulary = { tags: HTML_TAGS, globals: GLOBAL_ATTRIBUTES, attrs: TAG_ATTRIBUTES };

const isCustomElement = (tag) => tag.includes('-');
const isKnownTag = (tag) => HTML_TAGS.has(tag) || SVG_TAGS.has(tag) || isCustomElement(tag);

function isAllowedAttribute(tag, name) {
  return GLOBAL_ATTRIBUTES.has(name)
    || /^(aria|data)-/.test(name)
    || TAG_ATTRIBUTES[tag]?.has(name)
    || (SVG_TAGS.has(tag) && SVG_ATTRIBUTES.has(name))
    || isCustomElement(tag);
}

const CSS_PROPERTY = /^--[\w-]+$|^-?[a-z][\w-]*$/;

/** The standard CSS properties (lib.dom's CSSStyleDeclaration, and newer ones). */
const CSS_PROPERTIES = words(`accent-color align-content align-items align-self alignment-baseline all anchor-name anchor-scope animation animation-composition animation-delay `
  + `animation-direction animation-duration animation-fill-mode animation-iteration-count animation-name animation-play-state animation-range `
  + `animation-range-end animation-range-start animation-timeline animation-timing-function appearance aspect-ratio backdrop-filter backface-visibility `
  + `background background-attachment background-blend-mode background-clip background-color background-image background-origin background-position `
  + `background-position-x background-position-y background-repeat background-size baseline-shift baseline-source block-size border border-block `
  + `border-block-color border-block-end border-block-end-color border-block-end-style border-block-end-width border-block-start border-block-start-color `
  + `border-block-start-style border-block-start-width border-block-style border-block-width border-bottom border-bottom-color border-bottom-left-radius `
  + `border-bottom-right-radius border-bottom-style border-bottom-width border-collapse border-color border-end-end-radius border-end-start-radius `
  + `border-image border-image-outset border-image-repeat border-image-slice border-image-source border-image-width border-inline border-inline-color `
  + `border-inline-end border-inline-end-color border-inline-end-style border-inline-end-width border-inline-start border-inline-start-color `
  + `border-inline-start-style border-inline-start-width border-inline-style border-inline-width border-left border-left-color border-left-style `
  + `border-left-width border-radius border-right border-right-color border-right-style border-right-width border-spacing border-start-end-radius `
  + `border-start-start-radius border-style border-top border-top-color border-top-left-radius border-top-right-radius border-top-style border-top-width `
  + `border-width bottom box-decoration-break box-shadow box-sizing break-after break-before break-inside caption-side caret-color clear clip clip-path `
  + `clip-rule color color-interpolation color-interpolation-filters color-scheme column-count column-fill column-gap column-rule column-rule-color `
  + `column-rule-style column-rule-width column-span column-width columns contain contain-intrinsic-block-size contain-intrinsic-height `
  + `contain-intrinsic-inline-size contain-intrinsic-size contain-intrinsic-width container container-name container-type content content-visibility `
  + `counter-increment counter-reset counter-set cursor cx cy d direction display dominant-baseline dynamic-range-limit empty-cells field-sizing fill `
  + `fill-opacity fill-rule filter flex flex-basis flex-direction flex-flow flex-grow flex-shrink flex-wrap float flood-color flood-opacity font `
  + `font-family font-feature-settings font-kerning font-optical-sizing font-palette font-size font-size-adjust font-stretch font-style font-synthesis `
  + `font-synthesis-small-caps font-synthesis-style font-synthesis-weight font-variant font-variant-alternates font-variant-caps font-variant-east-asian `
  + `font-variant-ligatures font-variant-numeric font-variant-position font-variation-settings font-weight forced-color-adjust gap grid grid-area `
  + `grid-auto-columns grid-auto-flow grid-auto-rows grid-column grid-column-end grid-column-gap grid-column-start grid-gap grid-row grid-row-end `
  + `grid-row-gap grid-row-start grid-template grid-template-areas grid-template-columns grid-template-rows height hyphenate-character `
  + `hyphenate-limit-chars hyphens image-orientation image-rendering initial-letter inline-size inset inset-block inset-block-end inset-block-start `
  + `inset-inline inset-inline-end inset-inline-start interpolate-size isolation justify-content justify-items justify-self left letter-spacing `
  + `lighting-color line-break line-clamp line-height list-style list-style-image list-style-position list-style-type margin margin-block margin-block-end `
  + `margin-block-start margin-bottom margin-inline margin-inline-end margin-inline-start margin-left margin-right margin-top marker marker-end marker-mid `
  + `marker-start mask mask-clip mask-composite mask-image mask-mode mask-origin mask-position mask-repeat mask-size mask-type math-depth math-style `
  + `max-block-size max-height max-inline-size max-width min-block-size min-height min-inline-size min-width mix-blend-mode object-fit object-position `
  + `offset offset-anchor offset-distance offset-path offset-position offset-rotate opacity order orphans outline outline-color outline-offset `
  + `outline-style outline-width overflow overflow-anchor overflow-block overflow-clip-margin overflow-inline overflow-wrap overflow-x overflow-y overlay `
  + `overscroll-behavior overscroll-behavior-block overscroll-behavior-inline overscroll-behavior-x overscroll-behavior-y padding padding-block `
  + `padding-block-end padding-block-start padding-bottom padding-inline padding-inline-end padding-inline-start padding-left padding-right padding-top `
  + `page page-break-after page-break-before page-break-inside paint-order perspective perspective-origin place-content place-items place-self `
  + `pointer-events position position-anchor position-area position-try position-try-fallbacks position-try-order position-visibility print-color-adjust `
  + `quotes r reading-flow reading-order resize right rotate row-gap ruby-align ruby-position rx ry scale scroll-behavior scroll-margin scroll-margin-block `
  + `scroll-margin-block-end scroll-margin-block-start scroll-margin-bottom scroll-margin-inline scroll-margin-inline-end scroll-margin-inline-start `
  + `scroll-margin-left scroll-margin-right scroll-margin-top scroll-padding scroll-padding-block scroll-padding-block-end scroll-padding-block-start `
  + `scroll-padding-bottom scroll-padding-inline scroll-padding-inline-end scroll-padding-inline-start scroll-padding-left scroll-padding-right `
  + `scroll-padding-top scroll-snap-align scroll-snap-stop scroll-snap-type scroll-timeline scroll-timeline-axis scroll-timeline-name scrollbar-color `
  + `scrollbar-gutter scrollbar-width shape-image-threshold shape-margin shape-outside shape-rendering stop-color stop-opacity stroke stroke-dasharray `
  + `stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width tab-size table-layout text-align text-align-last `
  + `text-anchor text-autospace text-box text-box-edge text-box-trim text-combine-upright text-decoration text-decoration-color text-decoration-line `
  + `text-decoration-skip-ink text-decoration-style text-decoration-thickness text-emphasis text-emphasis-color text-emphasis-position text-emphasis-style `
  + `text-indent text-orientation text-overflow text-rendering text-shadow text-size-adjust text-spacing-trim text-transform text-underline-offset `
  + `text-underline-position text-wrap text-wrap-mode text-wrap-style timeline-scope top touch-action transform transform-box transform-origin `
  + `transform-style transition transition-behavior transition-delay transition-duration transition-property transition-timing-function translate `
  + `unicode-bidi user-select vector-effect vertical-align view-timeline view-timeline-axis view-timeline-inset view-timeline-name view-transition-class `
  + `view-transition-name visibility white-space white-space-collapse widows width will-change word-break word-spacing word-wrap writing-mode x y z-index `
  + `zoom`);

/** Edit distance, up to `bound`. */
function editDistance(a, b, bound) {
  if (Math.abs(a.length - b.length) >= bound) return bound;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return Math.min(prev[b.length], bound);
}

/**
 * A standard CSS property `name` is likely a typo of (one edit, two for a
 * long name), or '' for a known one, a prefixed or custom one, or one near
 * none (a property newer than the list).
 */
function nearCssProperty(name) {
  if (!name || name[0] === '-' || CSS_PROPERTIES.has(name)) return '';
  let best = '', bestD = 3;
  for (const p of CSS_PROPERTIES) {
    const d = editDistance(p, name, 3);
    if (d < bestD) { best = p; bestD = d; }
  }
  if (bestD > 1 && name.length <= 6) return '';
  return best;
}

export class WutuSyntaxError extends Error {
  /** @param {number} offset template-relative offset of the problem */
  constructor(message, offset) {
    super(message);
    this.wutuOffset = offset;
  }
}

export function parseWutu(text) {
  return new WutuParser(text).parseTemplate();
}

class WutuParser {
  constructor(text) {
    this.text = text;
    this.p = 0;
  }

  fail(message, offset = this.p) {
    throw new WutuSyntaxError(message, offset);
  }

  /** Match a sticky regex at the cursor without consuming it. */
  peek(regex) {
    regex.lastIndex = this.p;
    return regex.exec(this.text);
  }

  at(literal) {
    return this.text.startsWith(literal, this.p);
  }

  get done() {
    return this.p >= this.text.length;
  }

  // ── Lexical helpers ────────────────────────────────────────────────────────

  /** Whitespace, `//` comments (first on a line or after a blank), and CSS block comments. */
  skipTrivia() {
    const { text } = this;
    while (this.p < text.length) {
      const c = text[this.p];
      if (/\s/.test(c)) {
        this.p++;
      } else if (this.at('//') && this.afterBlank(this.p)) {
        this.skipLine();
      } else if (c === '#' && /[ \t]/.test(text[this.p + 1] ?? '')) {
        this.fail('Wutu comments are written // …');
      } else if (this.at('/*')) {
        const end = text.indexOf('*/', this.p + 2);
        if (end < 0) this.fail('unterminated comment');
        this.p = end + 2;
      } else {
        return;
      }
    }
  }

  /** Whether offset `p` starts the text or follows a blank (a `//` there is a comment, not `url(http://…)`). */
  afterBlank(p) {
    return p === 0 || /\s/.test(this.text[p - 1]);
  }

  skipLine() {
    const end = this.text.indexOf('\n', this.p);
    this.p = end < 0 ? this.text.length : end;
  }

  expectSemicolon() {
    const statementEnd = this.p;
    this.skipTrivia();
    if (this.text[this.p] !== ';') this.fail('expected ; after Wutu statement', statementEnd);
    this.p++;
  }

  /** A quoted string, CSS or Utu: a backslash escapes the character after it. */
  readQuoted() {
    const start = this.p, quote = this.text[this.p++];
    while (this.p < this.text.length) {
      const c = this.text[this.p];
      if (c === '\\') { this.p += 2; continue; }
      this.p++;
      if (c === quote) return this.text.slice(start, this.p);
    }
    this.fail('unterminated string', start);
  }

  /**
   * Skip a Utu token whose contents must not count as delimiters: a nested
   * DSL literal, a string, or a line comment. Returns whether it skipped.
   */
  skipOpaqueUtu() {
    const c = this.text[this.p];
    if (c === '@') {
      let end;
      try { end = skipDsl(this.text, this.p); } catch (error) { this.fail(error.message); }
      if (end > this.p) { this.p = end; return true; }
    } else if (c === '"') {
      this.readQuoted();
      return true;
    } else if (this.at('//')) {
      this.skipLine();
      return true;
    }
    return false;
  }

  // ── Utu expressions ────────────────────────────────────────────────────────

  /** `= expression;` form: everything up to the statement's semicolon. */
  readBareExpression() {
    this.skipTrivia();
    const start = this.p;
    let depth = 0;
    while (!this.done) {
      if (this.skipOpaqueUtu()) continue;
      const c = this.text[this.p];
      if (c === ';' && depth === 0) {
        return { source: this.text.slice(start, this.p).trim(), range: { start, end: this.p } };
      }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) {
        if (depth === 0) this.fail('expected ; after expression');
        depth--;
      }
      this.p++;
    }
    this.fail('unterminated expression', start);
  }

  /**
   * An expression up to the first top-level character in `ends` (not
   * consumed): `if cond {`, `for items |item|`, `key item.id {`. Braces or
   * pipes of its own go in parentheses: `if (xs any |x| { x.done; }) {`.
   */
  readExpressionUntil(ends, what) {
    this.skipTrivia();
    if (this.at('$[')) this.failInterpolation();
    const start = this.p;
    let depth = 0;
    while (!this.done) {
      if (this.skipOpaqueUtu()) continue;
      const c = this.text[this.p];
      if (depth === 0 && ends.includes(c)) {
        const source = this.text.slice(start, this.p).trim();
        if (!source) this.fail(`expected ${what}`);
        return { source, range: { start, end: start + this.text.slice(start, this.p).trimEnd().length } };
      }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) {
        if (depth === 0) this.fail(`expected ${what}`);
        depth--;
      }
      this.p++;
    }
    this.fail(`unterminated ${what}`, start);
  }

  /** `"text" name…`: a string, then (no operator) another statement: a forgotten `;`. */
  checkLiteralThenName() {
    const m = this.peek(/"(?:[^"\\\n]|\\.)*"(\s*)([A-Za-z_][\w-]*)/y);
    if (m && !['and', 'or', 'not', 'orelse'].includes(m[2])) this.fail('expected ; after Wutu statement', this.p + m[0].length - m[1].length - m[2].length);
  }

  failInterpolation() {
    this.fail('Wutu no longer writes $[…]: an expression stands on its own (= expr; for text, name = expr; for an attribute, if cond {, prop: = expr;)');
  }

  /** A brace-delimited Utu block, returned with its braces. */
  readUtuBlock() {
    const start = this.p;
    let depth = 0;
    do {
      if (this.skipOpaqueUtu()) continue;
      const c = this.text[this.p];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      this.p++;
    } while (!this.done && depth > 0);
    if (depth) this.fail('unterminated event handler', start);
    return { source: this.text.slice(start, this.p), range: { start, end: this.p } };
  }

  // ── CSS ────────────────────────────────────────────────────────────────────

  /**
   * Balanced CSS scan: delimiters inside strings, functions, and attribute
   * selectors are data, including semicolons in url(data:...).
   */
  readCssUntil(delimiters) {
    const start = this.p;
    let parens = 0, brackets = 0;
    while (!this.done) {
      const c = this.text[this.p];
      if (c === '"' || c === "'") { this.readQuoted(); continue; }
      if (!parens && !brackets && delimiters.includes(c)) break;
      if (c === '(') parens++;
      else if (c === ')') parens--;
      else if (c === '[') brackets++;
      else if (c === ']') brackets--;
      this.p++;
    }
    return this.text.slice(start, this.p).trim();
  }

  /**
   * The body of a `{ ... }` CSS block (cursor on the brace); returned without
   * braces, and without its `//` comments (CSS has none; `url(http://…)` is
   * not one: a comment starts first on a line or after a blank, outside
   * parentheses).
   */
  readCssBlock() {
    const open = this.p;
    let start = ++this.p, body = '', depth = 1, parens = 0;
    while (!this.done) {
      if (this.at('/*')) {
        const end = this.text.indexOf('*/', this.p + 2);
        if (end < 0) this.fail('unterminated CSS comment');
        this.p = end + 2;
        continue;
      }
      const c = this.text[this.p];
      if (c === '"' || c === "'") { this.readQuoted(); continue; }
      if (c === '/' && this.at('//') && parens === 0 && this.afterBlank(this.p)) {
        body += this.text.slice(start, this.p);
        this.skipLine();
        start = this.p;
        continue;
      }
      if (c === '#' && /[ \t]/.test(this.text[this.p + 1] ?? '')) this.fail('Wutu comments are written // …');
      if (c === '(') parens++;
      else if (c === ')') parens--;
      if (c === '{') depth++;
      if (c === '}') {
        const before = (body + this.text.slice(start, this.p)).replace(/\/\*[\s\S]*?\*\//g, '').trimEnd();
        if (before && !/[;{}]$/.test(before)) this.fail('CSS declarations require a semicolon');
        if (--depth === 0) return body + this.text.slice(start, this.p++);
      }
      this.p++;
    }
    this.fail('unterminated CSS block', open);
  }

  // ── Template structure ─────────────────────────────────────────────────────

  parseTemplate() {
    this.skipTrivia();
    let reactive = false, scope = null;
    const styleUses = [], global = [];
    if (this.at('@reactive')) {
      this.p += '@reactive'.length;
      this.expectSemicolon();
      reactive = true;
      this.skipTrivia();
    }
    if (this.at('@island')) {
      this.p += '@island'.length;
      this.skipTrivia();
      if (this.text[this.p] !== '"') this.fail('expected a quoted island name: @island "name";');
      scope = this.readQuoted();
      this.expectSemicolon();
      reactive = true;
      this.skipTrivia();
    }
    while (this.at('@style')) {
      this.p += '@style'.length;
      this.skipTrivia();
      if (this.at('$[')) this.failInterpolation();
      const { source, range } = this.readBareExpression();
      this.expectSemicolon();
      styleUses.push({ value: source, range });
      this.skipTrivia();
    }
    while (this.at('@document')) {
      this.p += '@document'.length;
      this.skipTrivia();
      if (this.text[this.p] !== '{') this.fail('expected document CSS block');
      global.push(this.readCssBlock());
      this.skipTrivia();
    }
    const root = this.parseNode();
    if (root.kind !== 'element') this.fail('root must be an element', root.start);
    this.skipTrivia();
    if (!this.done) this.fail('expected exactly one root element; use a component for siblings');
    return { root, global, reactive, scope, styleUses };
  }

  /** Anything that can appear as a child: text, expression, if, for, or element. */
  parseNode() {
    this.skipTrivia();
    const start = this.p;
    if (this.text[this.p] === '"') {
      const expr = this.readQuoted();
      this.expectSemicolon();
      return { kind: 'text', expr, start };
    }
    if (this.at('$[')) this.failInterpolation();
    if (this.text[this.p] === '=') {
      this.p++;
      const { source, range } = this.readBareExpression();
      this.expectSemicolon();
      return { kind: 'expression', expr: source, range, start };
    }
    if (this.peek(/if\s/y)) return this.parseIf();
    if (this.peek(/for\s/y)) return this.parseFor();
    return this.parseElement();
  }

  parseBranch() {
    this.skipTrivia();
    const open = this.p;
    if (this.text[this.p] !== '{') this.fail('expected {');
    this.p++;
    const children = [];
    for (;;) {
      this.skipTrivia();
      if (this.done) this.fail('unterminated branch', open);
      if (this.text[this.p] === '}') { this.p++; return children; }
      children.push(this.parseNode());
    }
  }

  parseIf() {
    const start = this.p;
    this.p += 'if'.length;
    const condition = this.readExpressionUntil('{', 'a condition before {');
    const children = this.parseBranch();
    this.skipTrivia();
    let otherwise = [];
    if (this.peek(/else\s+if\s/y)) {
      this.p += 'else'.length;
      this.skipTrivia();
      otherwise = [{ ...this.parseIf(), elseIf: true }];
    } else if (this.peek(/else\s*\{/y)) {
      this.p += 'else'.length;
      otherwise = this.parseBranch();
    }
    return { kind: 'if', condition: condition.source, conditionRange: condition.range, children, otherwise, elseIf: false, start };
  }

  parseFor() {
    const start = this.p;
    this.p += 'for'.length;
    // (The loop's body joins the iterable's pipeline: parentheses that only
    // hide its own `|…|` go.)
    const iterable = unparenthesized(this.readExpressionUntil('|', 'what to iterate, then |item|'));
    const capture = this.peek(/\|\s*([a-z_]\w*(?:\s*,\s*[a-z_]\w*)?)\s*\|/y);
    if (!capture) this.fail('expected |item| or |item, index| after iterable');
    this.p += capture[0].length;
    this.skipTrivia();
    let key = null, globalKey = false;
    if (this.peek(/key\s/y)) {
      this.p += 'key'.length;
      this.skipTrivia();
      if (this.peek(/global\s/y)) {
        this.p += 'global'.length;
        this.skipTrivia();
        globalKey = true;
      }
      key = this.readExpressionUntil('{', 'a key before {');
    }
    return {
      kind: 'for',
      iterable: iterable.source,
      iterableRange: iterable.range,
      captures: capture[1],
      key: key?.source ?? null,
      keyRange: key?.range ?? null,
      globalKey,
      children: this.parseBranch(),
      start,
    };
  }

  parseElement() {
    const start = this.p;
    const head = this.peek(/[a-z][\w-]*/y);
    if (!head) this.fail('expected an HTML tag (class-only heads do not create elements)');
    const tag = head[0];
    if (!isKnownTag(tag)) this.fail(`expected an HTML tag, found unknown element '${tag}' (custom element names need a hyphen)`);
    this.p += tag.length;
    const node = { kind: 'element', tag, classes: [], binding: null, attrs: [], events: [], twoWay: [], css: [], styles: [], children: [], start };

    while (this.text[this.p] === '.' || this.text[this.p] === '#') {
      const shorthand = this.text[this.p++];
      const name = this.peek(/[\w-]+/y);
      if (!name) this.fail('expected class or id');
      this.p += name[0].length;
      if (shorthand === '.') node.classes.push(name[0]);
      else node.attrs.push({ name: 'id', value: JSON.stringify(name[0]), property: false, dynamic: false, range: null, start: this.p, shorthand: true });
    }
    this.skipTrivia();
    if (this.peek(/as\s/y)) {
      this.p += 'as'.length;
      this.skipTrivia();
      const binding = this.peek(/[a-z_]\w*/y);
      if (!binding) this.fail('expected node binding');
      node.binding = binding[0];
      this.p += binding[0].length;
      this.skipTrivia();
    }
    if (this.text[this.p] !== '{') this.fail('expected { after element head');
    this.p++;

    for (;;) {
      this.skipTrivia();
      if (this.done) this.fail(`unterminated element '${tag}'`, start);
      if (this.text[this.p] === '}') { this.p++; break; }
      this.parseElementStatement(node);
    }
    if (VOID_TAGS.has(tag) && node.children.length) this.fail(`${tag} cannot have children`, start);
    const code = tag === 'script' && node.children.find(c => c.kind !== 'text');
    if (code) this.fail('a script\'s text is code, so Wutu writes it only as written: script { "…"; }', code.start);
    // (An element's text and attributes are escaped.)
    const raw = RAW_TEXT_TAGS.has(tag) && node.children.find(c => c.kind !== 'text' && c.kind !== 'element');
    if (raw) this.fail(rawTextError(tag), raw.start);
    if (node.unmanaged && node.children.length) this.fail(`an @unmanaged ${tag} has no children in its template: what is inside it is JavaScript's`, start);
    return node;
  }

  parseElementStatement(node) {
    const { text } = this;
    const c = text[this.p];
    let match;
    if (c === ';') {
      this.p++;
    } else if (this.at('$[')) {
      this.failInterpolation();
    } else if (c === '"' || c === '=' || this.peek(/(if|for)\s/y)) {
      node.children.push(this.parseNode());
    } else if ((match = this.peek(/bind:(value|checked|number|group|values|files)\s*=/y))) {
      const start = this.p;
      this.p += match[0].length;
      const { source, range } = this.readBareExpression();
      this.expectSemicolon();
      node.twoWay.push({ property: match[1], value: source, range, start });
    } else if ((match = this.peek(/on\s+([\w-]+)(\s+quiet)?(?:\s*\|\s*([a-z_]\w*)\s*\|)?\s*(?=[{=])/y))) {
      // `on click [quiet] [|e|] { … }` or `on click = handler;`
      const start = this.p;
      this.p += match[0].length;
      const event = { name: match[1], quiet: !!match[2], param: match[3] ?? null, start };
      if (this.text[this.p] === '=') {
        if (event.param) this.fail('a handler value names its own parameter: on click = cl(e) void { … };');
        this.p++;
        const { source, range } = this.readBareExpression();
        this.expectSemicolon();
        node.events.push({ ...event, handler: source, range, shorthand: false });
      } else {
        const { source, range } = this.readUtuBlock();
        node.events.push({ ...event, handler: source, range, shorthand: true });
      }
    } else if (this.peek(/@unmanaged\s*;/y)) {
      // The template makes the element; what JavaScript does to its children
      // and its other attributes, renders leave alone.
      this.p = this.text.indexOf(';', this.p) + 1;
      node.unmanaged = true;
      node.attrs.push({ name: 'data-wutu-unmanaged', value: '""', property: false, dynamic: false, range: null, start: this.p });
    } else if (c === '<') {
      this.failOldAttribute();
    } else if ((match = this.peek(/@([\w-]+)\s*=/y))) {
      this.fail(`events are written on ${match[1]} = handler; (or on ${match[1]} { … })`);
    } else if (this.peek(/\.[\w-]+\s*=(?!=)/y)) {
      this.p++;
      this.parseAttribute(node, true);
    } else if (this.peek(/(?:(?:xlink|xmlns|xml):)?[a-z][\w-]*\s*(?:=(?!=)|;|\})/y)) {
      // (`xlink:href = …;`: a namespaced attribute; no CSS property has those prefixes.)
      this.parseAttribute(node, false);
    } else if (c === ':' || c === '@' || c === '&') {
      this.parseCssRule(node);
    } else {
      this.parseDeclarationOrChild(node);
    }
  }

  /** `<name = value;`, the spelling before attributes lost their `<`: say the new one. */
  failOldAttribute() {
    const old = this.peek(/<(\.?)([\w-]+)/y);
    const spelled = old ? `${old[1]}${old[2]}` : 'name';
    this.fail(`attributes are written without '<': ${spelled} = value; (or ${spelled}; for a boolean attribute)`);
  }

  /**
   * `name = value;` or `name;` (an attribute), `.name = value;` (a property);
   * the cursor is on the name. A value that is one string literal is
   * written into the element; anything else is an expression.
   */
  parseAttribute(node, isProperty) {
    const nameStart = this.p;
    const name = this.peek(isProperty ? /[\w-]+/y : /(?:(?:xlink|xmlns|xml):)?[\w-]+/y)[0];
    this.p += name.length;
    this.skipTrivia();
    let value = '""', dynamic = false, range = null;
    if (this.text[this.p] === '=') {
      this.p++;
      this.skipTrivia();
      if (this.at('$[')) this.failInterpolation();
      const literal = this.text[this.p] === '"' && this.peek(/"(?:[^"\\\n]|\\.)*"\s*;/y);
      if (literal) {
        value = this.readQuoted();
      } else {
        this.checkLiteralThenName();
        const expression = this.readBareExpression();
        dynamic = true;
        value = expression.source;
        range = expression.range;
      }
    } else if (isProperty) {
      this.fail('a property takes a value: .name = value;');
    }
    this.expectSemicolon();
    if (isOnName(name)) this.fail(`events are written on ${name.slice(2)} { … }, not as an attribute`, nameStart);
    if (dynamic && node.tag === 'script') this.fail('a script\'s attributes are code or load it, so Wutu sets them only as written: src = "…";', nameStart);
    if (dynamic && node.tag === 'base' && name === 'href') this.fail('a base\'s href moves every relative URL (scripts\' too), so Wutu sets it only as written: href = "/";', nameStart);
    if (dynamic && isProperty && name === 'protocol') this.fail('.protocol from a value could make a URL javascript:, past the URL check; set the whole URL: .href = url;', nameStart);
    if (dynamic && isProperty && RAW_TEXT_TAGS.has(node.tag) && (name === 'textContent' || name === 'innerText')) this.fail(rawTextError(node.tag), nameStart);
    if (dynamic && name === 'srcdoc') this.fail('srcdoc is HTML, so Wutu sets it only as written: srcdoc = "…"; (trusted HTML from a value: an `as` element\'s .srcdoc, in code)', nameStart);
    if (!isProperty && !isAllowedAttribute(node.tag, name)) this.fail(`unknown attribute ${name} on ${node.tag}`, nameStart);
    node.attrs.push({ name, value, property: isProperty, dynamic, range, start: nameStart });
  }

  /** Pseudo-classes, at-rules, `& selector` and `@ selector` scoped rules. */
  parseCssRule(node) {
    const start = this.p;
    const selector = this.readCssUntil('{;');
    if (this.text[this.p] === ';') {
      this.p++;
      node.css.push({ source: selector + ';', css: selector + ';', start });
      return;
    }
    const block = this.readCssBlock();
    node.css.push({ source: `${selector}{${block}}`, css: `${scopedSelector(selector)}{${block}}`, start });
  }

  /** A typo of a standard property fails, saying which. */
  cssPropertyKnown(name, at) {
    const near = nearCssProperty(name);
    if (near) this.fail(`invalid CSS property ${name}; did you mean ${near}?`, at);
  }

  /**
   * A value (`text[from, to)`) that runs onto the next line's declaration or
   * rule (`padding: 1rem` then `gap: 2rem;`): its `;` is missing, at its line's end.
   */
  cssValueRunsOn(from, to) {
    const text = this.text;
    let parens = 0;
    for (let i = from; i < to; i++) {
      const c = text[i];
      if (c === '"' || c === "'") {
        i++;
        while (i < to && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
      } else if (c === '(') parens++;
      else if (c === ')') parens--;
      else if (c === '\n' && parens === 0 && /^\s*(--|-?[a-z])[\w-]*\s*[:{]/.test(text.slice(i + 1, i + 200))) {
        let end = i;
        while (end > from && /\s/.test(text[end - 1])) end--;
        this.fail('CSS declarations require a semicolon', end);
      }
    }
  }

  parseDeclarationOrChild(node) {
    const start = this.p;
    const head = this.readCssUntil(':{};');
    if (this.text[this.p] !== ':') {
      this.p = start;
      node.children.push(this.parseElement());
      return;
    }
    this.p++;
    this.skipTrivia();
    if (this.at('$[')) this.failInterpolation();
    if (this.text[this.p] === '=') {
      // `width: = expression;` — a value computed at render time, applied
      // with style.setProperty (allowed under a strict style-src policy).
      this.p++;
      const expression = this.readBareExpression();
      this.expectSemicolon();
      if (!CSS_PROPERTY.test(head)) this.fail('invalid CSS property', start);
      this.cssPropertyKnown(head.trim(), start);
      node.styles.push({ property: head.trim(), value: expression.source, range: expression.range, start });
      return;
    }
    const valueFrom = this.p;
    const value = this.readCssUntil(';{}');
    this.cssValueRunsOn(valueFrom, this.p);
    if (this.text[this.p] !== ';') this.fail('CSS declarations require a semicolon');
    this.p++;
    if (!CSS_PROPERTY.test(head)) this.fail('invalid CSS property', start);
    this.cssPropertyKnown(head.trim(), start);
    const declaration = `${head}:${value};`;
    node.css.push({ source: this.text.slice(start, this.p), css: declaration, start });
  }
}

const PIPELINE_TERMINALS = new Set('fold each any all count_where first_index last_index sum fast_sum product count collect sort group_by distinct_by partition batched windows min_by max_by first_where reduce bisect'.split(' '));
const PIPELINE_STAGES = new Set('map filter skip take skip_while take_while scan zip chain flat_map repeat'.split(' '));

/**
 * A `for` iterable without parentheses that only hide its pipeline's
 * captures: `(xs filter |x| { … })` is `xs filter |x| { … }`, and the loop's
 * body continues that pipeline. Parentheses around a finished pipeline (one
 * ending in a terminal, like sort) or a range (`(0..<n)`) stay.
 */
function unparenthesized(expression) {
  const { source, range } = expression;
  if (source[0] !== '(' || source.at(-1) !== ')') return expression;
  let depth = 0, last = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') { i++; while (i < source.length && source[i] !== '"') { if (source[i] === '\\') i++; i++; } continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (--depth === 0 && i < source.length - 1) return expression; }
    else if (depth === 1 && /[a-z_]/.test(c) && !/[\w.]/.test(source[i - 1] ?? '')) {
      const word = /^[a-z_]\w*/.exec(source.slice(i))[0];
      if (PIPELINE_TERMINALS.has(word) || PIPELINE_STAGES.has(word)) last = word;
      i += word.length - 1;
    }
  }
  if (!last || PIPELINE_TERMINALS.has(last)) return expression;
  return { source: source.slice(1, -1).trim(), range: { start: range.start + 1, end: range.end - 1 } };
}

function scopedSelector(selector) {
  if (selector === '@') return '&, & *';
  if (selector.startsWith('@ ')) return selector.slice(2) || '&, & *';
  if (selector.startsWith(':')) return '&' + selector;
  return selector;
}
