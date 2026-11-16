const { buildGrammarOptions } = require('./grammar/tokens.cjs');
const { buildTopLevelRules } = require('./grammar/rules/top-level.cjs');
const { buildDeclarationRules } = require('./grammar/rules/declarations.cjs');
const { buildTypeRules } = require('./grammar/rules/types.cjs');
const { buildExpressionRules } = require('./grammar/rules/expressions.cjs');
const { buildLiteralRules } = require('./grammar/rules/literals.cjs');
const { buildIdentifierRules } = require('./grammar/rules/identifiers.cjs');

const options = buildGrammarOptions();

module.exports = grammar({
  name: 'utu',
  word: options.word,
  // A DSL's envelope: `/\`, its text, and the balancing `\/` (src/scanner.c);
  // and the line end that ends `for … { … }` without its `;`.
  externals: $ => [$._dsl_open, $._dsl_text, $._dsl_close, $._statement_end, $._wutu_open, $._wutu_text, $._wutu_close],
  extras: options.extras,
  conflicts: options.conflicts,
  rules: {
    ...buildTopLevelRules(),
    ...buildDeclarationRules(),
    ...buildTypeRules(),
    ...buildExpressionRules(),
    ...buildLiteralRules(),
    ...buildIdentifierRules(),
  },
});
