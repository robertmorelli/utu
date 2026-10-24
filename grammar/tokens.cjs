exports.buildGrammarOptions = function buildGrammarOptions() {
  return {
    word: ($) => $.identifier,
    extras: ($) => [/\s+/, $.comment],
    conflicts: ($) => [
      [$.pipe_target],
      [$.module_name, $._expr],
      [$.module_name, $._capital_module_name, $._type_head],
      [$.pipe_expr, $.bind_expr],
    ],
  };
};
