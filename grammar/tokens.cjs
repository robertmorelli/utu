exports.buildGrammarOptions = function buildGrammarOptions() {
  return {
    word: ($) => $.identifier,
    extras: ($) => [/\s+/, $.comment],
    conflicts: ($) => [
      [$.pipe_target],
      [$.module_name, $._expr],
      [$.pipe_expr, $.bind_expr],
    ],
  };
};
