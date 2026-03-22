module.exports = grammar({
  name: 'utu',

  word: $ => $.identifier,

  extras: $ => [
    /\s+/,
    $.comment,
  ],

  conflicts: $ => [
    // nullable_type ambiguity: T # could be nullable_type or _return_component with exclusive
    [$._type, $.nullable_type],
    // _return_component: optional '#' is ambiguous at reduce time
    [$._return_component],
    // pipe_target: path optionally followed by (pipe_args)
    [$.pipe_target],
    // return_type: comma separator ambiguous with multi-value vs end of return list
    [$.return_type],
    // ref.null T vs ref.<method>(args): both start with 'ref' '.'
    [$._builtin_ns, $.ref_null_expr],
  ],

  rules: {
    source_file: $ => repeat($._item),

    comment: $ => token(seq('//', /.*/)),

    // ==================== Top Level ====================

    _item: $ => choice(
      $.struct_decl,
      seq($.type_decl, ';'),
      $.fn_decl,
      seq($.global_decl, ';'),
      seq($.import_decl, ';'),
      seq($.jsgen_decl, ';'),
      $.export_decl,
      $.test_decl,
      $.bench_decl,
    ),

    // ==================== Declarations ====================

    struct_decl: $ => seq(
      'struct',
      $.type_ident,
      '{',
      optional($.field_list),
      '}',
    ),

    field_list: $ => seq(
      $.field,
      repeat(seq(',', $.field)),
      optional(','),
    ),

    field: $ => seq(
      optional('mut'),
      $.identifier,
      ':',
      $._type,
    ),

    type_decl: $ => seq(
      'type',
      $.type_ident,
      '=',
      $.variant_list,
    ),

    variant_list: $ => seq(
      optional('|'),
      $.variant,
      repeat(seq('|', $.variant)),
    ),

    variant: $ => seq(
      $.type_ident,
      optional(seq('{', optional($.field_list), '}')),
    ),

    fn_decl: $ => seq(
      'fun',
      $.identifier,
      '(',
      optional($.param_list),
      ')',
      $.return_type,
      $.block,
    ),

    param_list: $ => seq(
      $.param,
      repeat(seq(',', $.param)),
      optional(','),
    ),

    param: $ => seq($.identifier, ':', $._type),

    // return_type: either void or one or more comma-separated components,
    // each optionally with # error type
    return_type: $ => choice(
      $.void_type,
      seq(
        $._return_component,
        repeat(seq(',', $._return_component)),
      ),
    ),

    _return_component: $ => seq(
      $._type,
      optional(seq('#', $._type)),
    ),

    void_type: _ => 'void',

    global_decl: $ => seq(
      'let',
      $.identifier,
      ':',
      $._type,
      '=',
      $._expr,
    ),

    import_decl: $ => seq(
      'shimport',
      $.string_lit,
      choice(
        seq($.identifier, '(', optional($.import_param_list), ')', $.return_type),
        seq($.identifier, ':', $._type),
      ),
    ),

    jsgen_decl: $ => seq(
      'escape',
      $.jsgen_lit,
      $.identifier,
      '(',
      optional($.import_param_list),
      ')',
      $.return_type,
    ),

    import_param_list: $ => seq(
      $._import_param,
      repeat(seq(',', $._import_param)),
      optional(','),
    ),

    _import_param: $ => choice(
      $.param,
      $._type,
    ),

    export_decl: $ => seq(
      'export',
      $.fn_decl,
    ),

    test_decl: $ => seq(
      'test',
      $.string_lit,
      $.block,
    ),

    bench_decl: $ => seq(
      'bench',
      $.string_lit,
      $.bench_capture,
      '{',
      $.setup_decl,
      '}',
    ),

    bench_capture: $ => seq('|', $.identifier, '|'),

    setup_decl: $ => seq(
      'setup',
      '{',
      repeat(seq($._expr, ';')),
      $.measure_decl,
      '}',
    ),

    measure_decl: $ => seq('measure', $.block),

    // ==================== Types ====================

    _type: $ => choice(
      $.nullable_type,
      $._base_type,
    ),

    // T # null  — nullable reference
    nullable_type: $ => seq($._base_type, '#', 'null'),

    _base_type: $ => choice(
      $.scalar_type,
      $.ref_type,
      $.func_type,
      $.paren_type,
    ),

    scalar_type: $ => choice(
      'i32', 'u32', 'i64', 'u64',
      'f32', 'f64', 'v128', 'bool',
    ),

    ref_type: $ => choice(
      $.type_ident,
      'str',
      'externref',
      'anyref',
      'eqref',
      'i31',
      seq('array', '[', $._type, ']'),
    ),

    func_type: $ => seq(
      'fun',
      '(',
      optional($.type_list),
      ')',
      $.return_type,
    ),

    type_list: $ => seq(
      $._type,
      repeat(seq(',', $._type)),
    ),

    paren_type: $ => seq('(', $._type, ')'),

    // ==================== Expressions ====================

    // Precedence levels (higher number = tighter binding):
    //  13  postfix: . [] ()
    //  12  prefix:  ~ - not
    //  11  * / %
    //  10  + -
    //   9  << >> >>>
    //   8  &
    //   7  ^
    //   6  |
    //   5  == != < > <= >=
    //   4  and
    //   3  or
    //   2  \ (else/unwrap)
    //   1  -o (pipe)

    _expr: $ => choice(
      $.literal,
      $.identifier,
      $.tuple_expr,
      $.paren_expr,
      $.assert_expr,
      $.unary_expr,
      $.binary_expr,
      $.pipe_expr,
      $.else_expr,
      $.call_expr,
      $.field_expr,
      $.index_expr,
      $.namespace_call_expr,
      $.ref_null_expr,
      $.if_expr,
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

    paren_expr: $ => seq('(', $._expr, ')'),

    // --- Postfix (highest precedence) ---

    call_expr: $ => prec.left(13, seq(
      $._expr,
      '(',
      optional($.arg_list),
      ')',
    )),

    field_expr: $ => prec.left(13, seq(
      $._expr,
      '.',
      $.identifier,
    )),

    index_expr: $ => prec.left(13, seq(
      $._expr,
      '[',
      $._expr,
      ']',
    )),

    arg_list: $ => seq(
      $._expr,
      repeat(seq(',', $._expr)),
      optional(','),
    ),

    // --- Prefix ---

    assert_expr: $ => prec.right(-2, seq('assert', $._expr)),

    unary_expr: $ => prec(12, seq($.unary_op, $._expr)),

    unary_op: $ => choice('-', 'not', '~'),

    // --- Binary operators ---

    binary_expr: $ => choice(
      prec.left(11, seq($._expr, choice('*', '/', '%'), $._expr)),
      prec.left(10, seq($._expr, choice('+', '-'), $._expr)),
      prec.left(9,  seq($._expr, choice('<<', '>>', '>>>'), $._expr)),
      prec.left(8,  seq($._expr, '&', $._expr)),
      prec.left(7,  seq($._expr, '^', $._expr)),
      prec.left(6,  seq($._expr, '|', $._expr)),
      prec.left(5,  seq($._expr, choice('==', '!=', '<', '>', '<=', '>='), $._expr)),
      prec.left(4,  seq($._expr, 'and', $._expr)),
      prec.left(3,  seq($._expr, 'or', $._expr)),
    ),

    // --- Else / unwrap: expr \ fallback ---

    else_expr: $ => prec.left(2, seq($._expr, '\\', $._expr)),

    // --- Pipe: expr -o target ---

    pipe_expr: $ => prec.left(1, seq($._expr, '-o', $.pipe_target)),

    // pipe_target: identifier or dotted path (for builtins like str.concat)
    // optionally followed by (pipe_args)
    pipe_target: $ => choice(
      $._pipe_path,
      seq($._pipe_path, '(', $.pipe_args, ')'),
    ),

    // dotted path that may start with a type-namespace keyword
    _pipe_path: $ => prec.left(1, choice(
      $.identifier,
      alias($._builtin_ns, $.identifier),
      seq($._pipe_path, '.', $.identifier),
    )),

    // keywords used as namespace prefixes in builtin calls
    _builtin_ns: $ => choice(
      'str', 'array', 'i31',
      'ref', 'extern', 'any',
      'i32', 'i64', 'f32', 'f64',
    ),

    pipe_args: $ => choice(
      $.pipe_args_no_placeholder,
      $.pipe_args_with_placeholder,
    ),

    pipe_args_no_placeholder: $ => seq(
      alias($._expr, $.pipe_arg),
      repeat(seq(',', alias($._expr, $.pipe_arg))),
      optional(','),
    ),

    pipe_args_with_placeholder: $ => seq(
      optional(seq(
        alias($._expr, $.pipe_arg),
        repeat(seq(',', alias($._expr, $.pipe_arg))),
        ',',
      )),
      alias('_', $.pipe_arg_placeholder),
      optional(seq(
        ',',
        alias($._expr, $.pipe_arg),
        repeat(seq(',', alias($._expr, $.pipe_arg))),
      )),
      optional(','),
    ),

    // --- Multi-value comma expression (tensor product / tuple return) ---
    // Tuples are explicit and must be parenthesized.
    tuple_expr: $ => seq(
      '(',
      $._expr,
      ',',
      $._expr,
      repeat(seq(',', $._expr)),
      optional(','),
      ')',
    ),

    // --- Namespace-qualified call: str.method(args), array.len(arr), ref.is_null(v), etc. ---
    // Handles builtin keyword namespaces that can't appear as plain identifiers.
    namespace_call_expr: $ => prec.left(13, seq(
      $._builtin_ns,
      '.',
      $.identifier,
      optional(seq('(', optional($.arg_list), ')')),
    )),

    // --- ref.null T — null reference literal of a given type ---
    // Special form: T is a type_ident, not an expression argument.
    ref_null_expr: $ => seq('ref', '.', 'null', $.type_ident),

    // --- Assignment: lhs = rhs ---
    // lhs may be identifier (local), field_expr, or index_expr
    assign_expr: $ => prec.right(0, seq(
      choice($.identifier, $.field_expr, $.index_expr),
      '=',
      $._expr,
    )),

    // --- If expression ---

    if_expr: $ => prec.right(seq(
      'if',
      $._expr,
      $.block,
      optional(seq('else', choice($.if_expr, $.block))),
    )),

    // --- Scalar match expression ---

    match_expr: $ => seq(
      'match',
      $._expr,
      '{',
      repeat1($.match_arm),
      '}',
    ),

    // Arms:
    //   0 => expr,
    //   true => expr,
    //   _ => expr,
    match_arm: $ => seq(
      choice('_', $.match_lit),
      '=>',
      $._expr,
      ',',
    ),

    // --- Type / variant dispatch ---

    alt_expr: $ => seq(
      'alt',
      $._expr,
      '{',
      repeat1($.alt_arm),
      '}',
    ),

    // Arms:
    //   name: TypeName => expr,   (type cast binding)
    //   _: TypeName => expr,      (type test, discard)
    //   name => expr,             (catch-all with binding)
    //   _ => expr,                (wildcard)
    alt_arm: $ => choice(
      seq(choice('_', $.identifier), ':', $.type_ident, '=>', $._expr, ','),
      seq(choice('_', $.identifier), '=>', $._expr, ','),
    ),

    // --- For loop ---

    for_expr: $ => seq(
      'for',
      '(',
      $.for_sources,
      ')',
      optional($.capture),
      $.block,
    ),

    while_expr: $ => seq(
      'while',
      '(',
      optional($._expr),
      ')',
      $.block,
    ),

    for_sources: $ => seq(
      $.for_source,
      repeat(seq(',', $.for_source)),
    ),

    for_source: $ => prec(1, seq($._expr, '..', $._expr)),

    capture: $ => seq(
      '|',
      $.identifier,
      repeat(seq(',', $.identifier)),
      '|',
    ),

    // --- Block expression (optionally labeled) ---

    block_expr: $ => prec.right(seq(
      optional(seq($.identifier, ':')),
      $.block,
    )),

    // Plain block used inside if/for/fn/etc.
    block: $ => seq('{', repeat(seq($._expr, ';')), '}'),

    // --- Break / Emit ---

    break_expr: _ => 'break',

    emit_expr: $ => prec.right(seq('emit', $._expr)),

    // --- Let binding ---

    bind_expr: $ => seq(
      'let',
      $.bind_target,
      repeat(seq(',', $.bind_target)),
      '=',
      $._expr,
    ),

    bind_target: $ => seq($.identifier, ':', $._type),

    // --- Struct initializer: TypeName { field: expr, ... } ---

    struct_init: $ => seq(
      $.type_ident,
      '{',
      optional(seq(
        $.field_init,
        repeat(seq(',', $.field_init)),
        optional(','),
      )),
      '}',
    ),

    field_init: $ => seq($.identifier, ':', $._expr),

    // --- Array initializer: array[T].method(args) ---

    array_init: $ => seq(
      'array',
      '[',
      $._type,
      ']',
      '.',
      $.identifier,
      '(',
      optional($.arg_list),
      ')',
    ),

    // ==================== Literals ====================

    literal: $ => choice(
      $.int_lit,
      $.float_lit,
      $.string_lit,
      $.multiline_string_lit,
      'true',
      'false',
      'null',
    ),

    match_lit: $ => choice(
      $.int_lit,
      $.float_lit,
      alias('true', $.bool_lit),
      alias('false', $.bool_lit),
    ),

    // Integer literals: decimal, hex, binary
    int_lit: $ => token(choice(
      /[0-9]+/,
      /0x[0-9a-fA-F]+/,
      /0b[01]+/,
    )),

    // Float: must have digits on both sides of the decimal point
    float_lit: $ => token(/[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?/),

    string_lit: $ => token(seq('"', /[^"\n]*/, '"')),
    jsgen_lit: $ => token(seq('`', /[^`\n]*/, '`')),

    // Multi-line string: one or more lines each starting with \\
    multiline_string_lit: $ => prec.right(repeat1($.multiline_string_line)),
    multiline_string_line: $ => token(/\\\\[^\n]*/),

    // ==================== Identifiers ====================

    // Lower-case start: functions, variables, parameters
    identifier: $ => /[a-z_][a-zA-Z0-9_]*/,

    // Upper-case start: types, variants
    type_ident: $ => /[A-Z][a-zA-Z0-9]*/,
  },
});
