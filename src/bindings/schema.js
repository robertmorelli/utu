/** Serialize the checker's resolved declaration graph, without imposing TS source semantics. */
export function declarationSchema(ts, checker, symbols, { prefix, moduleSpecifier }) {
  const types = [], ids = new Map(), pending = [], constraining = new Set();
  // A tuple's element parameters have no symbol: they are T0, T1, … by position.
  const isTuple = type => !!(type.objectFlags & ts.ObjectFlags.Tuple);
  const paramName = type => type.symbol?.name ?? tupleParams.get(type) ?? 'T';
  const tupleParams = new Map();
  const nameTuple = target => (target.typeParameters ?? []).forEach((p, i) => tupleParams.set(p, `T${i}`));
  function ref(type) {
    if (!type) return 'any';
    const f = type.flags;
    if (f & ts.TypeFlags.Void) return 'void';
    if (f & ts.TypeFlags.Never) return 'never';
    if (f & ts.TypeFlags.Null) return 'null';
    if (f & ts.TypeFlags.Undefined) return 'undefined';
    if (f & ts.TypeFlags.Any) return 'any';
    if (f & ts.TypeFlags.Unknown) return 'unknown';
    // `id-${number}`: its texts with each hole's kind between (`["id-", "F64", ""]`).
    if (f & ts.TypeFlags.TemplateLiteral) return { pattern: type.texts.flatMap((text, i) => i ? [hole(type.types[i - 1]), text] : [text]), name: checker.typeToString(type), base: 'Str' };
    if (f & ts.TypeFlags.StringLike) return type.isStringLiteral() ? { literal: type.value, base: 'Str' } : 'Str';
    if (f & ts.TypeFlags.NumberLike) return type.isNumberLiteral() ? { literal: type.value, base: 'F64' } : 'F64';
    if (f & ts.TypeFlags.BooleanLike) return 'Bool';
    if (f & ts.TypeFlags.BigIntLike) return 'bigint';
    if (f & ts.TypeFlags.UniqueESSymbol) return { symbol: type.symbol?.name ?? 'symbol' };
    if (f & ts.TypeFlags.ESSymbolLike) return 'symbol';
    if (f & ts.TypeFlags.IndexedAccess) return { indexed: ref(type.objectType), key: ref(type.indexType) };
    if (f & ts.TypeFlags.Index) return { keys: ref(type.type) };
    if (f & ts.TypeFlags.TypeParameter) {
      // The declared constraint keeps relations such as `S extends T`; F-bounded
      // constraints (`T extends Foo<T>`) stop at the recursive mention.
      const name = paramName(type);
      if (constraining.has(type)) return { parameter: name };
      constraining.add(type);
      try {
        const declaration = type.symbol?.declarations?.find(ts.isTypeParameterDeclaration);
        const node = declaration && ts.getEffectiveConstraintOfTypeParameter(declaration);
        const declared = node ? checker.getTypeFromTypeNode(node) : checker.getBaseConstraintOfType(type);
        return { parameter: name, constraint: declared ? ref(declared) : 'any' };
      } finally { constraining.delete(type); }
    }
    if (type.objectFlags & ts.ObjectFlags.Reference && type.target && type.target !== type) {
      if (isTuple(type.target)) nameTuple(type.target);
      return { template: ref(type.target), arguments: checker.getTypeArguments(type).map(ref) };
    }
    if (ids.has(type)) return ids.get(type);
    const id = types.length;
    ids.set(type, id); types.push(null); pending.push(type);
    return id;
  }
  // A template hole: a number, a bigint's digits, or any string.
  const hole = type => type.flags & ts.TypeFlags.Number ? 'F64' : type.flags & ts.TypeFlags.BigInt ? 'bigint' : 'Str';
  const at = symbol => checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration ?? symbol.declarations?.[0]);
  function signature(sig) {
    return {
      params: sig.parameters.map(p => ({ name: p.name, type: ref(at(p)), optional: !!(p.flags & ts.SymbolFlags.Optional) || !!p.valueDeclaration?.questionToken,
        rest: !!p.valueDeclaration?.dotDotDotToken })),
      result: ref(checker.getReturnTypeOfSignature(sig)),
      ...(sig.thisParameter ? { receiver: ref(at(sig.thisParameter)) } : {}),
      // (an abstract class's constructor: `new` of it is a mistake)
      ...(sig.flags & ts.SignatureFlags.Abstract ? { abstract: true } : {}),
    };
  }
  const exports = Object.create(null), names = Object.create(null), mutableGlobals = [], ecmascript = [];
  // Names the ECMAScript libraries (lib.es*.d.ts) declare and no host library (lib.dom, lib.webworker) touches.
  const files = symbol => (symbol.declarations ?? []).map(d => d.getSourceFile().fileName.split(/[\\/]/).at(-1));
  const esOnly = symbol => files(symbol).some(f => /^lib\.es/.test(f)) && !files(symbol).some(f => /^lib\.(dom|webworker)/.test(f));
  for (const [name, symbol] of [...symbols].sort(([a], [b]) => a.localeCompare(b))) {
    if (esOnly(symbol)) ecmascript.push(name);
    if (symbol.flags & ts.SymbolFlags.Type) names[name] = ref(checker.getDeclaredTypeOfSymbol(symbol));
    if (symbol.flags & ts.SymbolFlags.Value) {
      exports[name] = ref(at(symbol));
      const decl = symbol.valueDeclaration;
      if (!moduleSpecifier && decl && ts.isVariableDeclaration(decl) && !(decl.parent.flags & ts.NodeFlags.Const)) mutableGlobals.push(name);
    }
  }
  for (let i = 0; i < pending.length; i++) {
    if (i > 100000) throw new Error('Declaration graph exceeds 100,000 types; refusing to silently erase types');
    const type = pending[i];
    const node = { name: checker.typeToString(type), properties: Object.create(null) };
    types[ids.get(type)] = node;
    if (type.isUnion()) {
      node.union = type.types.map(ref);
      // (an enum's members are nominal: TypeScript takes no bare string for one)
      if (type.symbol?.flags & ts.SymbolFlags.Enum) node.enum = true;
      continue;
    }
    const args = type.objectFlags & ts.ObjectFlags.Reference ? checker.getTypeArguments(type) : [];
    if (checker.isArrayType(type) || checker.isTupleType(type)) node.element = ref(checker.getIndexTypeOfType(type, ts.IndexKind.Number));
    if (type.target && type.target !== type && args.length) {
      node.template = ref(type.target);
      node.arguments = args.map(ref);
    }
    if (isTuple(type)) nameTuple(type);
    if (args.length) node.parameters = args.map(paramName);
    if (isTuple(type)) node.name = `[${args.map((t, i) => paramName(t) + (type.elementFlags[i] & ts.ElementFlags.Optional ? '?' : '')).join(', ')}]`;
    if (type.isClassOrInterface?.()) node.bases = (checker.getBaseTypes(type) ?? []).map(ref);
    // Standard-library declarations (lib.dom, lib.es*) are one identity across every ABI.
    const origins = type.symbol?.declarations ?? [];
    if (type.isClassOrInterface?.() && origins.length && origins.every(d => d.getSourceFile().hasNoDefaultLib)) {
      node.lib = checker.getFullyQualifiedName(type.symbol);
    }
    // Every enum member is a declared constant, whether or not the enum is `const`.
    if (type.symbol?.flags & ts.SymbolFlags.Enum) {
      node.constants = Object.create(null);
      for (const declaration of type.symbol.declarations ?? []) for (const member of declaration.members ?? []) {
        const value = checker.getConstantValue(member);
        if (value !== undefined) node.constants[member.name.text] = value;
      }
    }
    node.calls = type.getCallSignatures().map(signature);
    node.constructors = type.getConstructSignatures().map(signature);
    node.indexes = checker.getIndexInfosOfType(type).map(info => ({ key: ref(info.keyType), type: ref(info.type), readonly: info.isReadonly }));
    for (const prop of checker.getPropertiesOfType(type)) {
      const declarations = prop.declarations ?? [];
      if (declarations.some(d => d.name && ts.isPrivateIdentifier(d.name) || d.modifiers?.some(m => [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(m.kind)))) continue;
      let key = prop.name;
      if (key.startsWith('__@')) {
        const computed = declarations.find(d => d.name && ts.isComputedPropertyName(d.name))?.name.expression;
        if (computed && ts.isPropertyAccessExpression(computed) && computed.expression.getText() === 'Symbol') key = `@@${computed.name.text}`;
        else if (computed && ts.isIdentifier(computed)) key = `@@${checker.getSymbolAtLocation(computed)?.name ?? computed.text}`;
        else continue;
      }
      // (a tuple's elements are declared nowhere: each is its parameter)
      const propType = isTuple(type) && /^\d+$/.test(key) ? checker.getTypeOfSymbol(prop) : at(prop);
      node.properties[key] = { type: ref(propType), optional: !!(prop.flags & ts.SymbolFlags.Optional), readonly: declarations.some(d => d.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword))
        // (a mapped type's, `Readonly<T>`, is readonly by its check flags)
        || !!(ts.getCheckFlags?.(prop) & ts.CheckFlags.Readonly)
        || !!(prop.flags & ts.SymbolFlags.GetAccessor) && !(prop.flags & ts.SymbolFlags.SetAccessor) };
    }
  }
  return { version: 1, prefix, moduleSpecifier, exports, names, mutableGlobals, types, ...(ecmascript.length ? { ecmascript } : {}) };
}

/** A linked declaration file's ABI (`tools/dts/cli.mjs` writes `Name.abi.json`), or null when the text is not one. */
export function abiFromJson(text) {
  let abi = null;
  try { abi = JSON.parse(text); } catch { return null; }
  const valid = abi?.version === 1 && Array.isArray(abi.types) && abi.exports && abi.names && /^[A-Z][A-Za-z0-9_]*$/.test(abi.prefix);
  return valid ? abi : null;
}
