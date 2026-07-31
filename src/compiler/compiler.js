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
// because source-tree development may choose its own wasm loading mechanism.

import { treeToIR, createIRDocument, restampSubtree } from './parse.js';
import { buildModuleGraph } from './build-graph.js';
import { bringTargetToTopLevel } from './bring-target-to-top-level.js';
import { checkModuleVariance } from './check-module-variance.js';
import { lowerClosures } from './lower-closures.js';
import { checkTypeGraph, projectTypeGraph, settleTypeGraph } from './type-graph.js';
import { lowerPipe } from './lower-pipe.js';
import { inlineImports } from './inline-imports.js';
import { instantiateModules } from './instantiate-modules.js';
import { hoistModules } from './hoist-modules.js';
import { linkTypeDecls } from './link-type-decls.js';
import { resolveBindings } from './resolve-bindings.js';
import { lowerOperators } from './lower-operators.js';
import { expandDsls } from './expand-dsls.js';
import { lowerBackendControl } from './lower-backend-control.js';
import { validateAnalysis } from './validate-analysis.js';
import { createStandardDsls } from './standard-dsls.js';
import { PLATFORM_SOURCES } from './platform-sources.generated.js';
import { stampOriginFile } from './ir-helpers.js';
import { createExplainabilityArtifacts, pushDiagnostic } from './explainability.js';
import { diagnosticFacts } from './diagnostics.js';
import { collectAnalysisDiagnostics } from './collect-analysis-diagnostics.js';
import { createAnalysisSnapshot } from './analysis-snapshot.js';
import { ANALYSIS_TOKENS } from './analysis-tokens.js';
import { collectPreludeModules } from './prelude.js';
import { validateIrStructure } from './validate-ir-structure.js';
import { buildElaborationGraph } from './elaboration-graph.js';
import { refreshProgramIndex } from './program-index.js';
import { rebuildSemanticGraphs } from './semantic-analysis.js';
import { buildBackendPlan, sealBackendPlan } from './backend-plan.js';
import { projectGraphs } from './project-graphs.js';
import {
  buildCallGraph, buildLayoutGraph, buildTypeDeclarationGraph, retainGraph, retainedGraphs,
} from './semantic-graphs.js';
import {
  TREE_SITTER_UTU_WASM_BASE64,
  WEB_TREE_SITTER_WASM_BASE64,
} from './embedded-wasm.js';

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
 * @property {(filePath: string) => Promise<{ doc: Document | null, artifacts: ReturnType<typeof createExplainabilityArtifacts>, snapshot: ReturnType<typeof createAnalysisSnapshot>, graphs: object }>} analyzeFile
 *   Compile a file into IR plus diagnostics, query snapshot, and retained semantic graphs.
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
  const preludeModules = collectPreludeModules({ parser, stdlib, createDocument });

  /**
   * Parse a single source string into a phase-1 IR document.
   * No module resolution — useful for single-file tooling (e.g. diagnostics).
   */
  function parseSource(source, filePath = '') {
    const tree   = parser.parse(source);
    const ir     = treeToIR(tree, source, filePath, createDocument, { collectAnalysisTokens: target === 'analysis' });
    const root   = ir.body.firstChild;
    if (root && filePath) {
      root.setAttribute('data-file', filePath);
      stampOriginFile(root, filePath);
    }
    projectGraphs(ir);
    return ir;
  }

  /**
   * Full pipeline: build graph → inline imports → instantiate modules → hoist.
   * Returns a flat IR document with no modules, no usings, no type params.
   */
  async function compileFile(filePath) {
    const { doc } = await analyzeFile(filePath);
    return doc;
  }

  async function analyzeFile(filePath) {
    const artifacts = createExplainabilityArtifacts();
    try {
      const doc = await compileFileInternal(filePath);
      for (const diagnostic of collectAnalysisDiagnostics(doc)) pushDiagnostic(artifacts, diagnostic);
      const graphs = retainedGraphs(doc);
      const snapshot = createAnalysisSnapshot(doc, artifacts);
      return { doc, artifacts, snapshot, graphs };
    } catch (error) {
      if (error?.diagnostic) pushDiagnostic(artifacts, error.diagnostic);
      const snapshot = createAnalysisSnapshot(null, artifacts);
      throw Object.assign(error, { artifacts, snapshot });
    }
  }

  async function compileFileInternal(filePath) {
    const { graph, order, imports } = await buildModuleGraph(filePath, {
      parser,
      readFile,
      resolvePath,
      stdlib,
      createDocument,
      target,
      debugAssertions,
      collectAnalysisTokens: target === 'analysis',
    });
    debugAssert(graph.get(filePath), 'buildModuleGraph');
    bringTargetToTopLevel(graph.get(filePath), { target, filePath, debugAssertions });
    debugAssert(graph.get(filePath), 'bringTargetToTopLevel');
    const doc = inlineImports(graph, order, { debugAssertions });
    doc.__utuSourceTexts = new Map([...graph].map(([file, sourceDoc]) => [file, sourceDoc.__utuSourceText ?? '']));
    if (target === 'analysis') {
      doc[ANALYSIS_TOKENS] = [...graph.values()].flatMap(sourceDoc => sourceDoc[ANALYSIS_TOKENS] ?? []);
    }
    retainGraph(doc, 'modules', { kind: 'module', files: new Map(graph), order: [...order], imports });
    debugAssert(doc, 'inlineImports');

    // A recovered parse tree is intentionally incomplete. Running module
    // instantiation/hoisting over it can manufacture duplicate declarations
    // or trigger invariants that hide the actionable syntax diagnostics.
    if (doc.querySelector('[data-parse-errors], [data-error-kind="parse-error"], [data-error="parse-error"]')) {
      const root = doc.body.firstChild;
      if (root && !root.dataset.error) root.dataset.error = 'parse-error';
      return doc;
    }

    // ── Prelude injection ─────────────────────────────────────────────────────
    // Prepend standard modules (I32, U32, …, Array) that are not already
    // present in the merged document.  Injected before the first child so
    // they appear as the earliest declarations and are visible to all passes.
    const mergedRoot = doc.body.firstChild;
    if (mergedRoot) {
      for (const { module: modName, path: stdPath } of [...preludeModules].reverse()) {
        if (mergedRoot.querySelector(`ir-module[name="${modName}"]`)) continue;
        const src = stdlib.get(stdPath);
        if (!src) continue;
        const preludeTree = parser.parse(src);
        const preludeDoc  = treeToIR(preludeTree, src, stdPath, createDocument, { collectAnalysisTokens: false });
        doc.__utuSourceTexts?.set(stdPath, src);
        const child = preludeDoc.body.firstChild?.querySelector(`:scope > ir-module[name="${modName}"]`);
        if (!child) continue;
        const clone = doc.importNode?.(child, true) ?? child.cloneNode(true);
        restampSubtree(clone, stdPath, doc);
        clone.dataset.synthetic = 'true';
        clone.dataset.rewritePass = 'compiler-prelude';
        clone.dataset.rewriteKind = 'prelude-module';
        clone.dataset.rewriteOf = child.dataset.originId ?? child.id ?? '';
        clone.dataset.importedFrom = stdPath;
        mergedRoot.insertBefore(clone, mergedRoot.firstChild);
      }
    }
    debugAssert(doc, 'prelude');

    const elaboration = retainGraph(doc, 'elaboration', buildElaborationGraph(doc));
    checkModuleVariance(doc, elaboration);
    debugAssert(doc, 'checkModuleVariance');
    instantiateModules(doc, { debugAssertions, graph: elaboration });
    debugAssert(doc, 'instantiateModules');
    // Elaboration errors can intentionally leave unresolved requests behind.
    // Stop before binding/type passes turn a user-facing arity error into an
    // invariant failure; analyzeFile will collect the stamped diagnostic.
    if (diagnosticFacts(doc).size > 0) return doc;
    lowerPipe(doc, { debugAssertions });
    debugAssert(doc, 'lowerPipe');
    hoistModules(doc, { debugAssertions, graph: elaboration });
    debugAssert(doc, 'hoistModules');
    expandDsls(doc, { dsls: dslRegistry, debugAssertions });
    debugAssert(doc, 'expandDsls');
    refreshProgramIndex(doc);
    // Analysis passes
    let typeIndex = linkTypeDecls(doc, elaboration);
    debugAssert(doc, 'linkTypeDecls', { typeIndex });
    const scopeGraph = resolveBindings(doc);
    retainGraph(doc, 'scope', scopeGraph);
    const retainedCaptures = new Map(scopeGraph.captures);
    debugAssert(doc, 'resolveBindings', { typeIndex, requireBindings: true });
    // Build contexts first. Literals, closures, and implicit struct literals
    // consume them; then one worklist propagates actual types to a fixed point.
    let typeGraph = retainGraph(doc, 'types', settleTypeGraph(doc, typeIndex));
    retainGraph(doc, 'calls', buildCallGraph(doc.body.firstChild, typeGraph));
    projectTypeGraph(typeGraph); // explicit compatibility boundary for typed lowerings
    debugAssert(doc, 'solveTypeGraph', { typeIndex, requireBindings: true });

    // Closure and operator lowering invalidate structure, scope, and resolution
    // facts. They consume this settled graph, then the complete semantic set is
    // rebuilt below rather than transferring hidden attributes across phases.
    if (lowerClosures(doc, typeIndex, typeGraph)) {
      typeIndex = linkTypeDecls(doc, elaboration);
      debugAssert(doc, 'lowerClosures', { typeIndex });
    }
    lowerOperators(doc, typeGraph);

    let semantic = rebuildSemanticGraphs(doc, typeIndex, { captures: retainedCaptures });
    let typedProgram = semantic.program;
    typeGraph = semantic.types;
    elaboration.typeIndex = typeIndex;
    elaboration.layout = retainGraph(doc, 'layout', buildLayoutGraph(typeIndex));
    elaboration.declarations = retainGraph(doc, 'declarations', buildTypeDeclarationGraph(typeIndex));

    projectTypeGraph(typeGraph); // typed validation and backend-control compatibility boundary
    checkTypeGraph(typeGraph);
    debugAssert(doc, 'checkTypeGraph', { typeIndex, requireBindings: true });
    validateAnalysis(doc, typeIndex);
    debugAssert(doc, 'validateAnalysis', { typeIndex, requireBindings: true });

    // Backend control lowering is another destructive boundary. Normal builds
    // receive a fresh canonical graph set for the lowered program; analysis
    // builds retain the checked surface graph unchanged.
    const backendChanged = lowerBackendControl(doc, typeIndex, { target });
    debugAssert(doc, 'lowerBackendControl', { typeIndex, requireBindings: true, target });
    if (backendChanged) {
      semantic = rebuildSemanticGraphs(doc, typeIndex, { captures: retainedCaptures });
      typedProgram = semantic.program;
      typeGraph = semantic.types;
    }

    const backendPlan = retainGraph(doc, 'backend', buildBackendPlan(doc, typeIndex, typedProgram));
    projectGraphs(doc);
    sealBackendPlan(backendPlan);
    return doc;
  }

  function debugAssert(doc, phase, opts = {}) {
    if (!debugAssertions) return;
    validateIrStructure(doc, { phase, ...opts });
  }

  return { parseSource, compileFile, analyzeFile };
}

// ── Parser initialisation helper ─────────────────────────────────────────────

/**
 * Convenience helper that initialises web-tree-sitter and loads the Utu
 * grammar wasm.  You do NOT have to use this — callers can initialise
 * tree-sitter in whatever way suits their environment.
 *
 * @param {object} [opts]
 * @param {string | URL} [opts.wasmDir]
 *   Directory (or URL prefix) that contains both `web-tree-sitter.wasm`
 *   and `tree-sitter-utu.wasm`.  Must end with a path separator.  Optional
 *   in the bundled package, where both wasm files are embedded.
 * @returns {Promise<import('web-tree-sitter').Parser>}
 *   A fully initialised Parser with the Utu language set.
 */
export async function initParser({ wasmDir } = {}) {
  const { Parser, Language } = await import('web-tree-sitter');
  let languageInput;

  if (wasmDir != null) {
    const resolveWasmPath = (name) => {
      if (wasmDir instanceof URL) return fileUrlToPath(new URL(name, wasmDir));
      return `${wasmDir}${name}`;
    };

    await Parser.init({
      // tree-sitter needs to know where its own wasm lives.
      locateFile: resolveWasmPath,
    });
    languageInput = resolveWasmPath('tree-sitter-utu.wasm');
  } else {
    const webTreeSitterWasm = decodeEmbeddedWasm(WEB_TREE_SITTER_WASM_BASE64, 'web-tree-sitter.wasm');
    languageInput = decodeEmbeddedWasm(TREE_SITTER_UTU_WASM_BASE64, 'tree-sitter-utu.wasm');

    await Parser.init({ wasmBinary: webTreeSitterWasm });
  }

  const parser = new Parser();
  const lang   = await Language.load(languageInput);
  parser.setLanguage(lang);

  return parser;
}

function decodeEmbeddedWasm(base64, name) {
  if (typeof base64 !== 'string') {
    throw new Error(`initParser: ${name} is not embedded; pass { wasmDir } when running from the source tree`);
  }
  const binary = decodeBase64(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeBase64(base64) {
  if (typeof atob === 'function') return atob(base64);
  const BufferCtor = globalThis.Buffer;
  if (BufferCtor) return BufferCtor.from(base64, 'base64').toString('binary');
  throw new Error('initParser: no base64 decoder is available in this host');
}

function fileUrlToPath(url) {
  if (url.protocol !== 'file:') return url.href;
  return decodeURIComponent(url.pathname);
}
