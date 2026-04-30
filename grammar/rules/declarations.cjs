exports.buildDeclarationRules = function buildDeclarationRules() {
  return {
    // Nominal qualifier: bare `tag`, `rec`, or `tag rec` prefix on struct/enum.
    // (Prior surface was `nom[tag, rec]`; flattened per the_future.md "use simpler
    // surface syntax for the common cases".)  IR shape unchanged: ir-nom-qualifier
    // with a `tags` attribute listing the markers in source order.
    nom_qualifier: ($) => repeat1($.nom_tag),
    nom_tag: (_) => choice('tag', 'rec'),

    // & refers to the promoted type inside a module body
    promoted_type: (_) => '&',

    // Modules
    module_decl: ($) =>
      seq('mod', $.module_name, optional($.module_type_param_list), '{', repeat($._module_item), '}'),
    module_name: ($) => choice($.identifier, $.type_ident),
    module_type_param_list: ($) =>
      seq('[', $.module_type_param, repeat(seq(',', $.module_type_param)), optional(','), ']'),
    module_type_param: ($) => seq(optional(choice('in', 'out')), $.type_ident),
    module_ref: ($) => $.module_name,
    instantiated_module_ref: ($) => prec(2, seq($.module_name, $.module_type_arg_list)),
    module_type_arg_list: ($) => seq('[', $._type, repeat(seq(',', $._type)), optional(','), ']'),
    inline_module_type_path: ($) =>
      prec(3, seq($.module_name, $.module_type_arg_list, '.', $.type_ident)),

    // Protocol/type implementation list: [P1, P2], [&], or []
    impl_list: ($) =>
      seq(
        '[',
        optional(seq(
          choice($.type_ident, $.promoted_type),
          repeat(seq(',', choice($.type_ident, $.promoted_type))),
          optional(','),
        )),
        ']',
      ),

    // Structs: nom? struct (TypeIdent | &) impl_list? : | field ...
    struct_decl: ($) =>
      seq(
        optional($.nom_qualifier),
        'struct',
        choice($.type_ident, $.promoted_type),
        optional($.impl_list),
        ':',
        repeat(seq('|', $.field)),
      ),
    field: ($) => seq($.identifier, ':', $._type),
    field_list: ($) => seq($.field, repeat(seq(',', $.field)), optional(',')),

    // Protocols: proto (TypeIdent | &) : | member ...
    proto_decl: ($) =>
      seq(
        'proto',
        choice($.type_ident, $.promoted_type),
        ':',
        repeat(seq('|', $.proto_member)),
      ),
    proto_member: ($) => choice($.proto_get_setter, $.proto_getter, $.proto_setter, $.proto_method),
    proto_getter: ($) => seq('get', $.identifier, ':', $._type),
    proto_setter: ($) => seq('set', $.identifier, ':', $._type),
    proto_get_setter: ($) => seq('get', 'set', $.identifier, ':', $._type),
    proto_method: ($) => seq($.identifier, '(', optional($.type_list), ')', $.return_type),

    // Enums (replaces type): nom? enum (TypeIdent | &) impl_list? : | Variant { fields }? ...
    enum_decl: ($) =>
      seq(
        optional($.nom_qualifier),
        'enum',
        choice($.type_ident, $.promoted_type),
        optional($.impl_list),
        ':',
        repeat(seq('|', $.variant)),
      ),
    variant: ($) => seq($.type_ident, optional(seq('{', optional($.field_list), '}'))),

    // Functions: fn name self? ( params? ) return_type block
    fn_decl: ($) =>
      seq('fn', $.fn_name, optional($.self_param), '(', optional($.param_list), ')', $.return_type, $.block),
    fn_name: ($) =>
      choice(
        $.identifier,
        seq(
          choice($.type_ident, $.promoted_type),
          optional($.module_type_arg_list),
          '.',
          $.identifier,
        ),
      ),
    self_param: ($) => seq('|', $.identifier, '|'),
    param_list: ($) => seq($.param, repeat(seq(',', $.param)), optional(',')),
    param: ($) => seq($.identifier, ':', $._type),
    return_type: ($) => choice($.void_type, $._type),
    void_type: (_) => 'void',
    type_list: ($) => seq($._type, repeat(seq(',', $._type))),

    // Global constant
    global_decl: ($) => seq('let', $.identifier, ':', $._type, '=', $._expr),

    // Using: cross-file imports and within-file aliases
    using_decl: ($) =>
      seq(
        'using',
        $.module_name,
        optional($.module_type_arg_list),
        optional($.captured_module_name),
        optional(seq('from', $._from_path)),
      ),
    captured_module_name: ($) => seq('|', $.module_name, '|'),

    // Import path: either a quoted string or a platform:module URI token.
    // platform_path is a single atomic token (no internal whitespace) so it
    // cannot be confused with the ':' used in type annotations.
    // Examples: std:array, node:fs, browser:dom, vscode_dev:workspace
    _from_path: ($) => choice($.string_lit, $.platform_path),
    platform_path: (_) => /[a-z][a-zA-Z0-9_]*:[a-z][a-zA-Z0-9_]*/,

    // Operator overload: fn TypeIdent:opName |a, b| ReturnType { ... }
    // Unary:  fn TypeIdent:neg |a|    ReturnType { ... }
    // Binary: fn TypeIdent:add |a, b| ReturnType { ... }
    op_decl: ($) =>
      seq('fn', $.type_ident, ':', $.identifier, $.capture, $.return_type, $.block),

    // Wasm-native type binding: type (TypeIdent | &) = @dsl/\ ... \/
    // Used to declare that the promoted type maps to a wasm intrinsic
    // (e.g. wasm array, externref, i31) rather than a utu struct or enum.
    type_decl: ($) => seq('type', choice($.type_ident, $.promoted_type), '=', $.dsl_expr),

    // Export forms
    export_lib_decl: ($) => seq('export', 'lib', '{', repeat($._library_item), '}'),
    export_main_decl: ($) =>
      seq('export', 'main', '(', optional($.param_list), ')', $.return_type, $.block),

    // Tests and benchmarks
    test_decl: ($) => seq('test', $.string_lit, $.block),
    bench_decl: ($) =>
      seq('bench', $.string_lit, '{', repeat(seq($._expr, ';')), $.measure_decl, '}'),
    measure_decl: ($) => seq('measure', $.block),
  };
};
