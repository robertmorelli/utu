exports.buildGrammarOptions = function buildGrammarOptions() {
  return {
    word: ($) => $.identifier,
    extras: ($) => [/\s+/, $.comment],
    conflicts: ($) => [
      [$.pipe_target],
      [$.module_name, $._expr],
      [$.module_name, $._capital_module_name, $._type_head],
      [$.qualified_type_ref, $._variant_type_ref],
      // `for (xs) |x| { … }`: its block, not a statement that is a block.
      [$.for_expr, $.block_expr],
    ],
  };
};
