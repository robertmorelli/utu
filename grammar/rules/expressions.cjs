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
        $.field_expr,
        $.index_expr,
        $.call_expr,
        $.namespace_call_expr,
        $.ref_null_expr,
        $.if_expr,
        $.promote_expr,
        $.match_expr,
        $.alt_expr,
        $.block_expr,
        $.for_expr,
        $.while_expr,
        $.break_expr,
        $.emit_expr,
        $.bind_expr,
        $.struct_init,
        $.array_init,
        $.assign_expr,
        alias('fatal', $.fatal_expr),
      ),
    paren_expr: ($) => seq('(', $._expr, ')'),
    call_expr: ($) => prec.left(14, seq($._expr, '(', optional($.arg_list), ')')),
    type_member_expr: ($) =>
      prec.left(
        14,
        seq(
          choice($.instantiated_module_ref, $.inline_module_type_path, $.qualified_type_ref, $.type_ident),
          '.',
          $.identifier,
        ),
      ),
    promoted_module_call_expr: ($) =>
      prec.left(
        15,
        seq($.module_name, $.module_type_arg_list, '.', $.identifier, '(', optional($.arg_list), ')'),
      ),
    field_expr: ($) => prec.left(14, seq($._expr, '.', $.identifier)),
    index_expr: ($) => prec.left(14, seq($._expr, '[', $._expr, ']')),
    arg_list: ($) => seq($._expr, repeat(seq(',', $._expr)), optional(',')),
    assert_expr: ($) => prec.right(-2, seq('assert', $._expr)),
    unary_expr: ($) => prec.right(13, seq($.unary_op, $._expr)),
    unary_op: (_) => choice('-', 'not', '~'),
    binary_expr: ($) =>
      choice(
        prec.right(12, seq($._expr, '^', $._expr)),
        prec.left(11, seq($._expr, choice('*', '/', '%'), $._expr)),
        prec.left(10, seq($._expr, choice('+', '-'), $._expr)),
        prec.left(9, seq($._expr, choice('<<', '>>', '>>>'), $._expr)),
        prec.left(8, seq($._expr, '&', $._expr)),
        prec.left(6, seq($._expr, '|', $._expr)),
        prec.left(5, seq($._expr, choice('==', '!=', '<', '>', '<=', '>='), $._expr)),
        prec.left(4, seq($._expr, 'and', $._expr)),
        prec.left(3, seq($._expr, 'or', $._expr)),
      ),
    else_expr: ($) => prec.left(2, seq($._expr, '\\', $._expr)),
    pipe_expr: ($) => prec.left(1, seq($._expr, '-o', $.pipe_target)),
    pipe_target: ($) => choice($._pipe_path, seq($._pipe_path, '(', $.pipe_args, ')')),
    _pipe_path: ($) =>
      prec.left(
        1,
        seq(
          choice(alias($._builtin_ns, $.identifier), $.instantiated_module_ref, $.identifier, $.type_ident),
          repeat(seq('.', choice($.identifier, $.type_ident))),
        ),
      ),
    _builtin_ns: (_) =>
      choice('str', 'array', 'i31', 'ref', 'extern', 'any', 'i32', 'i64', 'f32', 'f64'),
    pipe_args: ($) => choice($.pipe_args_no_placeholder, $.pipe_args_with_placeholder),
    pipe_args_no_placeholder: ($) =>
      seq(alias($._expr, $.pipe_arg), repeat(seq(',', alias($._expr, $.pipe_arg))), optional(',')),
    pipe_args_with_placeholder: ($) =>
      seq(
        optional(
          seq(alias($._expr, $.pipe_arg), repeat(seq(',', alias($._expr, $.pipe_arg))), ','),
        ),
        alias('_', $.pipe_arg_placeholder),
        optional(
          seq(',', alias($._expr, $.pipe_arg), repeat(seq(',', alias($._expr, $.pipe_arg)))),
        ),
        optional(','),
      ),
    tuple_expr: ($) => seq('(', $._expr, ',', $._expr, repeat(seq(',', $._expr)), optional(','), ')'),
    namespace_call_expr: ($) =>
      prec.left(13, seq($._builtin_ns, '.', $.identifier, optional(seq('(', optional($.arg_list), ')')))),
    ref_null_expr: ($) => seq('ref', '.', 'null', choice($.type_ident, $.qualified_type_ref)),
    assign_expr: ($) =>
      prec.right(
        0,
        seq(
          choice($.identifier, $.field_expr, $.index_expr),
          choice('=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', 'and=', 'or='),
          $._expr,
        ),
      ),
    if_expr: ($) =>
      prec.right(seq('if', $._expr, $.block, optional(seq('else', choice($.if_expr, $.block))))),
    promote_expr: ($) =>
      seq('promote', $._expr, $.promote_capture, $.block, optional(seq('else', $.block))),
    promote_capture: ($) => seq('|', $.identifier, '|'),
    match_expr: ($) => seq('match', $._expr, '{', repeat1($.match_arm), '}'),
    match_arm: ($) => seq(choice('_', $.match_lit), '=>', $._expr, ','),
    alt_expr: ($) => seq('alt', $._expr, '{', repeat1($.alt_arm), '}'),
    alt_arm: ($) =>
      choice(
        seq(choice('_', $.identifier), ':', $.type_ident, '=>', $._expr, ','),
        seq(choice('_', $.identifier), '=>', $._expr, ','),
      ),
    for_expr: ($) => seq('for', '(', $.for_sources, ')', optional($.capture), $.block),
    while_expr: ($) => seq('while', '(', optional($._expr), ')', $.block),
    for_sources: ($) => seq($.for_source, repeat(seq(',', $.for_source))),
    for_source: ($) => prec(1, seq($._expr, choice('...', '..<'), $._expr)),
    capture: ($) => seq('|', $.identifier, repeat(seq(',', $.identifier)), '|'),
    block_expr: ($) => prec.right(seq(optional(seq($.identifier, ':')), $.block)),
    block: ($) => seq('{', repeat(seq($._expr, ';')), '}'),
    break_expr: (_) => 'break',
    emit_expr: ($) => prec.right(seq('emit', $._expr)),
    bind_expr: ($) => seq('let', $.bind_target, repeat(seq(',', $.bind_target)), '=', $._expr),
    bind_target: ($) => seq($.identifier, ':', $._type),
    struct_init: ($) =>
      seq(
        choice($.type_ident, $.qualified_type_ref),
        '{',
        optional(seq($.field_init, repeat(seq(',', $.field_init)), optional(','))),
        '}',
      ),
    field_init: ($) => seq($.identifier, ':', $._expr),
    array_init: ($) => seq('array', '[', $._type, ']', '.', $.identifier, '(', optional($.arg_list), ')'),
  };
};
