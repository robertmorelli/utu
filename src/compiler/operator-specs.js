// Shared surface-operator vocabulary. Semantic analysis and lowering both
// consume this data; neither layer owns it.

export const BINARY_OP_FN = Object.freeze({
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'rem',
  '&': 'band', '|': 'bor', '^': 'bxor', '<<': 'shl', '>>': 'shr', '>>>': 'ushr',
  '==': 'eq', '!=': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge',
  and: 'and', or: 'or', xor: 'xor',
});

export const UNARY_OP_FN = Object.freeze({ '-': 'neg', '~': 'bnot', not: 'not' });

export const COMPOUND_OP = Object.freeze({
  '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%',
  '&=': '&', '|=': '|', '^=': '^', '<<=': '<<', '>>=': '>>', '>>>=': '>>>',
  'and=': 'and', 'or=': 'or', 'xor=': 'xor',
});
