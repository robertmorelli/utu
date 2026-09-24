import ts from 'typescript';
import path from 'node:path';
import { linkDeclarations } from '../../src/bindings/link.js';

/**
 * Link `.d.ts` files into a portable declaration graph. TypeScript is a
 * link-time dependency only; compiled programs never ship it.
 */
export function linkFiles({ files, prefix, moduleSpecifier = null, compilerOptions = {}, includeStandardLibrary = false }) {
  const libraryDir = path.dirname(ts.getDefaultLibFilePath({}));
  const standardLibs = (compilerOptions.lib ?? ['lib.es2022.full.d.ts']).map(name => path.join(libraryDir, name));
  const program = ts.createProgram([...files, ...standardLibs], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true,
    skipLibCheck: false, types: [], ...compilerOptions,
  });
  // Declarations describe an interface; TypeScript's assignability rules are not UTU's.
  const syntax = [...program.getOptionsDiagnostics(), ...program.getSyntacticDiagnostics()];
  if (syntax.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(syntax, {
    getCanonicalFileName: f => f, getCurrentDirectory: () => '', getNewLine: () => '\n',
  }));
  return linkDeclarations(ts, program, { files, prefix, moduleSpecifier, includeStandardLibrary });
}
