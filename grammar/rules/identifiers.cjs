exports.buildIdentifierRules = function buildIdentifierRules() {
  const identifier = /[a-z_][a-zA-Z0-9_]*/;
  const typeIdent = /[A-Z][a-zA-Z0-9]*/;

  return {
    identifier: (_) => identifier,
    type_ident: (_) => typeIdent,
  };
};
