// compiler.js — Compiler factory with dependency injection
//
// The compiler is created via `createCompiler(env)` where `env` carries all
// host-specific capabilities.  The same factory works in every runtime:
//
//   CLI (Node / Bun)
//     import { readFile } from 'fs/promises';
//     const compiler = createCompiler({ parser, readFile });
//
//   VS Code extension (Node host or web worker)
//     const compiler = createCompiler({
//       parser,
//       readFile: async (path) => {
//         const uri = vscode.Uri.file(path);
//         const bytes = await vscode.workspace.fs.readFile(uri);
//         return new TextDecoder().decode(bytes);
//       },
//     });
//
//   Browser / vscode.dev (web worker, no fs)
//     const compiler = createCompiler({
//       parser,
//       readFile: async (path) => fetch(path).then(r => r.text()),
//     });
//
// The `parser` is a pre-initialized web-tree-sitter Parser instance with the
// utu language already loaded.  The caller is responsible for initialisation
// because only the caller knows which wasm loading mechanism to use.

import { fileURLToPath } from 'node:url';

import { treeToIR, createIRDocument, resetNodeIds } from './parse.js';
import { buildGraph } from './build-graph.js';
import { bringTargetToTopLevel } from './bring-target-to-top-level.js';
import { checkModuleVariance } from './check-module-variance.js';
import { lowerImplicitStructInit } from './lower-implicit-struct-init.js';
import { lowerPipe } from './lower-pipe.js';
import { inlineImports } from './inline-imports.js';
import { instantiateModules } from './instantiate-modules.js';
import { hoistModules } from './hoist-modules.js';
import { linkTypeDecls } from './link-type-decls.js';
import { resolveBindings } from './resolve-bindings.js';
import { inferTypes } from './infer-types.js';
import { resolveMethods } from './resolve-methods.js';
import { expandDsls } from './expand-dsls.js';
import { createStandardDsls } from './standard-dsls.js';
import { PLATFORM_SOURCES } from './platform-sources.generated.js';

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CompilerEnv
 * @property {import('web-tree-sitter').default} parser
 *   A web-tree-sitter Parser with the Utu language set.
 * @property {(path: string) => Promise<string>} readFile
 *   Reads the UTF-8 contents of a file at the given path.
 *   The implementation is host-specific (fs, vscode.workspace.fs, fetch, …).
 * @property {(path: string, fromPath: string) => string} resolvePath
 *   Resolves a relative import path to an absolute file key.
 * @property {() => Document} [createDocument]
 *   Document factory for DI. Defaults to linkedom's createIRDocument.
 *   Browser: () => document.implementation.createHTMLDocument()
 *   Debug:   () => new SpecCompliantImpl().createHTMLDocument()
 * @property {boolean} [debugAssertions]
 *   When true, assert each compiler pass has discharged its expected IR state.
 * @property {'normal' | 'test' | 'bench' | 'analysis'} [target]
 *   Select which entry surface survives into the compilation pipeline.
 * @property {Record<string, { expand(ctx: object): object | null | undefined }>} [dsls]
 *   DSL plugin registry keyed by `@name`.
 */

/**
 * @typedef {Object} Compiler
 * @property {(source: string, filePath?: string) => Document} parseSource
 *   Parse a source string directly into IR (no file I/O).
 * @property {(filePath: string) => Promise<Document>} compileFile
 *   Read a file via the injected `readFile` and compile it to IR.
 */

/**
 * Create a compiler bound to a specific host environment.
 *
 * @param {CompilerEnv} env
 * @returns {Compiler}
 */
export function createCompiler(env) {
  const { parser, readFile, resolvePath, stdlib = PLATFORM_SOURCES, dsls = {}, createDocument = createIRDocument, debugAssertions = false, target = 'analysis' } = env;

  if (!parser)      throw new Error('createCompiler: `parser` is required');
  if (!readFile)    throw new Error('createCompiler: `readFile` is required');
  if (!resolvePath) throw new Error('createCompiler: `resolvePath` is required');
  const standardDsls = createStandardDsls({ parser, createDocument });
  const dslRegistry = { ...standardDsls, ...dsls };

  /**
   * Parse a single source string into a phase-1 IR document.
   * No module resolution — useful for single-file tooling (e.g. diagnostics).
   */
  function parseSource(source, filePath = '') {
    resetNodeIds();
    const tree   = parser.parse(source);
    const ir     = treeToIR(tree, source, createDocument);
    const root   = ir.body.firstChild;
    if (root && filePath) root.setAttribute('data-file', filePath);
    return ir;
  }

  /**
   * Full pipeline: build graph → inline imports → instantiate modules → hoist.
   * Returns a flat IR document with no modules, no usings, no type params.
   */
  async function compileFile(filePath) {
    resetNodeIds();
    const { graph, order } = await buildGraph(filePath, {
      parser,
      readFile,
      resolvePath,
      stdlib,
      createDocument,
      target,
      debugAssertions,
    });
    bringTargetToTopLevel(graph.get(filePath), { target, filePath, debugAssertions });
    const doc = inlineImports(graph, order, { debugAssertions });
    checkModuleVariance(doc);
    instantiateModules(doc, { debugAssertions });
    lowerPipe(doc, { debugAssertions });
    hoistModules(doc, { debugAssertions });
    lowerImplicitStructInit(doc, { debugAssertions });
    expandDsls(doc, { dsls: dslRegistry, debugAssertions });
    // Analysis passes
    const typeIndex = linkTypeDecls(doc);
    resolveBindings(doc);
    inferTypes(doc, typeIndex);
    resolveMethods(doc, typeIndex);
    return doc;
  }

  return { parseSource, compileFile };
}

// ── Parser initialisation helper ─────────────────────────────────────────────

/**
 * Convenience helper that initialises web-tree-sitter and loads the Utu
 * grammar wasm.  You do NOT have to use this — callers can initialise
 * tree-sitter in whatever way suits their environment.
 *
 * @param {object} opts
 * @param {string | URL} opts.wasmDir
 *   Directory (or URL prefix) that contains both `web-tree-sitter.wasm`
 *   and `tree-sitter-utu.wasm`.  Must end with a path separator.
 * @returns {Promise<import('web-tree-sitter').Parser>}
 *   A fully initialised Parser with the Utu language set.
 */
export async function initParser({ wasmDir }) {
  const { Parser, Language } = await import('web-tree-sitter');
  const resolveWasmPath = (name) => {
    if (wasmDir instanceof URL) return fileURLToPath(new URL(name, wasmDir));
    return `${wasmDir}${name}`;
  };

  await Parser.init({
    // tree-sitter needs to know where its own wasm lives.
    locateFile: resolveWasmPath,
  });

  const parser = new Parser();
  const lang   = await Language.load(resolveWasmPath('tree-sitter-utu.wasm'));
  parser.setLanguage(lang);

  return parser;
}
