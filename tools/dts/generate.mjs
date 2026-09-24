import ts from 'typescript';
import path from 'node:path';
import { generateBindingsFromProgram } from '../../src/bindings/generate.js';

/**
 * Generate independently importable UTU modules. TypeScript is a generation-
 * time dependency only; output uses the existing @es ABI and no new runtime.
 */
export function generateBindings({ files, prefix = 'Browser', moduleSpecifier = null, compilerOptions = {}, includeStandardLibrary = false }) {
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(prefix)) throw new Error('binding prefix must be a UTU type identifier');
  const libraryDir = path.dirname(ts.getDefaultLibFilePath({}));
  const standardLibs = (compilerOptions.lib ?? ['lib.es2022.full.d.ts']).map(name => path.join(libraryDir, name));
  const program = ts.createProgram([...files, ...standardLibs], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true,
    skipLibCheck: false, types: [], ...compilerOptions,
  });
  const syntax = ts.getPreEmitDiagnostics(program);
  if (syntax.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(syntax, {
    getCanonicalFileName: f => f, getCurrentDirectory: () => '', getNewLine: () => '\n',
  }));
  return generateBindingsFromProgram(ts, program, { files, prefix, moduleSpecifier, includeStandardLibrary });
}
