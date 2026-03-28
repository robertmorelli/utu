exports.buildIdentifierRules = function buildIdentifierRules() {
  return {
    identifier: (_) => /[a-z_][a-zA-Z0-9_]*/,
    type_ident: (_) => /[A-Z][a-zA-Z0-9]*/,
  };
};
