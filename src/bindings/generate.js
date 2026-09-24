import { createTypeMapper } from './types.js';

const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const js = JSON.stringify;
const identifier = name => name.replace(/[^A-Za-z0-9_]/g, c => `_u${c.codePointAt(0).toString(16)}_`);

/**
 * Host-neutral declaration linker. The caller supplies a TypeScript API and
 * Program, which may use an entirely in-memory CompilerHost in a Worker.
 * No filesystem, process, network, or TypeScript runtime import lives here.
 */
export function generateBindingsFromProgram(ts, program, { files, prefix = 'Browser', moduleSpecifier = null, includeStandardLibrary = false }) {
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(prefix)) throw new Error('binding prefix must be a UTU type identifier');
  const checker = program.getTypeChecker();
  const erasures = new Map();
  const map = createTypeMapper(ts, checker, erasures);
  const modules = new Map();
  const moduleNames = new Map();
  const occupiedModules = new Set([prefix.toLowerCase()]);
  function namedModule(name, kind = 'type') {
    const identity = `${kind}:${name}`;
    if (moduleNames.has(identity)) return moduleNames.get(identity);
    let candidate = `${prefix}${kind === 'value' ? 'Global_' : ''}${identifier(name)}`;
    if (occupiedModules.has(candidate.toLowerCase())) {
      candidate += `_x${[...identity].map(c => c.codePointAt(0).toString(16)).join('_')}`;
    }
    while (occupiedModules.has(candidate.toLowerCase())) candidate += '_';
    occupiedModules.add(candidate.toLowerCase());
    moduleNames.set(identity, candidate);
    return candidate;
  }
  const records = [];
  const skipped = [];
  const roots = includeStandardLibrary
    ? program.getSourceFiles().filter(source => files.includes(source.fileName) || /^lib\..*\.d\.ts$/.test(source.fileName.split(/[\\/]/).at(-1)))
    : files.map(file => program.getSourceFile(file));
  if (roots.some(source => !source)) throw new Error('declaration source not loaded');
  if (!moduleSpecifier && roots.some(source => ts.isExternalModule(source))) {
    throw new Error('external declarations require a JavaScript moduleSpecifier (--module)');
  }
  const symbols = new Map();
  const ambientModules = checker.getAmbientModules();
  const ambient = moduleSpecifier && (ambientModules.find(s => s.name === JSON.stringify(moduleSpecifier))
    ?? ambientModules.filter(s => {
      const pattern = s.name.slice(1, -1), star = pattern.indexOf('*');
      return star >= 0 && moduleSpecifier.startsWith(pattern.slice(0, star))
        && moduleSpecifier.endsWith(pattern.slice(star + 1));
    }).sort((a, b) => b.name.indexOf('*') - a.name.indexOf('*'))[0]);
  if (!ambient && roots.some(source => !ts.isExternalModule(source) && source.statements.some(statement =>
    ts.isModuleDeclaration(statement) && ts.isStringLiteral(statement.name)))) {
    throw new Error('ambient declarations require a matching JavaScript moduleSpecifier (--module)');
  }
  for (const source of roots) {
    if (!source) throw new Error(`declaration source not loaded`);
    const moduleSymbol = source.symbol ?? ambient;
    const assignment = moduleSymbol?.exports?.get('export=');
    const exported = assignment ? [assignment] : moduleSymbol ? checker.getExportsOfModule(moduleSymbol)
      : checker.getSymbolsInScope(source, ts.SymbolFlags.Type | ts.SymbolFlags.Value);
    for (let symbol of exported) {
      const publicName = symbol.name === 'export=' ? 'default' : symbol.name;
      if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      if (!moduleSymbol && !symbol.declarations?.some(d => roots.includes(d.getSourceFile()))) continue;
      symbols.set(publicName, symbol);
    }
  }
  function container(name) {
    if (!modules.has(name)) modules.set(name, { names: new Set(), lines: [] });
    return modules.get(name);
  }
  function emit(mod, name, params, result, expression, detail, prologue = '') {
    const target = container(mod);
    let unique = name, suffix = 2;
    while (target.names.has(unique)) unique = `${name}_v${suffix++}`;
    target.names.add(unique);
    target.lines.push(`    let ${unique}: fun(${params.join(', ')}) ${result} = @es/\\ ${prologue}${expression} \\/;`);
    records.push({ module: mod, name: unique, params, result, ...detail });
  }
  const output = (expr, type) => type.boolean ? `(${expr}) ? 1 : 0` : expr;
  const input = (name, type) => type.boolean ? `!!${name}` : name;
  function signatures(mod, name, type, invoke, receiver, detail, prologue = '', construct = false) {
    const sigs = construct ? type.getConstructSignatures() : type.getCallSignatures();
    const sorted = [...sigs].sort((a, b) => (a.typeParameters?.length ?? 0) - (b.typeParameters?.length ?? 0));
    sorted.forEach((sig, overload) => {
      const params = sig.parameters.filter(p => p.name !== 'this');
      const types = params.map(p => map(checker.getTypeOfSymbolAtLocation(p, p.valueDeclaration ?? p.declarations[0]), 0, !!p.valueDeclaration?.questionToken));
      const ret = map(checker.getReturnTypeOfSignature(sig));
      const rest = !!params.at(-1)?.valueDeclaration?.dotDotDotToken;
      let minimum = params.length;
      while (minimum && (params[minimum - 1].flags & ts.SymbolFlags.Optional
          || params[minimum - 1].valueDeclaration?.questionToken || params[minimum - 1].valueDeclaration?.dotDotDotToken)) minimum--;
      const base = `${name}${overload ? `_overload${overload + 1}` : ''}`;
      for (let arity = minimum; arity <= params.length; arity++) {
        const chosen = types.slice(0, arity).map(t => t.utu === 'void' ? { utu: 'Externref' } : t);
        const args = chosen.map((t, i) => rest && i === params.length - 1 ? `...p${i}` : input(`p${i}`, t));
        const names = chosen.map((_, i) => `p${i}`);
        const paramsUtu = chosen.map(t => t.utu);
        if (receiver) { names.unshift('self'); paramsUtu.unshift('Externref'); }
        emit(mod, `${base}${arity === minimum ? '' : `_arity${arity}`}`, paramsUtu, ret.utu,
          `(${names.join(',')}) => ${output(invoke(args), ret)}`, { ...detail, overload, arity }, prologue);
      }
    });
    // The explicit JS-value route has no fixed arity or representational loss.
    // It remains per member: never a namespace-object dispatcher for packages.
    emit(mod, `${name}_js`, receiver ? ['Externref', 'Externref'] : ['Externref'], 'Externref',
      `(${receiver ? 'self,' : ''}args) => ${invoke(['...args'])}`, { ...detail, raw: true }, prologue);
  }
  function members(mod, type, base = 'self', receiver = true, prologue = '', staticPrefix = '') {
    for (const prop of checker.getPropertiesOfType(type).sort((a, b) => order(a.name, b.name))) {
      const declarations = prop.declarations ?? [];
      if (declarations.some(d => d.name && ts.isPrivateIdentifier(d.name) || d.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword))) continue;
      let key = js(prop.name), publicName = identifier(prop.name);
      if (prop.name.startsWith('__@')) {
        const computed = declarations.find(d => d.name && ts.isComputedPropertyName(d.name))?.name.expression;
        if (computed && ts.isPropertyAccessExpression(computed) && computed.expression.getText() === 'Symbol') {
          key = `Symbol.${computed.name.text}`;
          publicName = `symbol_${computed.name.text}`;
        } else {
          skipped.push({ module: mod, member: prop.name, reason: 'unique symbol key; use exported symbol with JS.get_key' });
          continue;
        }
      }
      const declaration = prop.valueDeclaration ?? declarations[0];
      if (!declaration) {
        skipped.push({ module: mod, member: prop.name, reason: 'synthetic property without declaration; use JS.get/JS.set' });
        continue;
      }
      const propertyType = checker.getTypeOfSymbolAtLocation(prop, declaration);
      const name = publicName, access = `${base}[${key}]`;
      const detail = { member: prop.name, kind: 'property' };
      if (propertyType.getCallSignatures().length) {
        signatures(mod, `${staticPrefix}call_${name}`, propertyType, args => `${access}(${args.join(',')})`, receiver, { member: prop.name, kind: 'method' }, prologue);
      } else {
        const value = map(propertyType);
        emit(mod, `${staticPrefix}get_${name}`, receiver ? ['Externref'] : [], value.utu === 'void' ? 'Externref' : value.utu,
          `(${receiver ? 'self' : ''}) => ${output(access, value)}`, detail, prologue);
        const readonly = declarations.some(d => d.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword))
          || !!(prop.flags & ts.SymbolFlags.GetAccessor) && !(prop.flags & ts.SymbolFlags.SetAccessor);
        if (!readonly) emit(mod, `${staticPrefix}set_${name}`, [...(receiver ? ['Externref'] : []), value.utu === 'void' ? 'Externref' : value.utu], 'void',
          `(${receiver ? 'self,' : ''}value) => { ${access} = ${input('value', value)}; }`, { ...detail, kind: 'setter' }, prologue);
      }
    }
    const index = checker.getIndexInfosOfType(type);
    for (const [i, info] of index.entries()) {
      const key = map(info.keyType), value = map(info.type);
      const params = [...(receiver ? ['Externref'] : []), key.utu];
      const names = receiver ? 'self,key' : 'key';
      const access = `${base}[key]`;
      emit(mod, `${staticPrefix}get_index${i || ''}`, params, value.utu,
        `(${names}) => ${output(access, value)}`, { kind: 'index' }, prologue);
      if (!info.isReadonly) emit(mod, `${staticPrefix}set_index${i || ''}`, [...params, value.utu], 'void',
        `(${names},value) => { ${access} = ${input('value', value)}; }`, { kind: 'index-setter' }, prologue);
    }
  }
  container(prefix);
  for (const [name, symbol] of [...symbols].sort(([a], [b]) => order(a, b))) {
    const mod = namedModule(name);
    if (symbol.flags & ts.SymbolFlags.ConstEnum) {
      for (const declaration of symbol.declarations ?? []) {
        if (!ts.isEnumDeclaration(declaration)) continue;
        for (const member of declaration.members) {
          const value = checker.getConstantValue(member);
          if (value === undefined) throw new Error(`const enum value is not known: ${name}.${member.name.getText()}`);
          emit(mod, `get_${identifier(member.name.text)}`, [], typeof value === 'string' ? 'Str' : 'F64',
            `() => ${js(value)}`, { kind: 'constant', member: member.name.text });
        }
      }
      continue;
    }
    if (symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class | ts.SymbolFlags.TypeAlias)) {
      const type = checker.getDeclaredTypeOfSymbol(symbol);
      // Scalar aliases are represented at their use sites. Object aliases,
      // mapped types, and merged interfaces expose the checker's resolved view.
      if (type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) {
        container(mod);
        members(mod, type);
        if (type.getCallSignatures().length) signatures(mod, 'invoke', type, args => `self(${args.join(',')})`, true, { kind: 'callable' });
      }
    }
    if (!(symbol.flags & ts.SymbolFlags.Value)) continue;
    const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (!decl) continue;
    const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
    const alias = `__dts_${identifier(name)}`;
    const exportName = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : js(name);
    const prologue = moduleSpecifier ? `import { ${exportName} as ${alias} } from ${js(moduleSpecifier)}; ` : '';
    const access = moduleSpecifier ? alias : `globalThis[${js(name)}]`;
    if (type.getConstructSignatures().length || type.getCallSignatures().length) {
      emit(prefix, `get_${identifier(name)}`, [], 'Externref', `() => ${access}`, { kind: 'callable-value', member: name }, prologue);
    }
    if (type.getConstructSignatures().length) {
      signatures(mod, 'new_instance', type, args => `new ${access}(${args.join(',')})`, false, { kind: 'constructor', member: name }, prologue, true);
      members(mod, type, access, false, prologue, 'static_');
    } else if (type.getCallSignatures().length) {
      signatures(prefix, `call_${identifier(name)}`, type, args => `${access}(${args.join(',')})`, false, { kind: 'function', member: name }, prologue);
      if (checker.getPropertiesOfType(type).length) members(namedModule(name, 'value'), type, access, false, prologue);
    } else {
      const value = map(type);
      emit(prefix, `get_${identifier(name)}`, [], value.utu === 'void' ? 'Externref' : value.utu,
        `() => ${output(access, value)}`, { kind: 'global', member: name }, prologue);
      // Namespace and anonymous exported objects expose their members too.
      if (type.flags & ts.TypeFlags.Object) members(namedModule(name, 'value'), type, access, false, prologue);
    }
  }
  const sources = new Map([...modules].map(([name, { lines }]) => [name,
    `// Generated from TypeScript ${ts.version}; regenerate, do not edit.\nmod ${name} {\n${lines.join('\n')}\n}\n`]));
  return { sources, report: { typescript: ts.version, modules: sources.size, bindings: records.length, records,
    moduleNames: Object.fromEntries(moduleNames), erasures: [...erasures].map(([type, occurrences]) => ({ type, occurrences })), skipped } };
}
