import { declarationSchema } from './schema.js';

/** Bump when linking or the schema changes, so cached declaration graphs are rebuilt. */
export const LINK_REVISION = 2;

/**
 * Host-neutral declaration linker. The caller supplies a TypeScript API and a
 * Program, which may use an entirely in-memory CompilerHost in a Worker. No
 * filesystem, process, network, or TypeScript runtime import lives here.
 * The result is the portable declaration graph the compiler resolves against.
 */
export function linkDeclarations(ts, program, { files, prefix, moduleSpecifier = null, includeStandardLibrary = false }) {
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(prefix ?? '')) throw new Error('declaration prefix must be a UTU type identifier');
  const checker = program.getTypeChecker();
  const roots = includeStandardLibrary
    ? program.getSourceFiles().filter(source => files.includes(source.fileName) || /^lib\..*\.d\.ts$/.test(source.fileName.split(/[\\/]/).at(-1)))
    : files.map(file => program.getSourceFile(file));
  if (roots.some(source => !source)) throw new Error('declaration source not loaded');
  if (!moduleSpecifier && roots.some(source => ts.isExternalModule(source))) {
    throw new Error('external declarations require a JavaScript moduleSpecifier (--module)');
  }
  const ambient = moduleSpecifier && ambientModule(checker, moduleSpecifier);
  if (!ambient && roots.some(source => !ts.isExternalModule(source) && source.statements.some(statement =>
    ts.isModuleDeclaration(statement) && ts.isStringLiteral(statement.name)))) {
    throw new Error('ambient declarations require a matching JavaScript moduleSpecifier (--module)');
  }
  const symbols = new Map();
  for (const source of roots) {
    const moduleSymbol = source.symbol ?? ambient;
    const assignment = moduleSymbol?.exports?.get('export=');
    const exported = assignment ? [assignment] : moduleSymbol ? checker.getExportsOfModule(moduleSymbol)
      : checker.getSymbolsInScope(source, ts.SymbolFlags.Type | ts.SymbolFlags.Value);
    for (let symbol of exported) {
      const publicName = symbol.name === 'export=' ? 'default' : symbol.name;
      if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      if (!moduleSymbol && !symbol.declarations?.some(d => roots.includes(d.getSourceFile()))) continue;
      symbols.set(publicName, symbol);
      // `export = value` also offers the value's members by name, as TypeScript's
      // `import { join } from "node:path"` does; a merged namespace offers its types.
      if (publicName === 'default') {
        const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
        const members = declaration && symbol.flags & ts.SymbolFlags.Value
          ? checker.getPropertiesOfType(checker.getTypeOfSymbolAtLocation(symbol, declaration)) : [];
        const types = symbol.flags & ts.SymbolFlags.Namespace ? checker.getExportsOfModule(symbol) : [];
        for (const member of [...types, ...members]) {
          if (member.name !== 'default' && !symbols.has(member.name)) symbols.set(member.name, member);
        }
      }
    }
  }
  return declarationSchema(ts, checker, symbols, { prefix, moduleSpecifier });
}

/** `declare module "pkg"` or the most specific matching wildcard (`declare module "*.css"`). */
function ambientModule(checker, specifier) {
  const modules = checker.getAmbientModules();
  return modules.find(symbol => symbol.name === JSON.stringify(specifier))
    ?? modules.filter(symbol => {
      const pattern = symbol.name.slice(1, -1), star = pattern.indexOf('*');
      return star >= 0 && specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1));
    }).sort((a, b) => b.name.indexOf('*') - a.name.indexOf('*'))[0];
}
