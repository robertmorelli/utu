import { linkDeclarations } from './link.js';

const slashes = path => path.replace(/\\/g, '/');
const dirname = path => slashes(path).replace(/\/[^/]*$/, '') || '/';
const join = (dir, name) => `${slashes(dir).replace(/\/$/, '')}/${name}`;

/**
 * Host-neutral package linking for `using Pkg from "npm:pkg"` and
 * `using Path from "node:path"`.
 *
 * The caller supplies the TypeScript API and synchronous file access, so the
 * same resolver runs in Node, Bun, Deno, or a browser Worker over an in-memory
 * file system. TypeScript's own module resolution finds the declarations:
 * `types` and `exports` conditions, `@types/*` packages, and ambient
 * `declare module "node:*"` blocks.
 *
 * @param {object} options
 * @param {object} options.ts      TypeScript API
 * @param {string} options.root    directory that owns `node_modules`
 * @param {{ readFile(path: string): string | undefined, fileExists(path: string): boolean,
 *           directoryExists?(path: string): boolean, realpath?(path: string): string }} options.fs
 * @param {string} [options.libDir] directory holding TypeScript's `lib.*.d.ts`
 * @returns {(specifier: string, request: { prefix: string }) => { abi: object, files: string[] }}
 */
export function createPackageResolver({ ts, root, fs, libDir, libraries = ['lib.es2022.full.d.ts'] }) {
  const options = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true, types: [],
    ...(libraries.length ? {} : { noLib: true }),
  };
  const libraryDir = libDir ?? dirname(ts.getDefaultLibFilePath(options));
  const sources = new Map();
  const host = {
    getSourceFile(name, language) {
      if (!sources.has(name)) {
        const text = fs.readFile(name);
        sources.set(name, text === undefined ? undefined : ts.createSourceFile(name, text, language, true));
      }
      return sources.get(name);
    },
    getDefaultLibFileName: () => join(libraryDir, ts.getDefaultLibFileName(options)),
    getDefaultLibLocation: () => libraryDir,
    writeFile() { throw new Error('package linking never writes files'); },
    getCurrentDirectory: () => root,
    getDirectories: () => [],
    fileExists: name => fs.fileExists(name),
    readFile: name => fs.readFile(name),
    directoryExists: fs.directoryExists && (name => fs.directoryExists(name)),
    realpath: fs.realpath && (name => fs.realpath(name)),
    getCanonicalFileName: name => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const importer = join(root, '__utu_package_import__.ts');

  return function resolvePackage(specifier, { prefix }) {
    const moduleSpecifier = specifier.replace(/^npm:/, '');
    let files;
    if (moduleSpecifier.startsWith('node:')) {
      // Node builtins are ambient modules declared by @types/node.
      const types = ts.resolveTypeReferenceDirective('node', importer, options, host).resolvedTypeReferenceDirective;
      if (!types?.resolvedFileName) throw new Error(`"${specifier}" needs Node's declarations: install @types/node`);
      files = [types.resolvedFileName];
    } else {
      const resolved = ts.resolveModuleName(moduleSpecifier, importer, options, host).resolvedModule;
      if (!resolved) throw new Error(`Cannot find package "${moduleSpecifier}" from ${root}`);
      if (!/\.d\.[cm]?ts$/.test(resolved.resolvedFileName)) {
        throw new Error(`"${moduleSpecifier}" has no TypeScript declarations; install @types/${moduleSpecifier.replace(/^@([^/]+)\//, '$1__')}`);
      }
      files = [resolved.resolvedFileName];
    }
    const program = ts.createProgram([...files, ...libraries.map(lib => join(libraryDir, lib))], options, host);
    const syntax = [...program.getOptionsDiagnostics(), ...program.getSyntacticDiagnostics()];
    if (syntax.length) throw new Error(`${specifier}: ${ts.flattenDiagnosticMessageText(syntax[0].messageText, '\n')}`);
    const abi = linkDeclarations(ts, program, { files, prefix, moduleSpecifier });
    // Every declaration file TypeScript read; a cache is valid while none change.
    const read = program.getSourceFiles().map(file => file.fileName).filter(name => !name.startsWith(libraryDir));
    return { abi, files: read };
  };
}
