exports.buildTopLevelRules = function buildTopLevelRules() {
  return {
    source_file: ($) => repeat($._item),
    comment: ($) => token(seq('//', /.*/)),
    _item: ($) =>
      choice(
        $.module_decl,
        seq($.construct_decl, ';'),
        $.struct_decl,
        seq($.proto_decl, ';'),
        seq($.type_decl, ';'),
        $.fn_decl,
        seq($.global_decl, ';'),
        seq($.import_decl, ';'),
        seq($.jsgen_decl, ';'),
        $.export_decl,
        $.test_decl,
        $.bench_decl,
      ),
    _module_item: ($) =>
      choice(
        $.module_decl,
        seq($.construct_decl, ';'),
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
  };
};
