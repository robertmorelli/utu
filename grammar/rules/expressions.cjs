exports.buildExpressionRules = function buildExpressionRules() {
  return {
    _expr: ($) =>
      choice(
        $.literal,
        $.identifier,
        $.tuple_expr,
        $.array_expr,
        $.paren_expr,
        $.range_expr,
        $.assert_expr,
        $.unary_expr,
        $.binary_expr,
        $.pipe_expr,
        $.iterator_expr,
        $.else_expr,
        $.promoted_module_call_expr,
        $.type_member_expr,
        $.null_expr,
        $.field_expr,
        $.optional_field_expr,
        $.index_expr,
        $.slice_expr,
        $.call_expr,
        $.new_expr,
        $.if_expr,
        $.promote_expr,
        $.try_expr,
        $.match_expr,
        $.loop_match_expr,
        $.alt_expr,
        $.block_expr,
        $.for_expr,
        $.while_expr,
        $.break_expr,
        $.continue_expr,
        $.defer_expr,
        $.yield_expr,
        $.return_expr,
        $.bind_expr,
        $.struct_init,
        $.implicit_struct_init,
        $.assign_expr,
        $.closure_expr,
        $.await_expr,
        alias('fatal', $.fatal_expr),
        alias('prune', $.prune_expr),
        $.dsl_expr,
      ),

    // Pipelines bind below arithmetic, above assignment. Parameters are
    // parenthesized so a capture's | can never be parsed as bitwise-or.
    iterator_expr: ($) => prec.left(1, seq(
      field('source', $._expr),
      choice(
        seq(field('op', choice('map', 'filter', 'flat_map', 'skip_while', 'take_while', 'each', 'any', 'all', 'count_where', 'first_index', 'last_index')), $.capture, $.block),
        seq(field('op', choice('fold', 'scan')), '(', field('param', $._expr), ')', $.capture, $.block),
        seq(field('op', choice('skip', 'take', 'chain', 'repeat')), '(', field('param', $._expr), ')'),
        seq(field('op', 'zip'), '(', field('param', $._expr), ')', $.capture, $.block),
        seq(field('op', choice('sort', 'min_by', 'max_by', 'first_where', 'reduce', 'partition')),  '(', field('element', $._type), ')', $.capture, $.block),
        seq(field('op', 'collect'), '(', field('element', $._type), ')'),
        seq(field('op', choice('group_by', 'distinct_by')), '(', field('element', $._type), ',', field('key', $._type), ')', $.capture, $.block),
        seq(field('op', choice('batched', 'windows')), '(', field('element', $._type), ',', field('param', $._expr), ')'),
        seq(field('op', 'bisect'), $.capture, $.block),
        field('op', choice('sum', 'fast_sum', 'product', 'count')),
      ),
    )),

    // await p — suspend until the promise settles, then continue with its value.
    // Binds tighter than any binary operator so `await a + b` is `(await a) + b`,
    // matching JS.
    await_expr: ($) => prec.right(13, seq('await', $._expr)),

    // cl(x, y) { ... }         — parameter types come from the expectation
    // cl(x: I32) I32 { ... }   — annotated when there is no expectation to read
    //
    // The leading keyword is what keeps this unambiguous: `|…|` is already the
    // binder form for self-params, alt/promote arms, and `for` captures, and a
    // bare `|` is infix bitwise-or.  Captures are implicit, as in JS — scalars
    // are snapshot by value, GC references share the object.
    //
    // No return type means the next token after `)` is `{`, so one token of
    // lookahead separates "block" from "return type then block".
    closure_expr: ($) =>
      seq('cl', '(', optional($.closure_param_list), ')', optional($.return_type), $.block),
    closure_param_list: ($) =>
      seq($.closure_param, repeat(seq(',', $.closure_param)), optional(',')),
    closure_param: ($) => seq($.identifier, optional(seq(':', $._type))),

    paren_expr: ($) => seq('(', $._expr, ')'),

    // (a..<b), (a...b): the integers in a range, as an iterator source.
    range_expr: ($) => seq('(', field('start', $._expr), field('kind', choice('...', '..<')), field('end', $._expr), ')'),

    // [a, b, c] — a WasmGC array, or a JS array where a declaration expects one
    array_expr: ($) =>
      seq('[', optional(seq($._expr, repeat(seq(',', $._expr)), optional(','))), ']'),

    // .{a, b, c}
    tuple_expr: ($) =>
      seq('.', '{', $._expr, repeat(seq(',', $._expr)), optional(','), '}'),

    new_expr: ($) => prec.right(15, seq('new', $._expr, '(', optional($.arg_list), ')')),

    call_expr: ($) => prec.left(14, seq($._expr, '(', optional($.arg_list), ')')),

    // TypeIdent.method or Module[T].method
    type_member_expr: ($) =>
      prec.left(14, seq(
        choice($.instantiated_module_ref, $.inline_module_type_path, $.qualified_type_ref, $.type_ident),
        '.',
        choice($.identifier, $.type_ident),
      )),

    // T1.null — null reference for type T1
    null_expr: ($) => prec(15, seq($.type_ident, '.', 'null')),

    promoted_module_call_expr: ($) =>
      prec.left(15, seq(
        $.module_name, $.module_type_arg_list, '.', $.identifier, '(', optional($.arg_list), ')',
      )),

    field_expr: ($) => prec.left(14, seq($._expr, '.', choice($.identifier, $.type_ident))),
    // a?.b — only in statements: the statement runs when `a` is present
    optional_field_expr: ($) => prec.left(14, seq($._expr, '?.', choice($.identifier, $.type_ident))),

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

    global_member_expr: ($) => prec.left(14, seq($.type_ident, '.', choice($.identifier, $.type_ident))),

    assign_expr: ($) =>
      prec.right(0, seq(
        choice($.identifier, $.field_expr, $.optional_field_expr, $.index_expr, alias($.global_member_expr, $.type_member_expr)),
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

    // try { ... } catch |e| { ... } — catches exceptions thrown by the host
    try_expr: ($) => seq('try', $.block, 'catch', optional(seq('|', $.identifier, '|')), $.block),

    // match on scalars; ~> is the default arm
    match_expr: ($) => seq('match', $._expr, '{', repeat($.match_arm), optional($.match_default), '}'),
    match_arm: ($) => seq($.match_lit, '=>', $._expr, ','),
    match_default: ($) => seq('~>', $._expr, ','),
    // Zig-style switch loop: `continue v` re-dispatches on v, `break` leaves,
    // and an arm that finishes ends the loop. Lowers to loop + br_table.
    loop_match_expr: ($) => seq('loop', 'match', $._expr, '{', repeat($.match_arm), optional($.match_default), '}'),

    // alt on enum variants; ~> is the default arm
    alt_expr: ($) => seq('alt', $._expr, '{', repeat($.alt_arm), optional($.alt_default), '}'),
    alt_arm: ($) => seq(choice($.type_ident, $.qualified_type_ref), optional(seq('|', $.identifier, '|')), '=>', $._expr, ','),
    alt_default: ($) => seq('~>', $._expr, ','),

    for_expr: ($) => seq('for', '(', $.for_sources, ')', optional($.capture), $.block),
    while_expr: ($) => seq('while', '(', optional($._expr), ')', $.block),
    for_sources: ($) => seq($.for_source, repeat(seq(',', $.for_source))),
    // `a..<b` / `a...b` count; a lone expression iterates an array's elements.
    for_source: ($) => prec(1, seq($._expr, optional(seq(choice('...', '..<'), $._expr)))),
    capture: ($) => seq('|', $.identifier, repeat(seq(',', $.identifier)), '|'),

    block_expr: ($) => prec.right(seq(optional(seq($.identifier, ':')), $.block)),
    block: ($) => seq('{', repeat(seq($._expr, ';')), '}'),

    break_expr: (_) => 'break',
    continue_expr: ($) => prec.right(seq('continue', optional($._expr))),
    // defer expr — run when the enclosing block exits (end, return, break, continue).
    defer_expr: ($) => prec.right(seq('defer', $._expr)),
    yield_expr: ($) => prec.right(seq('yield', $._expr)),
    return_expr: ($) => prec.right(seq('return', optional($._expr))),

    bind_expr: ($) => choice(
      seq('let', $.identifier, optional(seq(':', $._type)), '=', $._expr),
      // let .{node, ty} = f(); takes a tuple apart.
      seq('let', $.tuple_pattern, '=', $._expr),
    ),
    tuple_pattern: ($) => seq('.', '{', $.identifier, repeat(seq(',', $.identifier)), optional(','), '}'),

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
  };
};
