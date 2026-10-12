exports.buildLiteralRules = function buildLiteralRules() {
  return {
    literal: ($) =>
      choice(
        $.int_lit,
        $.float_lit,
        $.string_lit,
        $.multiline_string_lit,
        'true',
        'false',
        'null',
      ),
    // Numeric patterns may be negative: `match delta { -1 => ..., 1 => ... }`.
    match_lit: ($) =>
      choice(
        seq(optional('-'), $.int_lit),
        seq(optional('-'), $.float_lit),
        alias('true', $.bool_lit),
        alias('false', $.bool_lit),
        // An integer enum's variant: `Tag.Leaf`.
        seq($.type_ident, '.', $.type_ident),
      ),
    int_lit: (_) => token(choice(/[0-9]+/, /0x[0-9a-fA-F]+/, /0b[01]+/)),
    float_lit: (_) => token(/[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?/),
    // Backslash escapes as in JSON (\" \\ \n \t \uXXXX …); literals decode with JSON's rules.
    string_lit: (_) => token(seq('"', repeat(choice(/[^"\\\n]/, /\\[^\n]/)), '"')),
    jsgen_lit: (_) => token(seq('|', /[^|\n]*/, '|')),
    multiline_string_lit: ($) => prec.right(repeat1($.multiline_string_line)),
    multiline_string_line: (_) => token(/\\\\[^\n]*/),
  };
};
