export function unwrapNullable(typeStr) {
  return typeStr?.startsWith('?') ? typeStr.slice(1) : typeStr;
}

export function isNullable(typeStr) {
  return typeStr?.startsWith('?') ?? false;
}

export function unifyTypes(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  if (a === b) return a;
  if (isNullable(a) && unwrapNullable(a) === b) return a;
  if (isNullable(b) && unwrapNullable(b) === a) return b;
  return null;
}

export function isAssignable(actual, expected, ctx = {}) {
  if (actual === expected) return true;
  if (isNullable(expected) && actual === unwrapNullable(expected)) return true;
  if (actual === 'null' && isNullable(expected)) return true;

  const actualDecl = ctx.typeIndex?.get(actual);
  const expectedDecl = ctx.typeIndex?.get(expected);
  if (actualDecl?.localName === 'ir-variant' && expectedDecl?.localName === 'ir-enum') {
    return actualDecl.parentElement === expectedDecl;
  }
  return false;
}
