exports.buildTypeRules = function buildTypeRules() {
  const typeName = ($) => choice($.type_ident, alias($.identifier, $.type_ident));

  return {
    _type: ($) => choice($.nullable_type, $._base_type),
    nullable_type: ($) => seq('?', $._base_type),
    _base_type: ($) => choice($.ref_type, $.func_type, $.closure_type, $.paren_type, $.promoted_type),
    ref_type: ($) =>
      choice(
        typeName($),
        $.qualified_type_ref,
        $.instantiated_module_ref,
      ),
    qualified_type_ref: ($) =>
      choice(
        seq($.module_ref, '.', typeName($)),
        seq($.instantiated_module_ref, '.', typeName($)),
      ),
    // fun(...) — function pointer.  Has no environment and cannot be written
    // inline; a `fun` value is produced by naming a declared `fn`, or by an
    // @es import declaration.
    func_type: ($) => seq('fun', '(', optional($.type_list), ')', $.return_type),
    // cl(...) — closure.  Always an externref to a JS function so that any
    // closure can be handed to any JS callback with no marshalling.  Written
    // inline as `cl(x) { ... }`; see closure_expr.  A `fun` decays to a `cl`
    // implicitly (the only two coercions in the language are this and nullable
    // widening).
    closure_type: ($) => seq('cl', '(', optional($.type_list), ')', $.return_type),
    paren_type: ($) => seq('(', $._type, ')'),
  };
};
