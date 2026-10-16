// Editor and CLI tooling for Wutu: formatting, island discovery, completions.
//
// The formatter is conservative. Utu outside DSL islands keeps its tokens, and
// formatting is driven by the Wutu parser rather than regex rewrites of
// executable expressions. Bodies with comments are left untouched.
import { dslLiterals, dslOpenerAt, skipDsl } from './dsl-envelope.js';
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
        if (!code && c === '\\' && i + 1 < text.length) current += text[++i];
        else if (c === quote) quote = '';
        continue;
      }
      if (c === '"' || c === "'") { quote = c; current += c; continue; }
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
        if (!/^[\s]*[;,)]/.test(text.slice(i + 1))) flush();
      } else if (c === ';' && parens === 0) {
        current = current.trimEnd() + ';';
        flush();
      } else if (c === ',' && code && braces.at(-1) === parens) {
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
    this.add(depth, `${node.tag}${classes}${node.binding ? ' as ' + node.binding : ''} {`);
    if (node.unmanaged) this.add(depth + 1, '@unmanaged;');
    for (const { name, value, property, dynamic } of node.attrs) {
      if (node.unmanaged && name === 'data-wutu-unmanaged') continue;
      if (!property && !dynamic && value === '""') this.add(depth + 1, `${name};`);
      else this.add(depth + 1, `${property ? '.' : ''}${name} = ${dynamic ? compactExpression(value) : value};`);
    }
    for (const rule of node.css) this.block(rule.source, depth + 1);
    for (const style of node.styles ?? []) this.add(depth + 1, `${style.property}: = ${compactExpression(style.value)};`);
    for (const binding of node.twoWay) this.add(depth + 1, `bind:${binding.property} = ${compactExpression(binding.value)};`);
    this.children(node.children, depth + 1);
    for (const event of node.events) {
      const head = `on ${event.name}${event.quiet ? ' quiet' : ''}`;
      if (event.shorthand) this.block(`${head}${event.param ? ` |${event.param}|` : ''} ${event.handler}`, depth + 1, true);
      else this.block(`${head} = ${event.handler};`, depth + 1, true);
    }
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

export function formatWutuSource(source) {
  for (const { start, end } of wutuIslands(source).reverse()) {
    const body = source.slice(start, end);
    const formatted = formatWutuBody(body);
    if (formatted === body) continue;
    const indent = /[^\n]*$/.exec(source.slice(0, start))[0].match(/^\s*/)[0];
    const reindented = formatted.split('\n').map((line, i) => (i && line ? indent + line : line)).join('\n');
    source = source.slice(0, start) + reindented + indent + source.slice(end);
  }
  return source;
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
 * General Utu layout. Literal payloads (including foreign DSLs and multiline
 * strings) are opaque tokens, so formatting never rewrites their contents.
 * Unbalanced input is returned unchanged.
 */
export function formatUtuSource(source) {
  source = formatWutuSource(source);
  let result = '', line = '', depth = 0, parens = 0;
  const braces = [];
  const flush = () => {
    if (line.trim()) result += INDENT.repeat(Math.max(0, depth)) + line.trim() + '\n';
    line = '';
  };
  // A blank line the author left between statements stays (one at most),
  // except just inside a block's braces.
  const blankLine = () => {
    if (result && !result.endsWith('\n\n') && !result.endsWith('{\n')) result += '\n';
  };
  for (let i = 0; i < source.length;) {
    if (isLineComment(source, i)) {
      const end = lineEnd(source, i);
      line += source.slice(i, end);
      flush();
      i = end;
      continue;
    }
    if (source[i] === '"') {
      const end = stringEnd(source, i);
      if (end < 0) return source;
      line += source.slice(i, end + 1);
      i = end + 1;
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
    if (c === '{') {
      line = line.trimEnd() + ' {';
      flush();
      braces.push(parens);
      depth++;
    } else if (c === '}') {
      flush();
      result = result.replace(/\n\n$/, '\n');
      depth--;
      braces.pop();
      line = '}';
      if (!/^\s*([;,)]|else\b)/.test(source.slice(i))) flush();
    } else if (c === ';' && parens === 0) {
      line = line.trimEnd() + ';';
      flush();
    } else if (c === ',' && braces.at(-1) === parens) {
      line = line.trimEnd() + ',';
      flush();
    } else if (c === '\n' && line.trim() === '}' && /^\s*else\b/.test(source.slice(i))) {
      line += ' ';
    } else if (c === '\n') {
      const blank = !line.trim() && /^[ \t\r]*\n/.test(source.slice(i));
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
