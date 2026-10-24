// parser.js — utu's own parser: source text → concrete syntax tree.
//
// It builds the same tree tree-sitter-utu builds for a valid program (node
// types, anonymous tokens, field names, ranges, and where comments attach),
// as plain objects with the part of tree-sitter's SyntaxNode interface the IR
// walkers read. So parse.js turns either tree into identical IR, without a
// call into wasm for every node.
//
// It only accepts programs tree-sitter parses without errors, and gives up
// (returns null) on anything else; callers then use tree-sitter, whose error
// recovery produces the parse diagnostics. scripts/syntax-differential.mjs
// checks the two trees agree on every .utu source in the repository.
//
// How tree-sitter's grammar is reproduced:
// - Lexing depends on what may come next, as tree-sitter's lex states do:
//   `-o` and `?.` only follow an expression, a keyword is a keyword only
//   where the grammar allows it (else it is an identifier), and lowercase
//   words are identifiers where both an identifier and a type name fit.
// - Operator precedence follows tree-sitter's LR conflict resolution: an
//   operator extends the expression before it when its precedence is higher,
//   or equal and that expression's rule is right-associative.
// - A comment belongs to the smallest node whose first and last tokens
//   surround it (tree-sitter reduces trailing extras into the parent).

// ── Syntax nodes ─────────────────────────────────────────────────────────────

import { dslEnd } from '../dsl-envelope.js';

let nextId = 1;

export class SyntaxNode {
  constructor(tree, type, isNamed, startIndex, endIndex, children) {
    this.tree = tree;
    this.type = type;
    this.isNamed = isNamed;
    this.startIndex = startIndex;
    this.endIndex = endIndex;
    this.children = children;
    this.fieldNames = null;
    this.id = nextId++;
    this.named = null;
  }

  get text() { return this.tree.source.slice(this.startIndex, this.endIndex); }
  get namedChildren() { return this.named ??= this.children.filter(child => child.isNamed); }
  get childCount() { return this.children.length; }
  get namedChildCount() { return this.namedChildren.length; }
  child(index) { return this.children[index] ?? null; }
  namedChild(index) { return this.namedChildren[index] ?? null; }
  get firstChild() { return this.children[0] ?? null; }
  get lastChild() { return this.children[this.children.length - 1] ?? null; }
  get startPosition() { return this.tree.position(this.startIndex); }
  get endPosition() { return this.tree.position(this.endIndex); }
  get isMissing() { return false; }
  get hasError() { return false; }
  fieldNameForChild(index) { return this.fieldNames?.[index] ?? null; }

  childForFieldName(name) {
    if (!this.fieldNames) return null;
    const index = this.fieldNames.indexOf(name);
    return index < 0 ? null : this.children[index];
  }

  childrenForFieldName(name) {
    if (!this.fieldNames) return [];
    return this.children.filter((_, index) => this.fieldNames[index] === name);
  }
}

class SyntaxTree {
  constructor(source) {
    this.source = source;
    this.lineStarts = null;
    this.rootNode = null;
  }

  /** Row and column (in UTF-16 code units, as web-tree-sitter reports) of an offset. */
  position(offset) {
    const starts = this.lineStarts ??= lineStarts(this.source);
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return { row: low, column: offset - starts[low] };
  }

  delete() {}
}

function lineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

// Thrown to give up on a parse (or an alternative while backtracking). One
// preallocated instance, not an Error: a stack trace per attempt is costly.
class Unsupported {}
const UNSUPPORTED = new Unsupported();

// ── Lexical classes ──────────────────────────────────────────────────────────

const IDENTIFIER = /^(?:[a-z][a-zA-Z0-9_]*|_[a-zA-Z0-9_]+)$/;
const WORD = /[A-Za-z_][A-Za-z0-9_]*/y;
const FLOAT = /[0-9]+\.[0-9]+(?:[eE][+-]?[0-9]+)?/y;
const INT = /0x[0-9a-fA-F]+|0b[01]+|[0-9]+/y;
const STRING = /"(?:[^"\\\n]|\\[^\n])*"/y;
// A template string's text, up to a backtick or `${` (the grammar's TEMPLATE_TEXT).
const TEMPLATE_TEXT = /(?:[^`$\\]|\\[^\n]|\$+(?:[^`{$\\]|\\[^\n]))*\$*/y;
const PLATFORM_PATH = /[a-z][a-zA-Z0-9_]*:[A-Za-z][a-zA-Z0-9_]*/y;
const SPACE = /\s/;

/** JavaScript's `\s` (what the grammar's extras match), with ASCII answered directly. */
function isSpace(code, char) {
  if (code < 128) return code === 32 || (code >= 9 && code <= 13);
  return SPACE.test(char);
}

// Punctuation, longest first. `-o` and `?.` are only lexed after an expression.
const PUNCTUATION = [
  '>>>=', '...', '..<', '<<=', '>>=', '>>>', '-o', '?.', '=>', '~>', '==', '!=', '<=', '>=', '<<', '>>',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
  '(', ')', '{', '}', '[', ']', ',', ';', ':', '.', '|', '&', '^', '*', '/', '%', '+', '-', '<', '>', '=', '?', '~', '@',
];
const AFTER_EXPRESSION_ONLY = new Set(['-o', '?.']);

const BINARY = new Map([
  ['^', [12, 'right']],
  ['*', [11, 'left']], ['/', [11, 'left']], ['%', [11, 'left']],
  ['+', [10, 'left']], ['-', [10, 'left']],
  ['<<', [9, 'left']], ['>>', [9, 'left']], ['>>>', [9, 'left']],
  ['&', [8, 'left']],
  ['|', [6, 'left']],
  ['==', [5, 'left']], ['!=', [5, 'left']], ['<', [5, 'left']], ['>', [5, 'left']], ['<=', [5, 'left']], ['>=', [5, 'left']],
  ['and', [4, 'left']],
  ['xor', [3, 'left']],
  ['or', [2, 'left']],
]);

const ASSIGNMENT = new Set(['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', 'and=', 'or=', 'xor=']);

const ITERATOR_FORMS = new Map([
  ...['map', 'filter', 'flat_map', 'skip_while', 'take_while', 'each', 'any', 'all', 'count_where', 'first_index', 'last_index'].map(op => [op, 'capture']),
  ...['fold', 'scan'].map(op => [op, 'param-capture']),
  ...['skip', 'take', 'chain', 'repeat'].map(op => [op, 'param']),
  ['zip', 'param-capture'],
  ...['sort', 'min_by', 'max_by', 'first_where', 'reduce', 'partition'].map(op => [op, 'element-capture']),
  ['collect', 'element'],
  ...['group_by', 'distinct_by'].map(op => [op, 'element-key-capture']),
  ...['batched', 'windows'].map(op => [op, 'element-param']),
  ['bisect', 'capture'],
  ...['sum', 'fast_sum', 'product', 'count'].map(op => [op, 'none']),
]);

// Every keyword in the grammar. Where tree-sitter's lexer may produce any of
// them (it shares lex states between parse states), a name cannot be one:
// module type parameters and the type names of match and alt patterns.
const KEYWORDS = new Set(['mod', 'using', 'tag', 'rec', 'struct', 'proto', 'enum', 'fn', 'let', 'mem', 'vec', 'export', 'const',
  'type', 'distinct', 'lib', 'main', 'test', 'bench', 'measure', 'in', 'out', 'get', 'set', 'yield', 'void', 'fun', 'cl',
  'from', ...ITERATOR_FORMS.keys(), 'await', 'new', 'assert', 'not', 'and', 'or', 'xor', 'orelse', 'if', 'else', 'promote',
  'try', 'catch', 'match', 'loop', 'alt', 'for', 'while', 'break', 'continue', 'defer', 'errdefer', 'return', 'fatal', 'prune',
  'true', 'false', 'null']);

// Keywords that begin an expression; elsewhere these words are identifiers.
const EXPRESSION_KEYWORDS = new Set([
  'if', 'match', 'loop', 'alt', 'promote', 'try', 'for', 'while', 'break', 'continue', 'defer', 'errdefer', 'yield', 'return',
  'let', 'cl', 'fatal', 'prune', 'new', 'await', 'assert', 'not', 'true', 'false', 'null',
]);

// ── Parser ───────────────────────────────────────────────────────────────────

/** Where parsing `source` gave up (the furthest offset reached), or -1 if it parses. For debugging. */
export function syntaxFailureOffset(source) {
  const parser = new Parser(new SyntaxTree(source));
  try {
    parser.tree.rootNode = parser.sourceFile();
    return -1;
  } catch (error) {
    if (error instanceof Unsupported) return parser.furthest;
    throw error;
  }
}

/** Parse `source`, or return null when it is not a program this parser accepts. */
export function parseSyntax(source) {
  const tree = new SyntaxTree(source);
  try {
    const parser = new Parser(tree);
    tree.rootNode = parser.sourceFile();
    return tree;
  } catch (error) {
    if (error instanceof Unsupported) return null;
    throw error;
  }
}

class Parser {
  constructor(tree) {
    this.tree = tree;
    this.source = tree.source;
    this.pos = 0;
    this.comments = [];
    this.commentStarts = new Set();
    this.furthest = 0;
    this.skip();
  }

  // ── Tokens ──

  fail() {
    if (this.pos > this.furthest) this.furthest = this.pos;
    throw UNSUPPORTED;
  }

  /** Skip whitespace and comments, remembering each comment once. */
  skip() {
    const source = this.source;
    for (;;) {
      while (this.pos < source.length && isSpace(source.charCodeAt(this.pos), source[this.pos])) this.pos++;
      if (source.startsWith('//', this.pos)) {
        let end = source.indexOf('\n', this.pos);
        if (end < 0) end = source.length;
        if (!this.commentStarts.has(this.pos)) {
          this.commentStarts.add(this.pos);
          this.comments.push([this.pos, end]);
        }
        this.pos = end;
        continue;
      }
      return;
    }
  }

  leaf(type, start, end, named) {
    return new SyntaxNode(this.tree, type, named, start, end, []);
  }

  /** The word (identifier-shaped token) at the cursor, or null. */
  word() {
    WORD.lastIndex = this.pos;
    const match = WORD.exec(this.source);
    return match ? match[0] : null;
  }

  isWord(text) {
    return this.word() === text;
  }

  /** The punctuation at the cursor (longest match), or null. */
  punct(afterExpression = false) {
    for (const p of PUNCTUATION) {
      if (!afterExpression && AFTER_EXPRESSION_ONLY.has(p)) continue;
      if (this.source.startsWith(p, this.pos)) {
        // `//` is a comment, never two slashes; skip() has already removed it.
        return p;
      }
    }
    return null;
  }

  /**
   * Whether the expected token `text` is next. Only tokens valid at this point
   * are lexed, as in tree-sitter, so `|` matches the start of `|=>` here; the
   * infix loop, where longer operators are valid too, uses punct() instead.
   */
  isPunct(text) {
    return this.source.startsWith(text, this.pos);
  }

  /** Consume an anonymous token (keyword or punctuation). */
  token(text) {
    const start = this.pos;
    this.pos += text.length;
    const node = this.leaf(text, start, this.pos, false);
    this.skip();
    return node;
  }

  expectPunct(text) {
    if (!this.isPunct(text)) this.fail();
    return this.token(text);
  }

  expectKeyword(text) {
    if (!this.isWord(text)) this.fail();
    return this.token(text);
  }

  /** A named leaf for the word at the cursor: `identifier` or `type_ident`. */
  wordNode(type) {
    const text = this.word();
    if (text === null) this.fail();
    const start = this.pos;
    this.pos += text.length;
    const node = this.leaf(type, start, this.pos, true);
    this.skip();
    return node;
  }

  identifier() {
    const text = this.word();
    if (text === null || !IDENTIFIER.test(text)) this.fail();
    return this.wordNode('identifier');
  }

  typeIdent() {
    if (this.word() === null) this.fail();
    return this.wordNode('type_ident');
  }

  /** A type name where no keyword can stand (see KEYWORDS). */
  unreservedTypeIdent() {
    if (KEYWORDS.has(this.word())) this.fail();
    return this.typeIdent();
  }

  /** `identifier` where the word is identifier-shaped, else `type_ident` (both fit here). */
  identifierOrType() {
    const text = this.word();
    if (text === null) this.fail();
    return this.wordNode(IDENTIFIER.test(text) ? 'identifier' : 'type_ident');
  }

  isIdentifierShaped() {
    const text = this.word();
    return text !== null && IDENTIFIER.test(text);
  }

  stringLit() {
    STRING.lastIndex = this.pos;
    const match = STRING.exec(this.source);
    if (!match) this.fail();
    const start = this.pos;
    this.pos += match[0].length;
    const node = this.leaf('string_lit', start, this.pos, true);
    this.skip();
    return node;
  }

  atEnd() {
    return this.pos >= this.source.length;
  }

  // ── Nodes ──

  node(type, children, fieldNames = null) {
    const parts = children.filter(Boolean);
    if (!parts.length) this.fail();
    const node = new SyntaxNode(this.tree, type, true, parts[0].startIndex, parts[parts.length - 1].endIndex, parts);
    if (fieldNames) node.fieldNames = fieldNames.filter((_, i) => children[i]);
    return node;
  }

  /** A node from [child, field] pairs. */
  fielded(type, pairs) {
    const present = pairs.filter(([child]) => child);
    const node = this.node(type, present.map(([child]) => child));
    if (present.some(([, field]) => field)) node.fieldNames = present.map(([, field]) => field ?? null);
    return node;
  }

  // ── Source file ──

  sourceFile() {
    const children = [];
    while (!this.atEnd()) children.push(...this.item());
    const root = new SyntaxNode(this.tree, 'source_file', true, 0, this.source.length, children);
    attachComments(this, root);
    // tree-sitter's root starts at its first token or comment and ends with the text.
    root.startIndex = root.children[0]?.startIndex ?? 0;
    root.endIndex = this.source.length;
    return root;
  }

  item() {
    const word = this.word();
    switch (word) {
      case 'mod': return [this.moduleDecl()];
      case 'using': return [this.usingDecl(), this.expectPunct(';')];
      case 'tag': case 'rec': case 'struct': case 'enum': return [this.structOrEnum()];
      case 'proto': return [this.protoDecl()];
      case 'fn': return [this.fnOrOpDecl()];
      case 'let': return [this.globalDecl(), this.expectPunct(';')];
      case 'mem': case 'vec': case 'const': return [this.memDecl(), this.expectPunct(';')];
      case 'type': return [this.distinctDecl(), this.expectPunct(';')];
      case 'export': {
        const after = this.peekWordAfter('export');
        if (after === 'lib') return [this.exportLibDecl()];
        if (after === 'main') return [this.exportMainDecl()];
        if (after === 'const' || after === 'mem') return [this.memDecl(), this.expectPunct(';')];
        return this.fail();
      }
      case 'test': return [this.testDecl()];
      case 'bench': return [this.benchDecl()];
      default: return this.fail();
    }
  }

  moduleItem() {
    switch (this.word()) {
      case 'type': return [this.typeDecl()];
      case 'tag': case 'rec': case 'struct': case 'enum': return [this.structOrEnum()];
      case 'proto': return [this.protoDecl()];
      case 'fn': return [this.fnOrOpDecl()];
      case 'let': return [this.globalDecl(), this.expectPunct(';')];
      case 'test': return [this.testDecl()];
      case 'bench': return [this.benchDecl()];
      default: return this.fail();
    }
  }

  /** The word after keyword `first` at the cursor, without consuming anything. */
  peekWordAfter(first) {
    const save = this.save();
    this.token(first);
    const word = this.word();
    this.restore(save);
    return word;
  }

  save() {
    return [this.pos, this.comments.length];
  }

  restore([pos, comments]) {
    this.pos = pos;
    for (const [start] of this.comments.splice(comments)) this.commentStarts.delete(start);
  }

  moduleDecl() {
    const children = [this.expectKeyword('mod'), this.moduleName()];
    if (this.isPunct('[')) children.push(this.moduleTypeParamList());
    children.push(this.expectPunct('{'));
    while (!this.isPunct('}')) children.push(...this.moduleItem());
    children.push(this.expectPunct('}'));
    return this.node('module_decl', children);
  }

  moduleName() {
    return this.node('module_name', [this.identifierOrType()]);
  }

  moduleTypeParamList() {
    const children = [this.expectPunct('[')];
    children.push(this.moduleTypeParam());
    while (this.isPunct(',')) {
      children.push(this.token(','));
      if (this.isPunct(']')) break;
      children.push(this.moduleTypeParam());
    }
    children.push(this.expectPunct(']'));
    return this.node('module_type_param_list', children);
  }

  moduleTypeParam() {
    const children = [];
    // `in` and `out` are always variance keywords here, never parameter names.
    const word = this.word();
    if (word === 'in' || word === 'out') children.push(this.token(word));
    children.push(this.unreservedTypeIdent());
    // `T[Ord]`: the protocols T must implement.
    if (this.isPunct('[')) children.push(this.implList());
    return this.node('module_type_param', children);
  }

  moduleTypeArgList() {
    const children = [this.expectPunct('[')];
    children.push(this.type());
    while (this.isPunct(',')) {
      children.push(this.token(','));
      if (this.isPunct(']')) break;
      children.push(this.type());
    }
    children.push(this.expectPunct(']'));
    return this.node('module_type_arg_list', children);
  }

  implList() {
    const children = [this.expectPunct('[')];
    if (!this.isPunct(']')) {
      children.push(this.implName());
      while (this.isPunct(',')) {
        children.push(this.token(','));
        if (this.isPunct(']')) break;
        children.push(this.implName());
      }
    }
    children.push(this.expectPunct(']'));
    return this.node('impl_list', children);
  }

  /** A protocol in an impl or bound list: `P`, `&`, or `m.P` from module m. */
  implName() {
    if (this.word() === null) return this.typeIdentOrPromoted();
    const save = this.save();
    const name = this.moduleName();
    if (!this.isPunct('.')) {
      this.restore(save);
      return this.typeIdent();
    }
    return this.node('qualified_type_ref', [this.node('module_ref', [name]), this.token('.'), this.typeIdent()]);
  }

  typeIdentOrPromoted() {
    return this.isPunct('&') ? this.promotedType() : this.typeIdent();
  }

  promotedType() {
    return this.node('promoted_type', [this.expectPunct('&')]);
  }

  structOrEnum() {
    const children = [];
    if (this.isWord('tag') || this.isWord('rec')) {
      const tags = [];
      while (this.isWord('tag') || this.isWord('rec')) tags.push(this.node('nom_tag', [this.token(this.word())]));
      children.push(this.node('nom_qualifier', tags));
    }
    if (this.isWord('struct')) return this.structDecl(children);
    if (this.isWord('enum')) return this.enumDecl(children);
    return this.fail();
  }

  structDecl(children) {
    children.push(this.token('struct'), this.typeIdentOrPromoted());
    if (this.isPunct('[')) children.push(this.implList());
    children.push(this.expectPunct(':'));
    while (this.isPunct('|')) children.push(this.token('|'), this.field());
    return this.node('struct_decl', children);
  }

  field() {
    return this.node('field', [this.identifier(), this.expectPunct(':'), this.type()]);
  }

  enumDecl(children) {
    const fields = children.map(() => null);
    const push = (child, field = null) => { children.push(child); fields.push(field); };
    push(this.token('enum'));
    if (this.isPunct('(')) {
      push(this.token('('));
      push(this.typeIdent(), 'repr');
      push(this.expectPunct(')'));
    }
    push(this.typeIdentOrPromoted());
    if (this.isPunct('[')) push(this.implList());
    push(this.expectPunct(':'));
    while (this.isPunct('|')) {
      push(this.token('|'));
      push(this.variant());
    }
    const node = this.node('enum_decl', children);
    if (fields.some(Boolean)) node.fieldNames = fields;
    return node;
  }

  variant() {
    const pairs = [[this.typeIdent()]];
    if (this.isPunct('{')) {
      pairs.push([this.token('{')]);
      if (!this.isPunct('}')) pairs.push([this.fieldList()]);
      pairs.push([this.expectPunct('}')]);
    } else if (this.isPunct('=')) {
      pairs.push([this.token('=')]);
      if (this.isPunct('-')) pairs.push([this.token('-'), 'value']);
      pairs.push([this.intLit(), 'value']);
    }
    return this.fielded('variant', pairs);
  }

  fieldList() {
    const children = [this.field()];
    while (this.isPunct(',')) {
      children.push(this.token(','));
      if (this.isPunct('}')) break;
      children.push(this.field());
    }
    return this.node('field_list', children);
  }

  protoDecl() {
    const children = [this.token('proto'), this.typeIdentOrPromoted(), this.expectPunct(':')];
    while (this.isPunct('|')) children.push(this.token('|'), this.protoMember());
    return this.node('proto_decl', children);
  }

  protoMember() {
    let member;
    if (this.isWord('get')) {
      const get = this.token('get');
      if (this.isWord('set')) {
        const set = this.token('set');
        member = this.node('proto_get_setter', [get, set, this.identifier(), this.expectPunct(':'), this.type()]);
      } else {
        member = this.node('proto_getter', [get, this.identifier(), this.expectPunct(':'), this.type()]);
      }
    } else if (this.isWord('set')) {
      member = this.node('proto_setter', [this.token('set'), this.identifier(), this.expectPunct(':'), this.type()]);
    } else {
      const children = [this.identifier(), this.expectPunct('(')];
      if (!this.isPunct(')')) children.push(this.typeList());
      children.push(this.expectPunct(')'), this.returnType());
      member = this.node('proto_method', children);
    }
    return this.node('proto_member', [member]);
  }

  fnOrOpDecl() {
    const fn = this.token('fn');
    // `fn T:op |a, b| R { … }` is an operator; `fn T.name(…)` and `fn name(…)` are functions.
    if (!this.isIdentifierShaped() || this.isPunct('&')) {
      const save = this.save();
      const owner = this.typeIdentOrPromoted();
      if (this.isPunct(':')) {
        const children = [fn, owner, this.token(':'), this.identifier(), this.capture(), this.returnType(), this.block()];
        return this.node('op_decl', children);
      }
      this.restore(save);
    }
    const children = [fn, this.fnName()];
    if (this.isPunct('|')) children.push(this.selfParam());
    children.push(this.expectPunct('('));
    if (!this.isPunct(')')) children.push(this.paramList());
    children.push(this.expectPunct(')'), this.returnType(), this.block());
    return this.node('fn_decl', children);
  }

  fnName() {
    if (this.isIdentifierShaped()) return this.node('fn_name', [this.identifier()]);
    const children = [this.typeIdentOrPromoted()];
    if (this.isPunct('[')) children.push(this.moduleTypeArgList());
    children.push(this.expectPunct('.'), this.identifier());
    return this.node('fn_name', children);
  }

  selfParam() {
    return this.node('self_param', [this.token('|'), this.identifier(), this.expectPunct('|')]);
  }

  paramList(close = ')') {
    const children = [this.param()];
    while (this.isPunct(',')) {
      children.push(this.token(','));
      if (this.isPunct(close)) break;
      children.push(this.param());
    }
    return this.node('param_list', children);
  }

  param() {
    return this.node('param', [this.identifier(), this.expectPunct(':'), this.type()]);
  }

  returnType() {
    if (this.isWord('void')) {
      const start = this.pos;
      this.pos += 4;
      const leaf = this.leaf('void_type', start, this.pos, true);
      this.skip();
      return this.node('return_type', [leaf]);
    }
    if (this.isWord('yield')) return this.node('return_type', [this.node('yield_type', [this.token('yield'), this.type()])]);
    return this.node('return_type', [this.type()]);
  }

  typeList() {
    const children = [this.type()];
    while (this.isPunct(',')) children.push(this.token(','), this.type());
    return this.node('type_list', children);
  }

  globalDecl() {
    return this.node('global_decl', [
      this.token('let'), this.identifier(), this.expectPunct(':'), this.type(), this.expectPunct('='), this.expression(),
    ]);
  }

  memDecl() {
    const pairs = [];
    const exported = this.isWord('export');
    if (exported) pairs.push([this.token('export'), 'export']);
    if (this.isWord('const')) pairs.push([this.token('const'), 'const']);
    // A vec is never exported: the host cannot see it.
    pairs.push(!exported && this.isWord('vec') ? [this.token('vec'), 'vec'] : [this.expectKeyword('mem')]);
    pairs.push([this.identifier()], [this.expectPunct(':')], [this.typeIdent()]);
    if (this.isPunct('=')) pairs.push([this.token('=')], [this.expression(), 'init']);
    return this.fielded('mem_decl', pairs);
  }

  distinctDecl() {
    return this.fielded('distinct_decl', [
      [this.token('type')], [this.typeIdent(), 'name'], [this.expectPunct('=')], [this.expectKeyword('distinct')], [this.typeIdent(), 'base'],
    ]);
  }

  typeDecl() {
    return this.node('type_decl', [this.token('type'), this.typeIdentOrPromoted(), this.expectPunct('='), this.dslExpr()]);
  }

  usingDecl() {
    const children = [this.token('using'), this.moduleName()];
    if (this.isPunct('[')) children.push(this.moduleTypeArgList());
    if (this.isPunct('|')) children.push(this.node('captured_module_name', [this.token('|'), this.moduleName(), this.expectPunct('|')]));
    // tree-sitter labels `lazy` as a field.
    let lazyAt = -1;
    if (this.isWord('lazy')) { lazyAt = children.length; children.push(this.token('lazy')); }
    if (this.isWord('from')) {
      children.push(this.token('from'));
      if (this.source[this.pos] === '"') {
        children.push(this.stringLit());
      } else {
        PLATFORM_PATH.lastIndex = this.pos;
        const match = PLATFORM_PATH.exec(this.source);
        if (!match) this.fail();
        const start = this.pos;
        this.pos += match[0].length;
        children.push(this.leaf('platform_path', start, this.pos, true));
        this.skip();
      }
    }
    const node = this.node('using_decl', children);
    if (lazyAt >= 0) node.fieldNames = children.map((_, i) => i === lazyAt ? 'lazy' : null);
    return node;
  }

  exportLibDecl() {
    const children = [this.token('export'), this.expectKeyword('lib'), this.expectPunct('{')];
    while (this.isWord('fn')) children.push(this.fnOrOpDecl());
    children.push(this.expectPunct('}'));
    return this.node('export_lib_decl', children);
  }

  exportMainDecl() {
    const children = [this.token('export'), this.expectKeyword('main'), this.expectPunct('(')];
    if (!this.isPunct(')')) children.push(this.paramList());
    children.push(this.expectPunct(')'), this.returnType(), this.block());
    return this.node('export_main_decl', children);
  }

  testDecl() {
    return this.node('test_decl', [this.token('test'), this.stringLit(), this.block()]);
  }

  benchDecl() {
    const children = [this.token('bench'), this.stringLit(), this.expectPunct('{')];
    while (!this.isWord('measure')) children.push(this.expression(), this.expectPunct(';'));
    children.push(this.node('measure_decl', [this.token('measure'), this.block()]));
    children.push(this.expectPunct('}'));
    return this.node('bench_decl', children);
  }

  // ── Types ──

  type() {
    if (this.isPunct('?')) return this.node('nullable_type', [this.token('?'), this.baseType()]);
    return this.baseType();
  }

  baseType() {
    if (this.isPunct('&')) return this.promotedType();
    if (this.isPunct('(')) return this.node('paren_type', [this.token('('), this.type(), this.expectPunct(')')]);
    if (this.isPunct('.')) {
      const children = [this.token('.'), this.expectPunct('{'), this.type()];
      while (this.isPunct(',')) {
        children.push(this.token(','));
        if (this.isPunct('}')) break;
        children.push(this.type());
      }
      children.push(this.expectPunct('}'));
      return this.node('tuple_type', children);
    }
    const word = this.word();
    // Where a type begins, `fun` and `cl` are always keywords.
    if (word === 'fun' || word === 'cl') {
      const children = [this.token(word), this.expectPunct('(')];
      if (!this.isPunct(')')) children.push(this.typeList());
      children.push(this.expectPunct(')'), this.returnType());
      return this.node(word === 'fun' ? 'func_type' : 'closure_type', children);
    }
    return this.node('ref_type', [this.refType()]);
  }

  /** The inside of a ref_type: a type name, `M.T`, `M[A]`, or `M[A].T`. */
  refType() {
    if (this.word() === null) this.fail();
    const save = this.save();
    const name = this.moduleName();
    if (this.isPunct('[')) {
      const instantiated = this.node('instantiated_module_ref', [name, this.moduleTypeArgList()]);
      if (this.isPunct('.')) return this.node('qualified_type_ref', [instantiated, this.token('.'), this.typeIdent()]);
      return instantiated;
    }
    if (this.isPunct('.') && !this.isPunct('...') && !this.isPunct('..<')) {
      return this.node('qualified_type_ref', [this.node('module_ref', [name]), this.token('.'), this.typeIdent()]);
    }
    this.restore(save);
    return this.typeIdent();
  }

  // ── Statements and blocks ──

  block() {
    const children = [this.expectPunct('{')];
    while (!this.isPunct('}')) children.push(this.expression(), this.expectPunct(';'));
    children.push(this.token('}'));
    return this.node('block', children);
  }

  capture() {
    const children = [this.expectPunct('|'), this.identifier()];
    while (this.isPunct(',')) children.push(this.token(','), this.identifier());
    children.push(this.expectPunct('|'));
    return this.node('capture', children);
  }

  // ── Expressions ──

  expression() {
    return this.expr(-Infinity, true);
  }

  /**
   * An expression whose operators have precedence above `min`, or equal to
   * it when `orEqual` (the rule this operand belongs to is right-associative).
   */
  expr(min, orEqual) {
    let left = this.prefix();
    for (;;) {
      const next = this.infix(left, min, orEqual);
      if (next === null) return left;
      left = next;
    }
  }

  binds(precedence, min, orEqual) {
    return precedence > min || (precedence === min && orEqual);
  }

  /** Extend `left` by one postfix or infix operation, or return null. */
  infix(left, min, orEqual) {
    const punct = this.punct(true);
    const word = this.word();
    // Postfix: calls, fields, indexes (precedence 14).
    if (this.binds(14, min, orEqual)) {
      if (punct === '(') return this.node('call_expr', [left, this.token('('), ...this.argListOrNone(), this.expectPunct(')')]);
      if (punct === '.') {
        const dot = this.token('.');
        return this.node('field_expr', [left, dot, this.identifierOrType()]);
      }
      if (punct === '?.') return this.node('optional_field_expr', [left, this.token('?.'), this.identifierOrType()]);
      if (punct === '[') {
        const open = this.token('[');
        const index = this.expression();
        if (this.isPunct(',')) {
          return this.node('slice_expr', [left, open, index, this.token(','), this.expression(), this.expectPunct(']')]);
        }
        return this.node('index_expr', [left, open, index, this.expectPunct(']')]);
      }
    }
    // Compound assignment keywords lex as one token: `x and= y`.
    if ((word === 'and' || word === 'or' || word === 'xor') && this.source[this.pos + word.length] === '='
        && this.source[this.pos + word.length + 1] !== '=') {
      return this.assignment(left, `${word}=`);
    }
    if (punct !== null && ASSIGNMENT.has(punct)) return this.assignment(left, punct);
    const operator = punct !== null && BINARY.has(punct) ? punct : word !== null && BINARY.has(word) ? word : null;
    if (operator !== null) {
      const [precedence, assoc] = BINARY.get(operator);
      if (!this.binds(precedence, min, orEqual)) return null;
      const token = this.token(operator);
      return this.node('binary_expr', [left, token, this.expr(precedence, assoc === 'right')]);
    }
    if (word !== null && ITERATOR_FORMS.has(word)) {
      if (!this.binds(1, min, orEqual)) return null;
      return this.iterator(left, word);
    }
    if (word === 'orelse') {
      if (!this.binds(1, min, orEqual)) return null;
      return this.node('else_expr', [left, this.token('orelse'), this.expr(1, false)]);
    }
    if (punct === '-o') {
      if (!this.binds(0, min, orEqual)) return null;
      return this.node('pipe_expr', [left, this.token('-o'), this.pipeTarget()]);
    }
    return null;
  }

  /**
   * An assignment to `left`, whatever the surrounding precedence: tree-sitter
   * shifts the operator onto an assignable target before reducing it into
   * an enclosing expression, so `a + b = c` is `a + (b = c)`.
   */
  assignment(left, operator) {
    const target = left.type;
    if (target !== 'identifier' && target !== 'field_expr' && target !== 'optional_field_expr'
        && target !== 'index_expr' && !(target === 'type_member_expr' && left.children[0].type === 'type_ident')) return null;
    return this.node('assign_expr', [left, this.token(operator), this.expr(0, true)]);
  }

  argListOrNone() {
    if (this.isPunct(')')) return [];
    const children = [this.expression()];
    while (this.isPunct(',')) {
      children.push(this.token(','));
      if (this.isPunct(')')) break;
      children.push(this.expression());
    }
    return [this.node('arg_list', children)];
  }

  iterator(source, op) {
    const pairs = [[source, 'source'], [this.token(op), 'op']];
    const form = ITERATOR_FORMS.get(op);
    const paren = parts => {
      pairs.push([this.expectPunct('(')]);
      parts();
      pairs.push([this.expectPunct(')')]);
    };
    switch (form) {
      case 'capture': break;
      case 'param-capture': case 'param': paren(() => pairs.push([this.expression(), 'param'])); break;
      case 'element-capture': case 'element': paren(() => pairs.push([this.type(), 'element'])); break;
      case 'element-key-capture': paren(() => pairs.push([this.type(), 'element'], [this.expectPunct(',')], [this.type(), 'key'])); break;
      case 'element-param': paren(() => pairs.push([this.type(), 'element'], [this.expectPunct(',')], [this.expression(), 'param'])); break;
      case 'none': break;
    }
    if (form.endsWith('capture')) pairs.push([this.capture()], [this.block()]);
    return this.fielded('iterator_expr', pairs);
  }

  pipeTarget() {
    const children = [];
    if (this.word() === null) this.fail();
    const name = this.moduleName();
    if (this.isPunct('[')) {
      children.push(this.node('instantiated_module_ref', [name, this.moduleTypeArgList()]));
    } else {
      // Not a module after all: the path starts with a plain name.
      children.push(name.children[0]);
    }
    while (this.isPunct('.')) children.push(this.token('.'), this.identifierOrType());
    if (this.isPunct('(')) {
      children.push(this.token('('), this.pipeArgs(), this.expectPunct(')'));
    }
    return this.node('pipe_target', children);
  }

  pipeArgs() {
    const args = [];
    let placeholder = false;
    for (;;) {
      if (this.isPunct('&')) {
        if (placeholder) this.fail();
        placeholder = true;
        args.push(this.node('pipe_arg_placeholder', [this.promotedType()]));
      } else {
        args.push(this.node('pipe_arg', [this.expression()]));
      }
      if (!this.isPunct(',')) break;
      args.push(this.token(','));
      if (this.isPunct(')')) break;
    }
    return this.node('pipe_args', [this.node(placeholder ? 'pipe_args_with_placeholder' : 'pipe_args_no_placeholder', args)]);
  }

  prefix() {
    const source = this.source;
    const c = source[this.pos];
    if (c === undefined) this.fail();
    const word = this.word();
    if (word !== null && EXPRESSION_KEYWORDS.has(word)) return this.keywordExpression(word);
    if (word !== null) return this.wordExpression(word);
    if (c >= '0' && c <= '9') return this.node('literal', [this.number()]);
    if (c === '"') return this.node('literal', [this.stringLit()]);
    if (c === '`') return this.templateString();
    if (source.startsWith('\\\\', this.pos)) return this.node('literal', [this.multilineString()]);
    const punct = this.punct();
    switch (punct) {
      case '-': case '~': {
        const op = this.node('unary_op', [this.token(punct)]);
        return this.node('unary_expr', [op, this.expr(13, true)]);
      }
      case '(': return this.parenOrRange();
      case '[': return this.arrayExpr();
      case '.': return this.tupleExpr();
      case '{': return this.node('block_expr', [this.block()]);
      case '&': {
        const amp = this.promotedType();
        return this.node('implicit_struct_init', [amp, ...this.fieldInits()]);
      }
      case '@': return this.dslExpr();
      default: return this.fail();
    }
  }

  number() {
    FLOAT.lastIndex = this.pos;
    let match = FLOAT.exec(this.source);
    let type = 'float_lit';
    if (!match) {
      INT.lastIndex = this.pos;
      match = INT.exec(this.source);
      type = 'int_lit';
    }
    if (!match) this.fail();
    const start = this.pos;
    this.pos += match[0].length;
    const node = this.leaf(type, start, this.pos, true);
    this.skip();
    return node;
  }

  intLit() {
    const c = this.source[this.pos];
    if (!(c >= '0' && c <= '9')) this.fail();
    const node = this.number();
    if (node.type !== 'int_lit') this.fail();
    return node;
  }

  /**
   * `text ${expr} text`: its text pieces are tokens (template_full, or
   * template_head, template_middle…, template_tail), each from its opening
   * backtick or `}` through its closing backtick or `${`.
   */
  templateString() {
    const source = this.source;
    const parts = [];
    let start = this.pos;
    for (;;) {
      TEMPLATE_TEXT.lastIndex = start + 1;
      TEMPLATE_TEXT.exec(source);
      let end = TEMPLATE_TEXT.lastIndex;
      // `$${`: the text's last `$` begins the `${`.
      if (source[end] === '{' && end > start + 1 && source[end - 1] === '$') end--;
      const first = source[start] === '`';
      if (source[end] === '`') {
        parts.push(this.leaf(first ? 'template_full' : 'template_tail', start, end + 1, true));
        this.pos = end + 1;
        this.skip();
        return this.node('template_string', parts);
      }
      if (!source.startsWith('${', end)) this.fail();
      parts.push(this.leaf(first ? 'template_head' : 'template_middle', start, end + 2, true));
      this.pos = end + 2;
      this.skip();
      parts.push(this.expression());
      if (source[this.pos] !== '}') this.fail();
      start = this.pos;
    }
  }

  multilineString() {
    const lines = [];
    while (this.source.startsWith('\\\\', this.pos)) {
      let end = this.source.indexOf('\n', this.pos);
      if (end < 0) end = this.source.length;
      lines.push(this.leaf('multiline_string_line', this.pos, end, true));
      this.pos = end;
      this.skip();
    }
    return this.node('multiline_string_lit', lines);
  }

  keywordExpression(word) {
    switch (word) {
      case 'true': case 'false': case 'null': return this.node('literal', [this.token(word)]);
      case 'not': {
        const op = this.node('unary_op', [this.token('not')]);
        return this.node('unary_expr', [op, this.expr(13, true)]);
      }
      case 'await': return this.node('await_expr', [this.token('await'), this.expr(13, true)]);
      case 'assert': return this.node('assert_expr', [this.token('assert'), this.expr(-2, true)]);
      case 'new': {
        const keyword = this.token('new');
        let callee = this.prefix();
        for (;;) {
          const punct = this.punct(true);
          if (punct === '.' || punct === '?.' || punct === '[') callee = this.infix(callee, 13, false) ?? this.fail();
          else break;
        }
        return this.node('new_expr', [keyword, callee, this.expectPunct('('), ...this.argListOrNone(), this.expectPunct(')')]);
      }
      case 'return': case 'continue': {
        const keyword = this.token(word);
        const value = this.startsExpression() ? this.expr(0, true) : null;
        return this.node(`${word}_expr`, [keyword, value]);
      }
      case 'yield': case 'defer': case 'errdefer': return this.node(`${word}_expr`, [this.token(word), this.expr(0, true)]);
      case 'break': {
        // `break label value`: a label is a name, but not a word that may follow an expression.
        const keyword = this.token('break');
        const name = this.word();
        if (name === null || !IDENTIFIER.test(name) || !this.startsExpression()) return this.node('break_expr', [keyword]);
        const label = this.identifier();
        const value = this.startsExpression() ? this.expr(0, true) : null;
        return this.node('break_expr', [keyword, label, value]);
      }
      case 'fatal': case 'prune': {
        const start = this.pos;
        this.pos += word.length;
        const node = this.leaf(`${word}_expr`, start, this.pos, true);
        this.skip();
        return node;
      }
      case 'let': return this.bindExpr();
      case 'cl': return this.closureExpr();
      case 'if': return this.ifExpr();
      case 'match': return this.matchExpr('match_expr', [this.token('match')]);
      case 'loop': return this.matchExpr('loop_match_expr', [this.token('loop'), this.expectKeyword('match')]);
      case 'alt': return this.altExpr();
      case 'promote': return this.promoteExpr();
      case 'try': return this.tryExpr();
      case 'for': return this.forExpr();
      case 'while': return this.whileExpr();
      default: return this.fail();
    }
  }

  /**
   * Whether the token at the cursor begins `return`'s or `continue`'s
   * optional value. Operator words (`and`, `orelse`, …) and `-o` instead
   * extend the bare `return`; an iterator word (`count`, `sum`, …) is a name,
   * since a bare `return` has nothing to pipe.
   */
  startsExpression() {
    const c = this.source[this.pos];
    if (c === undefined) return false;
    const word = this.word();
    if (word !== null) return !BINARY.has(word) && word !== 'orelse';
    if ((c >= '0' && c <= '9') || c === '"' || c === '`') return true;
    if (this.source.startsWith('\\\\', this.pos)) return true;
    return ['-', '~', '(', '[', '.', '{', '&', '@'].includes(this.punct(true));
  }

  wordExpression(word) {
    // `m.T { field: … }` and `M.T { field: … }` build a struct from module m or M.
    const qualified = this.qualifiedStructInit();
    if (qualified) return qualified;
    if (IDENTIFIER.test(word)) {
      // `label: { … }`
      const save = this.save();
      const name = this.identifier();
      if (this.isPunct(':')) {
        const colon = this.token(':');
        if (this.isPunct('{')) return this.node('block_expr', [name, colon, this.block()]);
      }
      this.restore(save);
      // `m[i]` indexes; `m[A]…` names an instantiated module only when the
      // brackets do not hold an index.
      if (this.indexAhead()) return this.identifier();
      if (!this.moduleArgsAhead()) return this.identifier();
    }
    // A type name begins `T.null`, `T.member`, `T { … }`, `M[A].f(…)`, or `M[A].T.member`.
    if (this.moduleCallAhead()) return this.moduleCall();
    const save = this.save();
    const type = this.wordNode(IDENTIFIER.test(word) ? 'identifier' : 'type_ident');
    if (type.type === 'type_ident' && this.isPunct('{')) return this.node('struct_init', [type, ...this.fieldInits()]);
    if (this.isPunct('[')) {
      this.restore(save);
      // After `M[A]`, only `.T.member` is left (`.f(…)` was a module call).
      const instantiated = this.node('instantiated_module_ref', [this.moduleName(), this.moduleTypeArgList()]);
      const dot = this.expectPunct('.');
      if (this.isIdentifierShaped()) this.fail();
      const member = this.typeIdent();
      const path = this.node('inline_module_type_path', [...instantiated.children, dot, member]);
      return this.node('type_member_expr', [path, this.expectPunct('.'), this.identifierOrType()]);
    }
    if (type.type !== 'type_ident' || !this.isPunct('.')) this.fail();
    const dot = this.token('.');
    if (this.isWord('null')) return this.node('null_expr', [type, dot, this.token('null')]);
    // `M.T {}` is the member `M.T` before an empty block, never a struct.
    // (`M.T.member` is a field of `M.T`.)
    return this.node('type_member_expr', [type, dot, this.identifierOrType()]);
  }

  /**
   * `m.T { field: … }` at the cursor, or null without consuming. Braces that fail
   * as fields are a block (`if x == m.T { … }`); so are empty braces after a
   * capitalized `M`, as in `if c == Color.Red {}`.
   */
  qualifiedStructInit() {
    const save = this.save();
    try {
      const capital = !this.isIdentifierShaped();
      const name = this.identifierOrType();
      if (!this.isPunct('.') || this.isPunct('...') || this.isPunct('..<')) return this.restoreNull(save);
      const dot = this.token('.');
      if (this.word() === null) return this.restoreNull(save);
      const member = this.typeIdent();
      if (!this.isPunct('{')) return this.restoreNull(save);
      if (capital) {
        const brace = this.save();
        this.token('{');
        const empty = this.isPunct('}');
        this.restore(brace);
        if (empty) return this.restoreNull(save);
      }
      const qualified = this.node('qualified_type_ref', [this.node('module_ref', [this.node('module_name', [name])]), dot, member]);
      return this.node('struct_init', [qualified, ...this.fieldInits()]);
    } catch (error) {
      if (error instanceof Unsupported) return this.restoreNull(save);
      throw error;
    }
  }

  restoreNull(save) {
    this.restore(save);
    return null;
  }

  /** Whether the cursor starts `name[types]` (a module instantiation). */
  moduleArgsAhead() {
    const save = this.save();
    try {
      this.moduleName();
      if (!this.isPunct('[')) return false;
      this.moduleTypeArgList();
      return this.isPunct('.');
    } catch (error) {
      if (error instanceof Unsupported) return false;
      throw error;
    } finally {
      this.restore(save);
    }
  }

  /** Whether the cursor starts `name[index]` or `name[start, end]` with expressions inside. */
  indexAhead() {
    const save = this.save();
    try {
      this.identifier();
      if (!this.isPunct('[')) return false;
      this.token('[');
      this.expression();
      if (this.isPunct(',')) {
        this.token(',');
        this.expression();
      }
      return this.isPunct(']');
    } catch (error) {
      if (error instanceof Unsupported) return false;
      throw error;
    } finally {
      this.restore(save);
    }
  }

  /** Whether the cursor starts `name[types].identifier(`. */
  moduleCallAhead() {
    const save = this.save();
    try {
      this.moduleName();
      if (!this.isPunct('[')) return false;
      this.moduleTypeArgList();
      if (!this.isPunct('.')) return false;
      this.token('.');
      if (!this.isIdentifierShaped()) return false;
      this.identifier();
      return this.isPunct('(');
    } catch (error) {
      if (error instanceof Unsupported) return false;
      throw error;
    } finally {
      this.restore(save);
    }
  }

  moduleCall() {
    const children = [this.moduleName(), this.moduleTypeArgList(), this.expectPunct('.'), this.identifier(), this.expectPunct('(')];
    children.push(...this.argListOrNone(), this.expectPunct(')'));
    return this.node('promoted_module_call_expr', children);
  }

  fieldInits() {
    const children = [this.expectPunct('{')];
    if (!this.isPunct('}')) {
      children.push(this.fieldInit());
      while (this.isPunct(',')) {
        children.push(this.token(','));
        if (this.isPunct('}')) break;
        children.push(this.fieldInit());
      }
    }
    children.push(this.expectPunct('}'));
    return children;
  }

  fieldInit() {
    return this.node('field_init', [this.identifier(), this.expectPunct(':'), this.expression()]);
  }

  parenOrRange() {
    const open = this.token('(');
    const first = this.expression();
    const punct = this.punct(true);
    if (punct === '...' || punct === '..<') {
      return this.fielded('range_expr', [
        [open], [first, 'start'], [this.token(punct), 'kind'], [this.expression(), 'end'], [this.expectPunct(')')],
      ]);
    }
    return this.node('paren_expr', [open, first, this.expectPunct(')')]);
  }

  arrayExpr() {
    const children = [this.token('[')];
    if (!this.isPunct(']')) {
      children.push(this.expression());
      while (this.isPunct(',')) {
        children.push(this.token(','));
        if (this.isPunct(']')) break;
        children.push(this.expression());
      }
    }
    children.push(this.expectPunct(']'));
    return this.node('array_expr', children);
  }

  tupleExpr() {
    const children = [this.token('.'), this.expectPunct('{'), this.expression()];
    while (this.isPunct(',')) {
      children.push(this.token(','));
      if (this.isPunct('}')) break;
      children.push(this.expression());
    }
    children.push(this.expectPunct('}'));
    return this.node('tuple_expr', children);
  }

  dslExpr() {
    const at = this.expectPunct('@');
    const name = this.identifier();
    // The body is an external token: `/\ … \/`, nested pairs balanced (see dsl-envelope.js).
    const source = this.source;
    if (!source.startsWith('/\\', this.pos)) this.fail();
    const start = this.pos;
    let close;
    try { close = dslEnd(source, start + 2); } catch { this.fail(); }
    const i = close + 2;
    this.pos = i;
    // As tree-sitter's: the delimiters hidden, the text (if any) an anonymous `dsl_text`.
    const text = close > start + 2 ? [this.leaf('dsl_text', start + 2, close, false)] : [];
    const body = new SyntaxNode(this.tree, 'dsl_body', true, start, i, text);
    this.skip();
    return this.node('dsl_expr', [at, name, body]);
  }

  bindExpr() {
    const keyword = this.token('let');
    if (this.isPunct('.')) {
      const children = [this.token('.'), this.expectPunct('{'), this.identifier()];
      while (this.isPunct(',')) {
        children.push(this.token(','));
        if (this.isPunct('}')) break;
        children.push(this.identifier());
      }
      children.push(this.expectPunct('}'));
      return this.node('bind_expr', [keyword, this.node('tuple_pattern', children), this.expectPunct('='), this.expr(0, true)]);
    }
    const children = [keyword, this.identifier()];
    if (this.isPunct(':')) children.push(this.token(':'), this.type());
    children.push(this.expectPunct('='), this.expr(0, true));
    return this.node('bind_expr', children);
  }

  closureExpr() {
    const children = [this.token('cl'), this.expectPunct('(')];
    if (!this.isPunct(')')) {
      const params = [this.closureParam()];
      while (this.isPunct(',')) {
        params.push(this.token(','));
        if (this.isPunct(')')) break;
        params.push(this.closureParam());
      }
      children.push(this.node('closure_param_list', params));
    }
    children.push(this.expectPunct(')'));
    if (!this.isPunct('{')) children.push(this.returnType());
    children.push(this.block());
    return this.node('closure_expr', children);
  }

  closureParam() {
    const children = [this.identifier()];
    if (this.isPunct(':')) children.push(this.token(':'), this.type());
    return this.node('closure_param', children);
  }

  ifExpr() {
    const children = [this.token('if'), this.expression(), this.block()];
    if (this.isWord('else')) {
      children.push(this.token('else'));
      children.push(this.isWord('if') ? this.ifExpr() : this.block());
    }
    return this.node('if_expr', children);
  }

  matchExpr(type, children) {
    children.push(this.expression(), this.expectPunct('{'));
    while (!this.isPunct('}') && !this.isPunct('~>')) children.push(this.matchArm());
    if (this.isPunct('~>')) children.push(this.node('match_default', [this.token('~>'), this.expression(), this.expectPunct(',')]));
    children.push(this.expectPunct('}'));
    return this.node(type, children);
  }

  matchArm() {
    return this.node('match_arm', [this.matchLit(), this.expectPunct('=>'), this.expression(), this.expectPunct(',')]);
  }

  matchLit() {
    const word = this.word();
    if (word === 'true' || word === 'false') {
      const start = this.pos;
      this.pos += word.length;
      const leaf = this.leaf('bool_lit', start, this.pos, true);
      this.skip();
      return this.node('match_lit', [leaf]);
    }
    if (word !== null) return this.node('match_lit', [this.unreservedTypeIdent(), this.expectPunct('.'), this.typeIdent()]);
    const children = [];
    if (this.isPunct('-')) children.push(this.token('-'));
    const c = this.source[this.pos];
    if (!(c >= '0' && c <= '9')) this.fail();
    children.push(this.number());
    return this.node('match_lit', children);
  }

  altExpr() {
    const children = [this.token('alt'), this.expression(), this.expectPunct('{')];
    while (!this.isPunct('}') && !this.isPunct('~>')) {
      const arm = [this.altPattern()];
      if (this.isPunct('|')) arm.push(this.token('|'), this.identifier(), this.expectPunct('|'));
      arm.push(this.expectPunct('=>'), this.expression(), this.expectPunct(','));
      children.push(this.node('alt_arm', arm));
    }
    if (this.isPunct('~>')) children.push(this.node('alt_default', [this.token('~>'), this.expression(), this.expectPunct(',')]));
    children.push(this.expectPunct('}'));
    return this.node('alt_expr', children);
  }

  altPattern() {
    const save = this.save();
    const name = this.moduleName();
    if (this.isPunct('[') || this.isPunct('.')) {
      let ref;
      if (this.isPunct('[')) ref = this.node('instantiated_module_ref', [name, this.moduleTypeArgList()]);
      else ref = this.node('module_ref', [name]);
      return this.node('qualified_type_ref', [ref, this.expectPunct('.'), this.typeIdent()]);
    }
    this.restore(save);
    // A bare variant name cannot be a keyword; a module before `.` can.
    return this.unreservedTypeIdent();
  }

  promoteExpr() {
    const children = [this.token('promote'), this.expression(), this.expectPunct('{'),
      this.expectPunct('|'), this.identifier(), this.expectPunct('|'), this.expectPunct('=>'), this.expression(), this.expectPunct(',')];
    if (this.isPunct('~>')) children.push(this.token('~>'), this.expression(), this.expectPunct(','));
    children.push(this.expectPunct('}'));
    return this.node('promote_expr', children);
  }

  /** `try { … } catch …` catches what the host throws; `try e` passes on e's error. */
  tryExpr() {
    const keyword = this.token('try');
    if (!this.isPunct('{')) return this.node('try_result_expr', [keyword, this.expr(13, true)]);
    const body = this.block();
    if (!this.isWord('catch')) {
      // `try {…}` without catch: a block's value, as any other operand.
      let operand = this.node('block_expr', [body]);
      for (;;) {
        const next = this.infix(operand, 13, true);
        if (next === null) break;
        operand = next;
      }
      return this.node('try_result_expr', [keyword, operand]);
    }
    const children = [keyword, body, this.expectKeyword('catch')];
    if (this.isPunct('|')) children.push(this.token('|'), this.identifier(), this.expectPunct('|'));
    children.push(this.block());
    return this.node('try_expr', children);
  }

  forExpr() {
    const children = [this.token('for'), this.expectPunct('(')];
    const sources = [this.forSource()];
    while (this.isPunct(',')) sources.push(this.token(','), this.forSource());
    children.push(this.node('for_sources', sources), this.expectPunct(')'));
    if (this.isPunct('|')) children.push(this.capture());
    children.push(this.block());
    return this.node('for_expr', children);
  }

  forSource() {
    const children = [this.expression()];
    const punct = this.punct(true);
    if (punct === '...' || punct === '..<') children.push(this.token(punct), this.expression());
    return this.node('for_source', children);
  }

  whileExpr() {
    const children = [this.token('while'), this.expectPunct('(')];
    if (!this.isPunct(')')) children.push(this.expression());
    children.push(this.expectPunct(')'), this.block());
    return this.node('while_expr', children);
  }
}

// ── Comments ─────────────────────────────────────────────────────────────────

/** Put each comment in the smallest node whose first and last tokens surround it. */
function attachComments(parser, root) {
  for (const [start, end] of parser.comments) {
    const comment = new SyntaxNode(parser.tree, 'comment', true, start, end, []);
    let node = root;
    for (;;) {
      const inside = node.children.find(child => child.children.length && child.startIndex < start && child.endIndex > start);
      if (!inside) break;
      node = inside;
    }
    let at = node.children.findIndex(child => child.startIndex >= end);
    if (at < 0) at = node.children.length;
    node.children.splice(at, 0, comment);
    if (node.fieldNames) node.fieldNames.splice(at, 0, null);
    node.named = null;
  }
}
