exports.buildTopLevelRules = function buildTopLevelRules() {
  return {
    source_file: ($) => repeat($._item),
    comment: ($) => token(seq('//', /.*/)),
    _item: ($) =>
      choice(
        $.module_decl,
        seq($.using_decl, $._end),
        $.struct_decl,
        $.proto_decl,
        $.enum_decl,
        $.fn_decl,
        $.op_decl,
        seq($.global_decl, $._end),
        seq($.mem_decl, $._end),
        seq($.distinct_decl, $._end),
        $.export_lib_decl,
        $.export_main_decl,
        $.export_html_decl,
        $.test_decl,
        $.bench_decl,
      ),
    _library_item: ($) =>
      $.fn_decl,
    _module_item: ($) =>
      choice(
        $.type_decl,
        $.struct_decl,
        $.proto_decl,
        $.enum_decl,
        $.fn_decl,
        $.op_decl,
        seq($.global_decl, $._end),
        $.test_decl,
        $.bench_decl,
      ),
  };
};
