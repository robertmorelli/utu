exports.buildGrammarOptions = function buildGrammarOptions() {
  return {
    word: ($) => $.identifier,
    extras: ($) => [/\s+/, $.comment],
    conflicts: ($) => [
      [$._return_component],
      [$.pipe_target],
      [$.return_type],
      [$._builtin_ns, $.ref_null_expr],
      [$.module_name, $._expr],
      [$.module_name, $.ref_null_expr],
      [$._expr, $.promote_capture],
    ],
  };
};
