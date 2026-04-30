exports.buildExpressionRules = function buildExpressionRules() {
  return {
    _expr: ($) =>
      choice(
        $.literal,
        $.identifier,
        $.tuple_expr,
        $.paren_expr,
        $.assert_expr,
        $.unary_expr,
        $.binary_expr,
        $.pipe_expr,
        $.else_expr,
        $.promoted_module_call_expr,
        $.type_member_expr,
        $.null_expr,
        $.field_expr,
        $.index_expr,
        $.slice_expr,
        $.call_expr,
        $.if_expr,
        $.promote_expr,
        $.match_expr,
        $.alt_expr,
        $.block_expr,
        $.for_expr,
        $.while_expr,
        $.break_expr,
        $.return_expr,
        $.bind_expr,
        $.struct_init,
        $.implicit_struct_init,
        $.assign_expr,
        alias('fatal', $.fatal_expr),
        $.dsl_expr,
      ),

    paren_expr: ($) => seq('(', $._expr, ')'),

    // .{a, b, c}
    tuple_expr: ($) =>
      seq('.', '{', $._expr, repeat(seq(',', $._expr)), optional(','), '}'),

    call_expr: ($) => prec.left(14, seq($._expr, '(', optional($.arg_list), ')')),

    // TypeIdent.method or Module[T].method
    type_member_expr: ($) =>
      prec.left(14, seq(
        choice($.instantiated_module_ref, $.inline_module_type_path, $.qualified_type_ref, $.type_ident),
        '.',
        $.identifier,
      )),

    // T1.null — null reference for type T1
    null_expr: ($) => prec(15, seq($.type_ident, '.', 'null')),

    promoted_module_call_expr: ($) =>
      prec.left(15, seq(
        $.module_name, $.module_type_arg_list, '.', $.identifier, '(', optional($.arg_list), ')',
      )),

    field_expr: ($) => prec.left(14, seq($._expr, '.', $.identifier)),

    // a[i]
    index_expr: ($) => prec.left(14, seq($._expr, '[', $._expr, ']')),

    // a[start, end] — slice for str and array
    slice_expr: ($) => prec.left(14, seq($._expr, '[', $._expr, ',', $._expr, ']')),

    arg_list: ($) => seq($._expr, repeat(seq(',', $._expr)), optional(',')),

    assert_expr: ($) => prec.right(-2, seq('assert', $._expr)),

    unary_expr: ($) => prec.right(13, seq($.unary_op, $._expr)),
    unary_op: (_) => choice('-', 'not', '~'),

    // Precedence (high to low): ^ · * / % · + - · << >> >>> · & · | · == != < > <= >= · and · xor · or
    binary_expr: ($) =>
      choice(
        prec.right(12, seq($._expr, '^',                                       $._expr)),
        prec.left(11,  seq($._expr, choice('*', '/', '%'),                     $._expr)),
        prec.left(10,  seq($._expr, choice('+', '-'),                          $._expr)),
        prec.left(9,   seq($._expr, choice('<<', '>>', '>>>'),                 $._expr)),
        prec.left(8,   seq($._expr, '&',                                       $._expr)),
        prec.left(6,   seq($._expr, '|',                                       $._expr)),
        prec.left(5,   seq($._expr, choice('==', '!=', '<', '>', '<=', '>='), $._expr)),
        prec.left(4,   seq($._expr, 'and',                                     $._expr)),
        prec.left(3,   seq($._expr, 'xor',                                     $._expr)),
        prec.left(2,   seq($._expr, 'or',                                      $._expr)),
      ),

    // null fallback — `expr orelse default` (was `\` in v1; see the_future.md
    // "replace `\` with `orelse`")
    else_expr: ($) => prec.left(1, seq($._expr, 'orelse', $._expr)),

    // pipe
    pipe_expr: ($) => prec.left(0, seq($._expr, '-o', $.pipe_target)),
    pipe_target: ($) => choice($._pipe_path, seq($._pipe_path, '(', $.pipe_args, ')')),
    _pipe_path: ($) =>
      prec.left(15, seq(
        choice($.instantiated_module_ref, $.identifier, $.type_ident),
        repeat(seq('.', choice($.identifier, $.type_ident))),
      )),
    pipe_args: ($) => choice($.pipe_args_no_placeholder, $.pipe_args_with_placeholder),
    pipe_args_no_placeholder: ($) =>
      seq(alias($._expr, $.pipe_arg), repeat(seq(',', alias($._expr, $.pipe_arg))), optional(',')),
    // & is the pipe placeholder: foo(&, extra)
    pipe_arg_placeholder: ($) => $.promoted_type,
    pipe_args_with_placeholder: ($) =>
      seq(
        optional(seq(alias($._expr, $.pipe_arg), repeat(seq(',', alias($._expr, $.pipe_arg))), ',')),
        $.pipe_arg_placeholder,
        optional(seq(',', alias($._expr, $.pipe_arg), repeat(seq(',', alias($._expr, $.pipe_arg))))),
        optional(','),
      ),

    assign_expr: ($) =>
      prec.right(0, seq(
        choice($.identifier, $.field_expr, $.index_expr),
        choice('=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', 'and=', 'or=', 'xor='),
        $._expr,
      )),

    if_expr: ($) =>
      prec.right(seq('if', $._expr, $.block, optional(seq('else', choice($.if_expr, $.block))))),

    // promote expr { |x| => expr, ~> fallback, }
    promote_expr: ($) =>
      seq(
        'promote',
        $._expr,
        '{',
        seq('|', $.identifier, '|', '=>', $._expr, ','),
        optional(seq('~>', $._expr, ',')),
        '}',
      ),

    // match on scalars; ~> is the default arm
    match_expr: ($) => seq('match', $._expr, '{', repeat($.match_arm), optional($.match_default), '}'),
    match_arm: ($) => seq($.match_lit, '=>', $._expr, ','),
    match_default: ($) => seq('~>', $._expr, ','),

    // alt on enum variants; ~> is the default arm
    alt_expr: ($) => seq('alt', $._expr, '{', repeat($.alt_arm), optional($.alt_default), '}'),
    alt_arm: ($) => seq($.type_ident, optional(seq('|', $.identifier, '|')), '=>', $._expr, ','),
    alt_default: ($) => seq('~>', $._expr, ','),

    for_expr: ($) => seq('for', '(', $.for_sources, ')', optional($.capture), $.block),
    while_expr: ($) => seq('while', '(', optional($._expr), ')', $.block),
    for_sources: ($) => seq($.for_source, repeat(seq(',', $.for_source))),
    for_source: ($) => prec(1, seq($._expr, choice('...', '..<'), $._expr)),
    capture: ($) => seq('|', $.identifier, repeat(seq(',', $.identifier)), '|'),

    block_expr: ($) => prec.right(seq(optional(seq($.identifier, ':')), $.block)),
    block: ($) => seq('{', repeat(seq($._expr, ';')), '}'),

    break_expr: (_) => 'break',
    return_expr: ($) => prec.right(seq('return', optional($._expr))),

    bind_expr: ($) => seq('let', $.identifier, ':', $._type, '=', $._expr),

    // Explicit struct init: T1 { field: expr, ... }
    struct_init: ($) =>
      seq(
        choice($.type_ident, $.qualified_type_ref),
        '{',
        optional(seq($.field_init, repeat(seq(',', $.field_init)), optional(','))),
        '}',
      ),
    // Implicit struct init (type inferred from &): &{ field: expr, ... }
    implicit_struct_init: ($) =>
      seq(
        $.promoted_type,
        '{',
        optional(seq($.field_init, repeat(seq(',', $.field_init)), optional(','))),
        '}',
      ),
    field_init: ($) => seq($.identifier, ':', $._expr),

    // DSL escape: @name/\ raw body \/
    dsl_expr: ($) => seq('@', $.identifier, $.dsl_body),
    dsl_body: (_) => token(seq('/\\', /([^\\]|\\[^\/])*/, '\\/')),
  };
};
