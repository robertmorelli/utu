// Editor and CLI tooling for Wutu: formatting, island discovery, completions.
//
// The formatter is conservative. Utu outside DSL islands keeps its tokens, and
// formatting is driven by the Wutu parser rather than regex rewrites of
// executable expressions. Bodies with comments are left untouched.
import { dslLiterals, dslOpenerAt, skipDsl } from './dsl-envelope.js';
import { parseSyntax } from './syntax/parser.js';
import { parseWutu, wutuVocabulary } from './wutu-parse.js';

const INDENT = '    ';

/** Offset of the quote closing the string opened at `start`, past `\\` escapes; -1 if none. */
function stringEnd(source, start) {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') i++;
    else if (source[i] === source[start]) return i;
  }
  return -1;
}

export function formatWutuBody(source) {
  // Comments carry meaning for authors. Preserve commented bodies rather than discard them.
  const code = source.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  if (/^\s*#|\/\/|\/\*|^\s*\\\\/m.test(code)) return source;
  // (An opener in a string is text: strings are masked as they are.)
  if (/@\w+\s*\/\\/.test(code)) return formatWithOpaquePayloads(source);
  return new BodyFormatter().format(parseWutu(source));
}

/** Format around nested DSL literals, which are restored byte-for-byte. */
function formatWithOpaquePayloads(source) {
  const payloads = [];
  let masked = '';
  for (let i = 0; i < source.length;) {
    if (source[i] === '"') {
      const end = stringEnd(source, i);
      if (end < 0) return source;
      masked += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (dslOpenerAt(source, i)) {
      const end = skipDsl(source, i);
      masked += `__wutu_payload_${payloads.length}`;
      payloads.push(source.slice(i, end));
      i = end;
    } else {
      masked += source[i++];
    }
  }
  return formatWutuBody(masked).replace(/__wutu_payload_(\d+)/g, (_, index) => payloads[index]);
}

/** `expr` parenthesized when a top-level character of `chars` would end it early (`if`, `for`, `key`). */
function grouped(expr, chars) {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '"') { i = stringEnd(expr, i); if (i < 0) break; continue; }
    if (depth === 0 && chars.includes(c)) return `(${expr})`;
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
  }
  return expr;
}

/** An odd number of `|` in `line` outside strings: inside a capture list (`|a, b|`). */
function inCaptures(line) {
  return (line.replace(/"(?:[^"\\]|\\.)*"/g, '').match(/\|/g)?.length ?? 0) % 2 === 1;
}

/** Collapse whitespace outside string literals. */
function compactExpression(value) {
  let result = '', quoted = false, escaped = false;
  for (const c of value.trim()) {
    if (quoted && (escaped || c === '\\')) escaped = !escaped;
    else if (c === '"') quoted = !quoted;
    if (!quoted && /\s/.test(c)) {
      if (!result.endsWith(' ')) result += ' ';
    } else {
      result += c;
    }
  }
  return result;
}

class BodyFormatter {
  constructor() {
    this.lines = [];
  }

  add(depth, text) {
    this.lines.push(INDENT.repeat(depth) + text);
  }

  format(tree) {
    if (tree.scope) this.add(0, `@island ${tree.scope};`);
    else if (tree.reactive) this.add(0, '@reactive;');
    for (const use of tree.styleUses) this.add(0, `@style ${compactExpression(use.value)};`);
    for (const css of tree.global) this.block(`@document {${css}}`, 0);
    this.node(tree.root, 0);
    return '\n' + this.lines.join('\n') + '\n';
  }

  /**
   * Lay out raw CSS or Utu code one statement per line, indenting by brace
   * depth. In code mode, commas between block-level items also break lines.
   */
  block(text, depth, code = false) {
    let current = '', quote = '', parens = 0;
    const braces = [];
    const flush = () => {
      if (current.trim()) this.add(depth, current.trim());
      current = '';
    };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        current += c;
        if (c === '\\' && i + 1 < text.length) current += text[++i];
        else if (c === quote) quote = '';
        continue;
      }
      if (code && c === '`') {
        const end = templateEnd(text, i);
        if (end < 0) throw new Error('unterminated template');
        current += text.slice(i, end);
        i = end - 1;
        continue;
      }
      if (c === '"' || (!code && c === "'")) { quote = c; current += c; continue; }
      if (c === '(' || c === '[') parens++;
      if (c === ')' || c === ']') parens--;
      if (c === '{') {
        braces.push(parens);
        current = current.trimEnd() + ' {';
        flush();
        depth++;
      } else if (c === '}') {
        braces.pop();
        flush();
        depth--;
        current = '}';
        if (!/^\s*([;,)]|else\b)/.test(text.slice(i + 1))) flush();
      } else if (c === ';' && parens === 0) {
        current = current.trimEnd() + ';';
        flush();
      } else if (c === ',' && code && braces.at(-1) === parens && !inCaptures(current)) {
        current = current.trimEnd() + ',';
        flush();
      } else if (/\s/.test(c)) {
        if (current && !current.endsWith(' ')) current += ' ';
      } else {
        current += c;
      }
    }
    flush();
  }

  children(nodes, depth) {
    for (const node of nodes) this.node(node, depth);
  }

  node(node, depth) {
    switch (node.kind) {
      case 'text': return this.block(`${node.expr};`, depth, true);
      case 'expression': return this.block(`= ${node.expr};`, depth, true);
      case 'if': return this.conditional(node, depth, 'if');
      case 'for': return this.loop(node, depth);
      default: return this.element(node, depth);
    }
  }

  conditional(node, depth, keyword) {
    this.add(depth, `${keyword} ${grouped(compactExpression(node.condition), '{')} {`);
    this.children(node.children, depth + 1);
    const [first] = node.otherwise;
    if (node.otherwise.length === 1 && first.elseIf) return this.conditional(first, depth, '} else if');
    if (node.otherwise.length) {
      this.add(depth, '} else {');
      this.children(node.otherwise, depth + 1);
    }
    this.add(depth, '}');
  }

  loop(node, depth) {
    const key = node.key ? ` key ${node.globalKey ? 'global ' : ''}${grouped(compactExpression(node.key), '{')}` : '';
    this.add(depth, `for ${grouped(compactExpression(node.iterable), '{|')} |${node.captures}|${key} {`);
    this.children(node.children, depth + 1);
    this.add(depth, '}');
  }

  element(node, depth) {
    const classes = node.classes.map(name => '.' + name).join('');
    const ids = node.attrs.filter(attr => attr.shorthand).map(attr => '#' + JSON.parse(attr.value)).join('');
    this.add(depth, `${node.tag}${classes}${ids}${node.binding ? ' as ' + node.binding : ''} {`);
    // Each item where its author put it.
    const items = [];
    const at = (start, emit) => items.push({ start, emit });
    for (const { name, value, property, dynamic, shorthand, start } of node.attrs) {
      if (shorthand) continue;
      if (node.unmanaged && name === 'data-wutu-unmanaged') { at(start, () => this.add(depth + 1, '@unmanaged;')); continue; }
      // `for = …` would open a loop: an attribute named like a keyword keeps its `=` tight.
      const eq = !property && (name === 'if' || name === 'for') ? '=' : ' = ';
      if (!property && !dynamic && value === '""') at(start, () => this.add(depth + 1, `${name};`));
      else at(start, () => this.add(depth + 1, `${property ? '.' : ''}${name}${eq}${dynamic ? compactExpression(value) : value};`));
    }
    for (const rule of node.css) at(rule.start, () => this.block(rule.source, depth + 1));
    for (const style of node.styles ?? []) at(style.start, () => this.add(depth + 1, `${style.property}: = ${compactExpression(style.value)};`));
    for (const binding of node.twoWay) at(binding.start, () => this.add(depth + 1, `bind:${binding.property} = ${compactExpression(binding.value)};`));
    for (const child of node.children) at(child.start, () => this.node(child, depth + 1));
    for (const event of node.events) {
      const head = `on ${event.name}${event.quiet ? ' quiet' : ''}`;
      if (event.shorthand) at(event.start, () => this.block(`${head}${event.param ? ` |${event.param}|` : ''} ${event.handler}`, depth + 1, true));
      else at(event.start, () => this.block(`${head} = ${event.handler};`, depth + 1, true));
    }
    for (const { emit } of items.sort((a, b) => a.start - b.start)) emit();
    this.add(depth, '}');
  }
}

function isLineComment(source, i) {
  return source.startsWith('//', i) || source.startsWith('\\\\', i);
}

function lineEnd(source, i) {
  const end = source.indexOf('\n', i);
  return end < 0 ? source.length : end;
}

/** Inner ranges of every `@wutu` literal, ignoring comments and strings. */
export function wutuIslands(source) {
  return dslLiterals(source).filter(literal => literal.name === 'wutu').map(({ start, end }) => ({ start, end }));
}

/**
 * `source` with each `@wutu` island laid out. An island keeps its text when
 * its layout would change more than whitespace at `{`, `}`, `;` and `=`, or
 * would parse differently, or does not parse.
 */
export function formatWutuSource(source) {
  for (const { start, end } of wutuIslands(source).reverse()) {
    const body = source.slice(start, end);
    let formatted;
    try { formatted = formatWutuBody(body); } catch { continue; }
    if (formatted === body) continue;
    const indent = /[^\n]*$/.exec(source.slice(0, start))[0].match(/^\s*/)[0];
    const reindented = formatted.split('\n').map((line, i) => (i && line ? indent + line : line)).join('\n') + indent;
    if (!sameWutu(body, reindented)) continue;
    source = source.slice(0, start) + reindented + source.slice(end);
  }
  return source;
}

const WUTU_WORDS = new Set(['if', 'for', 'else', 'as', 'key', 'global', 'on', 'quiet']);

/**
 * Whether `b` is `a` with only whitespace changed, and only beside `{`, `}`,
 * `;` or `=` (never after a keyword: `for =` is a loop, `for=` an
 * attribute), never inside a string; and both parse to the same tree.
 */
function sameWutu(a, b) {
  let i = 0, j = 0, quoted = '', prev = '';
  for (;;) {
    const si = i, sj = j;
    if (!quoted) {
      while (i < a.length && /\s/.test(a[i])) i++;
      while (j < b.length && /\s/.test(b[j])) j++;
    }
    if (i === a.length || j === b.length) return i === a.length && j === b.length && !quoted && sameWutuTree(a, b);
    if (a[i] !== b[j]) return false;
    const spaced = i > si, respaced = j > sj;
    if (prev && spaced !== respaced) {
      if (!'{};='.includes(prev) && !'{};='.includes(a[i])) return false;
      const word = /[\w-]*$/.exec(a.slice(0, si))[0];
      if (WUTU_WORDS.has(word)) return false;
    }
    if (quoted === a[i]) quoted = '';
    else if (!quoted && '"\'`'.includes(a[i])) quoted = a[i];
    else if (quoted && a[i] === '\\') { if (a[i + 1] !== b[j + 1]) return false; i++; j++; }
    prev = a[i];
    i++; j++;
  }
}

/** Both texts parse as Wutu to the same tree, positions and whitespace aside. */
function sameWutuTree(a, b) {
  const shape = text => {
    try {
      return JSON.stringify(parseWutu(text), (key, value) =>
        key === 'start' || key === 'end' || /range$/i.test(key) ? undefined
          : typeof value === 'string' ? value.replace(/\s+/g, '') : value);
    } catch { return null; }
  };
  const shapeA = shape(a);
  return shapeA !== null && shapeA === shape(b);
}

const EVENT_COMPLETIONS = ['click', 'input', 'change', 'submit', 'keydown', 'focus', 'blur'];

const KEYWORD_COMPLETIONS = [
  { label: 'bind:value', insertText: 'bind:value = state.value;', detail: 'Two-way string binding' },
  { label: 'bind:checked', insertText: 'bind:checked = state.checked;', detail: 'Two-way boolean binding' },
  { label: 'bind:number', insertText: 'bind:number = state.number;', detail: 'Two-way numeric binding' },
  { label: 'bind:group', insertText: 'bind:group = state.choice;', detail: 'Radio group: the checked radio\'s value' },
  { label: 'bind:values', insertText: 'bind:values = state.selected;', detail: 'Multiple select: Array[Str] of chosen values' },
  { label: 'bind:files', insertText: 'bind:files = state.files;', detail: 'File input: its FileList (read-only)' },
  { label: 'on', insertText: 'on click {\n    \n}', detail: 'Event handler' },
  { label: '@island', insertText: '@island "view-name";', detail: 'Independent update boundary' },
  { label: '@style', insertText: '@style theme.sheet();', detail: 'Shared CSS stylesheet' },
  { label: '@reactive', insertText: '@reactive;', detail: 'Reactive root view' },
];

export function wutuCompletions(source, offset) {
  const island = wutuIslands(source).find(range => offset >= range.start && offset <= range.end);
  if (!island) return [];
  const prefix = source.slice(island.start, offset);
  if (/\bon\s+\w*$/.test(prefix)) {
    return EVENT_COMPLETIONS.map(label => ({ label, insertText: label + ' {\n    \n}', detail: 'Wutu event handler' }));
  }
  const tags = [...wutuVocabulary.tags].map(label => ({ label, insertText: label + ' {\n    \n}', detail: 'Wutu element' }));
  const names = new Set([...wutuVocabulary.globals, ...Object.values(wutuVocabulary.attrs).flatMap(set => [...set])]);
  const attributes = [...names].filter(label => !wutuVocabulary.tags.has(label))
    .map(label => ({ label, insertText: label + ' = "";', detail: 'Wutu attribute' }));
  return tags.concat(attributes, KEYWORD_COMPLETIONS);
}

/**
 * General Utu layout: one statement per line, indented by brace depth, `|`
 * fields and variants one deeper than their declaration. Strings, templates,
 * comments and DSL literals keep their text (`@wutu` islands are laid out
 * by formatWutuSource). The result is used only when it parses to the same
 * tree as `source` and formats to itself; otherwise `source` comes back
 * unchanged, so formatting never changes what a program means.
 */
export function formatUtuSource(source) {
  return formatUtu(source).text;
}

/** { text, refused }: the formatted text, or `source` and why it was left as is. */
export function formatUtu(source) {
  const before = syntaxShape(source);
  if (!before) return { text: source, refused: 'it does not parse' };
  const once = formatWutuSource(layoutUtu(source));
  if (once === source) return { text: source, refused: null };
  if (syntaxShape(once) !== before) return { text: source, refused: 'its layout would parse differently' };
  if (formatWutuSource(layoutUtu(once)) !== once) return { text: source, refused: 'its layout is not stable' };
  return { text: once, refused: null };
}

/**
 * The syntax tree of `source` as text: node types and token texts, comments
 * without trailing blanks, `@wutu` bodies left out (formatWutuSource checks
 * those); null when it does not parse.
 */
function syntaxShape(source) {
  let tree;
  try { tree = parseSyntax(source); } catch { return null; }
  if (!tree) return null;
  const out = [];
  const walk = node => {
    if (!node.childCount) {
      out.push(node.type + ' ' + (node.type === 'comment' ? node.text.trimEnd() : node.text));
      return;
    }
    out.push('(' + node.type);
    if (node.type === 'dsl_expr' && node.namedChildren[0]?.text === 'wutu') return void out.push('wutu )');
    for (const child of node.children) walk(child);
    out.push(')');
  };
  walk(tree.rootNode);
  return out.join('\n');
}

/** Offset just past the template literal whose backtick is at `start`; -1 if unterminated. */
function templateEnd(source, start) {
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') i++;
    else if (c === '`') return i + 1;
    else if (c === '$' && source[i + 1] === '{') {
      i = codeEnd(source, i + 2);
      if (i < 0) return -1;
    }
  }
  return -1;
}

/** Offset of the `}` closing code that starts at `start` (inside `${…}`); -1 if none. */
function codeEnd(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === '"') { i = stringEnd(source, i); if (i < 0) return -1; }
    else if (c === '`') { i = templateEnd(source, i) - 1; if (i < 0) return -1; }
    else if (c === '{') depth++;
    else if (c === '}' && depth-- === 0) return i;
  }
  return -1;
}

function layoutUtu(source) {
  let result = '', line = '', depth = 0, parens = 0, startParens = 0, raw = false;
  // Whether the line before was a declaration head (`struct P:`) or one of its `|` lines.
  let bars = false;
  const braces = [];
  const flush = () => {
    const text = raw ? line.trimStart().replace(/\r$/, '') : line.trim();
    if (text.trim()) {
      const field = text.startsWith('|') && bars;
      // A line that continues a `(` or `[` opened in this block, one deeper.
      const continued = startParens > (braces.at(-1) ?? 0) && !/^[)\]}]/.test(text);
      result += INDENT.repeat(Math.max(0, depth) + (field || continued ? 1 : 0)) + text + '\n';
      if (!raw) bars = field || (parens === 0 && text.endsWith(':') && !text.startsWith('//'));
    }
    line = '';
    raw = false;
    startParens = parens;
  };
  // A blank line the author left between statements stays (one at most),
  // except just inside a block's braces.
  const blankLine = () => {
    if (result && !result.endsWith('\n\n') && !result.endsWith('{\n')) result += '\n';
  };
  /** Whether `re` (sticky) matches at `i`. */
  const ahead = (re, i) => { re.lastIndex = i; return re.test(source); };
  // A comment after the code on its line stays on that line.
  const TRAILER = /[ \t]*(\/\/[^\n]*)/y;
  const trailer = i => {
    TRAILER.lastIndex = i;
    const match = TRAILER.exec(source);
    if (!match) return i;
    line += ' ' + match[1].trimEnd();
    return i + match[0].length;
  };
  for (let i = 0; i < source.length;) {
    if (isLineComment(source, i)) {
      const end = lineEnd(source, i);
      line += source.slice(i, end);
      // A `\\` line is a string's: its trailing blanks are text.
      raw = source.startsWith('\\\\', i);
      flush();
      i = end;
      continue;
    }
    if (source[i] === '"' || source[i] === '`') {
      const end = source[i] === '"' ? stringEnd(source, i) + 1 : templateEnd(source, i);
      if (end <= 0) return source;
      line += source.slice(i, end);
      i = end;
      continue;
    }
    if (dslOpenerAt(source, i)) {
      let end;
      try { end = skipDsl(source, i); } catch { return source; }
      line += source.slice(i, end);
      i = end;
      continue;
    }
    const c = source[i++];
    if (c === '(' || c === '[') parens++;
    if (c === ')' || c === ']') parens--;
    if (c === '{' && ahead(/\s*\}/y, i)) {
      // An empty block stays `{}`.
      line = line.trimEnd() + ' {}';
      i = source.indexOf('}', i) + 1;
    } else if (c === '{') {
      line = line.trimEnd() + ' {';
      i = trailer(i);
      flush();
      braces.push(parens);
      depth++;
    } else if (c === '}') {
      flush();
      result = result.replace(/\n\n$/, '\n');
      depth--;
      braces.pop();
      line = '}';
      if (!ahead(/\s*([;,)\]]|else\b)/y, i)) { i = trailer(i); flush(); }
    } else if (c === ';' && parens === 0) {
      line = line.trimEnd() + ';';
      i = trailer(i);
      flush();
    } else if (c === ',' && braces.at(-1) === parens && !inCaptures(line)) {
      line = line.trimEnd() + ',';
      i = trailer(i);
      flush();
    } else if (c === '\n' && line.trim() === '}' && ahead(/\s*else\b/y, i)) {
      line += ' ';
    } else if (c === '\n') {
      const blank = ahead(/[ \t\r]*\n/y, i);
      flush();
      if (blank) blankLine();
    } else if (/\s/.test(c)) {
      if (line && !line.endsWith(' ')) line += ' ';
    } else {
      line += c;
    }
  }
  flush();
  return result;
}
