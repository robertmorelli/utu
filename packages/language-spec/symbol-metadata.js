import data from '../../jsondata/languageService.data.json' with { type: 'json' };

export const SYMBOL_METADATA = data.symbolMetadata;
export const RECURSIVE_EXPRESSION_TYPES = new Set(
  data.recursiveExpressionTypes,
);
export const LITERAL_TYPE_BY_NODE_TYPE = data.literalTypeByNodeType;

// The editor and indexer both consume this normalized metadata surface.
