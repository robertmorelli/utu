// tree-sitter-wutu: Wutu templates (the payload of `@wutu/\ … \/`), for editors.
//
// Structure is parsed: directives, elements, attributes, properties, bindings,
// events, text, holes, if/for, CSS declarations and rule blocks. Utu inside a
// template (holes, conditions, handlers) is read as tokens, which is enough to
// highlight it (an expression alone is no utu file, so utu's grammar cannot
// take it). A DSL inside that utu, `@name/\ … \/`, is a dsl_expr whose text
// editors inject by name, Wutu again included; `@document` CSS is css_text.
// A statement ends at a line break (or `;`, or the `}` closing its block),
// as a utu statement does: see src/scanner.c.
const KEYWORDS = [
  'let', 'cl', 'fun', 'if', 'else', 'match', 'alt', 'promote', 'orelse', 'not', 'and', 'or', 'xor',
  'true', 'false', 'null', 'return', 'await', 'try', 'catch', 'for', 'while', 'loop', 'break', 'continue',
  'defer', 'yield', 'fatal', 'assert', 'new',
];
// Keywords a line can end on and go on from (`a and`, then `b`).
const OPEN_KEYWORDS = ['else', 'orelse', 'not', 'and', 'or', 'xor'];

module.exports = grammar({
  name: 'wutu',
  externals: $ => [$._dsl_open, $._dsl_text, $._dsl_close, $.css_text, $._statement_end],
  extras: $ => [/\s/, $.comment],
  word: $ => $.name,
  rules: {
    template: $ => repeat(choice($._directive, $._node, ';')),

    comment: _ => token(choice(seq('//', /[^\n]*/), seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'))),
    name: _ => /[a-zA-Z_][a-zA-Z0-9_-]*/,
    string: _ => token(seq('"', repeat(choice(/[^"\\\n]+/, /\\./)), '"')),

    // Directives
    _directive: $ => choice($.reactive, $.island, $.style_use, $.document, $.unmanaged),
    _end: $ => choice(';', $._statement_end),
    reactive: $ => seq('@reactive', $._end),
    island: $ => seq('@island', $.string, $._end),
    style_use: $ => seq('@style', $.expression, $._end),
    document: $ => seq('@document', '{', optional($.css_text), '}'),
    // (Ahead of a CSS at-rule's selector, which `@unmanaged }` would also match.)
    unmanaged: $ => seq(alias(token(prec(1, '@unmanaged')), '@unmanaged'), $._end),

    // Children
    _node: $ => choice($.text, $.hole, $.if, $.for, $.element),
    text: $ => seq($.string, $._end),
    hole: $ => seq(choice('=', '|', '|>'), $.expression, $._end),
    if: $ => seq('if', alias($._condition, $.expression), $.branch,
      repeat(seq('else', 'if', alias($._condition, $.expression), $.branch)),
      optional(seq('else', $.branch))),
    for: $ => seq('for', alias($._iterable, $.expression), $.capture,
      optional(seq('key', optional('global'), alias($._condition, $.expression))), $.branch),
    branch: $ => seq('{', repeat(choice($._node, ';')), '}'),
    capture: $ => seq('|', commaSep1($.name), '|'),

    element: $ => seq($.tag, repeat(choice($.class, $.id)), optional(seq('as', alias($.name, $.alias))), '{',
      repeat($._statement), '}'),
    tag: $ => $.name,
    class: $ => seq('.', alias($.name, $.class_name)),
    id: $ => seq('#', alias($.name, $.id_name)),

    _statement: $ => choice($._node, $.unmanaged, $.attribute, $.property, $.binding, $.event,
      $.css_declaration, $.css_rule, ';'),
    // (`for = "id";` on a label: `for` before `=` is an attribute, not a loop.)
    attribute: $ => choice(
      seq($.attribute_name, choice($._end, seq('=', $.expression, $._end))),
      seq(alias('for', $.attribute_name), '=', $.expression, $._end),
    ),
    // (`xlink:href`: a namespaced attribute; no CSS property has those prefixes.)
    attribute_name: $ => choice($.name, /(xlink|xmlns|xml):[a-zA-Z][a-zA-Z0-9_-]*/),
    property: $ => seq('.', alias($.name, $.property_name), '=', $.expression, $._end),
    binding: $ => seq(alias(/bind:[a-z]+/, $.binding_name), '=', $.expression, $._end),
    event: $ => seq('on', alias($.name, $.event_name), optional('quiet'), optional($.capture),
      choice($.handler, seq('=', $.expression, $._end))),
    handler: $ => seq('{', repeat($._statement_token), '}'),

    // CSS
    css_declaration: $ => seq($.css_property, ':', choice($.brace_group, seq('=', $.expression), $.css_value), $._end),
    css_property: $ => choice($.name, /--[a-zA-Z0-9_-]+/),
    // (A `,` goes on to the next line: an item follows it.)
    css_value: $ => repeat1(choice($._css_item, seq(',', $._css_item))),
    _css_item: $ => choice($.css_number, $.css_color, $.string, $.css_function, alias($.name, $.css_keyword),
      $.css_url, '/', '+', '-', '*', '!important', /'[^'\n]*'/),
    css_number: _ => /-?(\d+\.?\d*|\.\d+)([a-zA-Z%]+)?/,
    css_color: _ => /#[0-9a-fA-F]{3,8}/,
    css_url: _ => token(seq('url(', /[^)]*/, ')')),
    // `rgb(…)`: the name, then `(` right after it (so the paren is a bracket, not the name's).
    css_function: $ => seq(alias($.name, $.css_function_name), token.immediate('('), optional($.css_value), ')'),
    css_rule: $ => seq($.css_selector, '{', repeat(choice($.css_declaration, $.css_rule, ';')), '}'),
    css_selector: _ => token(seq(choice(':', '&', /@ /, /@[a-z-]+/), /[^{};]*/)),

    // Utu, as tokens. An expression's operators each take an operand after
    // them, so a line ending in one goes on (`a +`, then `b`).
    expression: $ => prec.right(repeat1(choice($._operand, seq(repeat1($._open), $._operand)))),
    _operand: $ => choice(alias($._value_keyword, $.keyword), alias($.name, $.identifier), $.number, $.string,
      $.template_string, $.dsl_expr, $.paren_group, $.bracket_group, $.brace_group),
    _open: $ => choice(alias($._open_keyword, $.keyword), $.operator, '.', ',', ':', '?', '?.', '|'),
    _value_keyword: _ => choice(...KEYWORDS.filter(k => !OPEN_KEYWORDS.includes(k))),
    _open_keyword: _ => choice(...OPEN_KEYWORDS),
    _condition: $ => repeat1($._expression_token),
    _iterable: $ => repeat1($._iterable_token),
    _expression_token: $ => choice($._iterable_token, '|'),
    _iterable_token: $ => choice(
      $.keyword, alias($.name, $.identifier), $.number, $.string, $.template_string, $.dsl_expr,
      $.paren_group, $.bracket_group, $.operator, '.', ',', ':', '?', '?.',
    ),
    // (A bare `=` assigns: only statements have it, so `for =` stays an attribute.)
    _statement_token: $ => choice($._expression_token, $.brace_group, ';', alias(choice('=', '+=', '-=', '*=', '/='), $.operator)),
    paren_group: $ => seq('(', repeat($._statement_token), ')'),
    bracket_group: $ => seq('[', repeat($._statement_token), ']'),
    brace_group: $ => seq('{', repeat($._statement_token), '}'),
    keyword: _ => choice(...KEYWORDS),
    number: _ => /\d[\w.]*/,
    template_string: $ => seq('`', repeat(choice($._template_text, $.template_interpolation)), token.immediate('`')),
    _template_text: _ => token.immediate(choice(/[^`\\$]+/, /\\[\s\S]/, '$')),
    template_interpolation: $ => seq(token.immediate('${'), repeat($._statement_token), '}'),
    operator: _ => choice('+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=',
      '&', '^', '~', '<<', '>>', '=>', '~>', '..<', '...', '&{'),

    // A DSL inside utu: `@name/\ … \/`, its text injected by name.
    dsl_expr: $ => seq('@', alias($.name, $.dsl_name), $.dsl_body),
    dsl_body: $ => seq($._dsl_open, optional(alias($._dsl_text, 'dsl_text')), $._dsl_close),
  },
});

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
