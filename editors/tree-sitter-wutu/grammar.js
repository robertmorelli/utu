// tree-sitter-wutu: Wutu templates (the payload of `@wutu/\ … \/`), for editors.
//
// Structure is parsed: directives, elements, attributes, properties, bindings,
// events, text, holes, if/for, CSS declarations and rule blocks. Utu inside a
// template (holes, conditions, handlers) is read as tokens, which is enough to
// highlight it (an expression alone is no utu file, so utu's grammar cannot
// take it). A DSL inside that utu, `@name/\ … \/`, is a dsl_expr whose text
// editors inject by name, Wutu again included; `@document` CSS is css_text.
const KEYWORDS = [
  'let', 'cl', 'fun', 'if', 'else', 'match', 'alt', 'promote', 'orelse', 'not', 'and', 'or', 'xor',
  'true', 'false', 'null', 'return', 'await', 'try', 'catch', 'for', 'while', 'loop', 'break', 'continue',
  'defer', 'yield', 'fatal', 'assert', 'new',
];

module.exports = grammar({
  name: 'wutu',
  externals: $ => [$._dsl_open, $._dsl_text, $._dsl_close, $.css_text],
  extras: $ => [/\s/, $.comment],
  word: $ => $.name,
  rules: {
    template: $ => repeat(choice($._directive, $._node, ';')),

    comment: _ => token(choice(seq('//', /[^\n]*/), seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'))),
    name: _ => /[a-zA-Z_][a-zA-Z0-9_-]*/,
    string: _ => token(seq('"', repeat(choice(/[^"\\\n]+/, /\\./)), '"')),

    // Directives
    _directive: $ => choice($.reactive, $.island, $.style_use, $.document, $.unmanaged),
    reactive: _ => seq('@reactive', ';'),
    island: $ => seq('@island', $.string, ';'),
    style_use: $ => seq('@style', $.expression, ';'),
    document: $ => seq('@document', '{', optional($.css_text), '}'),
    unmanaged: _ => seq('@unmanaged', ';'),

    // Children
    _node: $ => choice($.text, $.hole, $.if, $.for, $.element),
    text: $ => seq($.string, ';'),
    hole: $ => seq('=', $.expression, ';'),
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
      seq($.attribute_name, choice(';', seq('=', $.expression, ';'))),
      seq(alias('for', $.attribute_name), '=', $.expression, ';'),
    ),
    attribute_name: $ => $.name,
    property: $ => seq('.', alias($.name, $.property_name), '=', $.expression, ';'),
    binding: $ => seq(alias(/bind:[a-z]+/, $.binding_name), '=', $.expression, ';'),
    event: $ => seq('on', alias($.name, $.event_name), optional('quiet'), optional($.capture),
      choice($.handler, seq('=', $.expression, ';'))),
    handler: $ => seq('{', repeat($._statement_token), '}'),

    // CSS
    css_declaration: $ => seq($.css_property, ':', choice(seq('=', $.expression), $.css_value), ';'),
    css_property: $ => choice($.name, /--[a-zA-Z0-9_-]+/),
    css_value: $ => repeat1(choice($.css_number, $.css_color, $.string, $.css_function, alias($.name, $.css_keyword),
      $.css_url, ',', '/', '+', '-', '*', '!important', /'[^'\n]*'/)),
    css_number: _ => /-?(\d+\.?\d*|\.\d+)([a-zA-Z%]+)?/,
    css_color: _ => /#[0-9a-fA-F]{3,8}/,
    css_url: _ => token(seq('url(', /[^)]*/, ')')),
    css_function: $ => seq(alias(token(prec(1, /[a-zA-Z-]+\(/)), $.css_function_name), optional($.css_value), ')'),
    css_rule: $ => seq($.css_selector, '{', repeat(choice($.css_declaration, $.css_rule, ';')), '}'),
    css_selector: _ => token(seq(choice(':', '&', /@ /, /@[a-z-]+/), /[^{};]*/)),

    // Utu, as tokens
    expression: $ => repeat1(choice($._expression_token, $.brace_group)),
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
    template_string: _ => token(seq('`', repeat(choice(/[^`\\]+/, /\\./)), '`')),
    operator: _ => choice('+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=',
      '&', '^', '~', '<<', '>>', '=>', '~>', '-o', '..<', '...', '&{'),

    // A DSL inside utu: `@name/\ … \/`, its text injected by name.
    dsl_expr: $ => seq('@', alias($.name, $.dsl_name), $.dsl_body),
    dsl_body: $ => seq($._dsl_open, optional(alias($._dsl_text, 'dsl_text')), $._dsl_close),
  },
});

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
