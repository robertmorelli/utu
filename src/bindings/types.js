/** ABI mapping, deliberately separate from declaration discovery and emission. */
export function createTypeMapper(ts, checker, erasures) {
  function erased(type, reason) {
    const spelling = checker.typeToString(type);
    const key = `${reason}: ${spelling}`;
    erasures.set(key, (erasures.get(key) ?? 0) + 1);
    return { utu: 'Externref', boolean: false };
  }
  function map(type, depth = 0, omitUndefined = false) {
    const f = type.flags;
    if (f & ts.TypeFlags.TypeParameter) {
      const constraint = checker.getBaseConstraintOfType(type);
      if (constraint && constraint !== type && depth < 8) return map(constraint, depth + 1);
    }
    if (type.isIntersection()) {
      const primitive = type.types.find(t => t.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike));
      if (primitive) return map(primitive, depth);
    }
    if (f & ts.TypeFlags.Void) return { utu: 'void' };
    if (f & ts.TypeFlags.StringLike) return { utu: 'Str' };
    if (f & ts.TypeFlags.NumberLike) return { utu: 'F64' };
    if (f & ts.TypeFlags.BooleanLike) return { utu: 'Bool', boolean: true };
    if (type.isUnion()) {
      const parts = omitUndefined ? type.types.filter(t => !(t.flags & ts.TypeFlags.Undefined)) : type.types;
      if (parts.length === 1) return map(parts[0], depth);
      if (parts.every(t => t.flags & ts.TypeFlags.StringLike)) return { utu: 'Str' };
      if (parts.every(t => t.flags & ts.TypeFlags.NumberLike)) return { utu: 'F64' };
      if (parts.every(t => t.flags & ts.TypeFlags.BooleanLike)) return { utu: 'Bool', boolean: true };
      return erased(type, 'union');
    }
    const calls = type.getCallSignatures();
    if (calls.length === 1 && depth < 3) {
      const sig = calls[0];
      const ret = map(checker.getReturnTypeOfSignature(sig), depth + 1);
      const params = sig.parameters.map(p => map(checker.getTypeOfSymbolAtLocation(p, p.valueDeclaration ?? p.declarations[0]), depth + 1));
      // Bool-returning callbacks use JS.function_value to preserve JS booleans;
      // retain a JS value here. Optional/rest callbacks are likewise
      // not falsely advertised as fixed-arity UTU closures.
      if (!ret.boolean && !sig.typeParameters?.length && !sig.thisParameter
          && sig.parameters.every(p => !p.valueDeclaration?.questionToken && !p.valueDeclaration?.dotDotDotToken)) {
        return { utu: `cl(${params.map(p => p.utu === 'void' ? 'Externref' : p.utu).join(', ')}) ${ret.utu}` };
      }
      return erased(type, 'callback');
    }
    return erased(type, f & ts.TypeFlags.Object ? 'object' : 'type');
  }
  return map;
}
