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
    match_lit: ($) =>
      choice($.int_lit, $.float_lit, alias('true', $.bool_lit), alias('false', $.bool_lit)),
    int_lit: (_) => token(choice(/[0-9]+/, /0x[0-9a-fA-F]+/, /0b[01]+/)),
    float_lit: (_) => token(/[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?/),
    string_lit: (_) => token(seq('"', /[^"\n]*/, '"')),
    jsgen_lit: (_) => token(seq('|', /[^|\n]*/, '|')),
    multiline_string_lit: ($) => prec.right(repeat1($.multiline_string_line)),
    multiline_string_line: (_) => token(/\\\\[^\n]*/),
  };
};
