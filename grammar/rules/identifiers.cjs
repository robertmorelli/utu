exports.buildIdentifierRules = function buildIdentifierRules() {
  const identifier = /([a-z][a-zA-Z0-9_]*|_[a-zA-Z0-9_]+)/;
  const typeIdent = /[A-Z][a-zA-Z0-9]*/;

  return {
    identifier: (_) => identifier,
    type_ident: (_) => typeIdent,
  };
};
