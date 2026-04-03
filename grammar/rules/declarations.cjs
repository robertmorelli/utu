exports.buildDeclarationRules = function buildDeclarationRules() {
  return {
    module_decl: ($) =>
      seq('mod', $.module_name, optional($.module_type_param_list), '{', repeat($._module_item), '}'),
    module_name: ($) => choice($.identifier, $.type_ident),
    module_type_param_list: ($) =>
      seq('[', $.type_ident, repeat(seq(',', $.type_ident)), optional(','), ']'),
    construct_decl: ($) =>
      seq(
        'construct',
        choice(
          seq($.identifier, '=', choice($.instantiated_module_ref, $.module_ref)),
          choice($.instantiated_module_ref, $.module_ref),
        ),
      ),
    module_ref: ($) => $.module_name,
    instantiated_module_ref: ($) => prec(2, seq($.module_name, $.module_type_arg_list)),
    module_type_arg_list: ($) => seq('[', $._type, repeat(seq(',', $._type)), optional(','), ']'),
    inline_module_type_path: ($) =>
      prec(3, seq($.module_name, $.module_type_arg_list, '.', $.type_ident)),
    struct_decl: ($) =>
      seq(
        optional('rec'),
        optional('tag'),
        'struct',
        $.type_ident,
        optional(seq(':', $.protocol_list)),
        '{',
        optional($.field_list),
        '}',
        optional(';'),
      ),
    proto_decl: ($) =>
      seq('proto', $.type_ident, optional($.module_type_param_list), '{', optional($.proto_member_list), '}'),
    proto_member_list: ($) => seq($.proto_member, repeat(seq(',', $.proto_member)), optional(',')),
    proto_member: ($) => choice($.proto_method, $.proto_getter, $.proto_setter),
    proto_method: ($) => seq($.identifier, '(', optional($.type_list), ')', $.return_type),
    proto_getter: ($) => seq('get', $.identifier, ':', $._type),
    proto_setter: ($) => seq('set', $.identifier, ':', $._type),
    field_list: ($) => seq($.field, repeat(seq(',', $.field)), optional(',')),
    field: ($) => seq(optional('mut'), $.identifier, ':', $._type),
    protocol_list: ($) => seq($.type_ident, repeat(seq(',', $.type_ident))),
    type_decl: ($) =>
      seq(optional('tag'), 'type', $.type_ident, optional(seq(':', $.protocol_list)), '=', $.variant_list),
    variant_list: ($) => seq(optional('|'), $.variant, repeat(seq('|', $.variant))),
    variant: ($) => seq($.type_ident, optional(seq('{', optional($.field_list), '}'))),
    fn_decl: ($) =>
      seq('fun', choice($.identifier, $.associated_fn_name), '(', optional($.param_list), ')', $.return_type, $.block),
    associated_fn_name: ($) => seq($.type_ident, '.', $.identifier),
    param_list: ($) => seq($.param, repeat(seq(',', $.param)), optional(',')),
    param: ($) => seq($.identifier, ':', $._type),
    return_type: ($) =>
      choice($.void_type, seq($._return_component, repeat(seq(',', $._return_component)))),
    _return_component: ($) => seq($._type, optional(seq('#', $._type))),
    void_type: (_) => 'void',
    global_decl: ($) => seq('let', $.identifier, ':', $._type, '=', $._expr),
    file_import_decl: ($) =>
      seq(
        'import',
        $.imported_module_name,
        optional($.captured_module_name),
        'from',
        $.string_lit,
      ),
    imported_module_name: ($) => $.module_name,
    captured_module_name: ($) => seq('|', $.module_name, '|'),
    jsgen_decl: ($) =>
      seq(
        'escape',
        $.jsgen_lit,
        choice(
          seq($.identifier, '(', optional($.import_param_list), ')', $.return_type),
          seq($.identifier, ':', $._type),
        ),
      ),
    import_param_list: ($) => seq($._import_param, repeat(seq(',', $._import_param)), optional(',')),
    _import_param: ($) => choice($.param, $._type),
    library_decl: ($) => seq('library', '{', repeat($._library_item), '}'),
    test_decl: ($) => seq('test', $.string_lit, $.block),
    bench_decl: ($) => seq('bench', $.string_lit, '{', $.setup_decl, '}'),
    setup_decl: ($) => seq('setup', '{', repeat(seq($._expr, ';')), $.measure_decl, '}'),
    measure_decl: ($) => seq('measure', $.block),
  };
};
