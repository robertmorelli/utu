exports.buildTypeRules = function buildTypeRules() {
  return {
    _type: ($) => choice($.nullable_type, $._base_type),
    nullable_type: ($) => seq('?', $._base_type),
    _base_type: ($) => choice($.scalar_type, $.ref_type, $.func_type, $.paren_type, $.promoted_type),
    scalar_type: (_) =>
      choice('i32', 'u32', 'i64', 'u64', 'm32', 'm64', 'm128', 'f32', 'f64', 'v128', 'bool'),
    ref_type: ($) =>
      choice(
        $.type_ident,
        $.qualified_type_ref,
        $.instantiated_module_ref,
        'str',
        'externref',
        'i31',
      ),
    qualified_type_ref: ($) =>
      choice(
        seq($.module_ref, '.', $.type_ident),
        seq($.instantiated_module_ref, '.', $.type_ident),
      ),
    // fun(...) is only valid in escape/import declarations, not general function types
    func_type: ($) => seq('fun', '(', optional($.type_list), ')', $.return_type),
    paren_type: ($) => seq('(', $._type, ')'),
  };
};
