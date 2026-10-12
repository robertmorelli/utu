import { expandStored } from './stored.js';
import { expandJson } from './json.js';
import { expandWutu } from './wutu.js';
import { lowerIterators } from './lower-iterators.js';
import { lowerForArrays } from './lower-for-arrays.js';
import { lowerGenerators } from './lower-generators.js';
import { lowerMems } from './lower-mems.js';
import { lowerDistinctTypes, lowerIntEnums } from './lower-int-enums.js';
import { lowerTuples } from './lower-tuples.js';
import { ForeignABI, prepareForeignImports } from './foreign-types.js';
import { lowerForeignOperations } from './foreign-lowering.js';
import { boxMutatedCaptures } from './box-captures.js';
import { lowerOptionalChains } from './lower-optional-chains.js';
import { missingArrayElements, nameArrayElements, requestLiteralArrayTypes } from './array-literal-defaults.js';
import { buildExternFn } from './standard-dsls.js';
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

import { parseToIR, createIRDocument, restampSubtree } from './parse.js';
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
import { paramsOf, stampOriginFile } from './ir-helpers.js';
import { createExplainabilityArtifacts, pushDiagnostic } from './explainability.js';
import { compilerError, diagnosticFacts, DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';
import { collectAnalysisDiagnostics } from './collect-analysis-diagnostics.js';
import { createAnalysisSnapshot } from './analysis-snapshot.js';
import { ANALYSIS_TOKENS } from './analysis-tokens.js';
import { collectPreludeModules } from './prelude.js';
import { validateIrStructure } from './validate-ir-structure.js';
import { buildElaborationGraph } from './elaboration-graph.js';
import { refreshProgramIndex } from './program-index.js';
import { rebuildSemanticGraphs, refreshSemanticGraphs, watchEdits } from './semantic-analysis.js';
import { buildBackendPlan, sealBackendPlan } from './backend-plan.js';
import { projectGraphs } from './project-graphs.js';
import {
  buildCallGraph, buildControlFlowGraph, buildLayoutGraph, buildTypeDeclarationGraph, retainGraph, retainedGraphs,
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
 * @property {'size' | 'speed' | 'none'} [optimize] -Oz (default) shares host-call imports and shrinks; -O3 specializes them; -O0 specializes them and skips Binaryen's optimizer
 * @property {(specifier: string, request: { prefix: string, from: string }) => Promise<object>} [resolvePackage]
 *   Link `using X from "npm:pkg"` / `"node:mod"` to a declaration graph. Node
 *   hosts can use tools/dts/packages.mjs; other hosts inject their own.
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
/**
 * With UTU_TIMINGS set, print each pass's time and the element count after
 * it to stderr. Otherwise a no-op.
 */
function passClock(file) {
  if (!globalThis.process?.env?.UTU_TIMINGS) return () => {};
  let last = performance.now();
  const started = last;
  console.error(`utu timings: ${file}`);
  return (name, doc) => {
    const now = performance.now();
    const elements = doc?.querySelectorAll?.('*').length ?? 0;
    console.error(`${(now - last).toFixed(1).padStart(9)} ms ${String(elements).padStart(8)} nodes  ${name}`);
    if (name.startsWith('semantic graphs (type graph 5)')) console.error(`${(now - started).toFixed(1).padStart(9)} ms total`);
    last = performance.now();
  };
}

export function createCompiler(env) {
  const { parser, readFile, resolvePath, resolvePackage = null, readBinaryFile = null, optimize = 'size', stdlib = PLATFORM_SOURCES, dsls = {}, createDocument = createIRDocument, debugAssertions = false, target = 'analysis' } = env;

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
  const comptimeCache = new Map();

  function parseSource(source, filePath = '') {
    const ir     = parseToIR(parser, source, filePath, createDocument, { collectAnalysisTokens: target === 'analysis' });
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
    // Builds need the document, not the editor's analysis snapshot; failures
    // still go through analyzeFile so they carry diagnostics.
    try {
      return await compileFileInternal(filePath);
    } catch {
      const { doc } = await analyzeFile(filePath);
      return doc;
    }
  }

  async function analyzeFile(filePath) {
    const artifacts = createExplainabilityArtifacts();
    try {
      const doc = await compileFileInternal(filePath);
      for (const diagnostic of collectAnalysisDiagnostics(doc)) pushDiagnostic(artifacts, diagnostic);
      const graphs = retainedGraphs(doc);
      // Editors read the snapshot right away; builds only to print diagnostics.
      let snapshot;
      return {
        doc, artifacts, graphs,
        get snapshot() { return snapshot ??= createAnalysisSnapshot(doc, artifacts); },
      };
    } catch (error) {
      if (error?.diagnostic) pushDiagnostic(artifacts, error.diagnostic);
      const snapshot = createAnalysisSnapshot(null, artifacts);
      throw Object.assign(error, { artifacts, snapshot });
    }
  }

  async function compileFileInternal(filePath, arrayElements = []) {
    const clock = passClock(filePath);
    const { graph, order, imports, foreign } = await buildModuleGraph(filePath, {
      parser,
      readFile,
      resolvePath,
      resolvePackage,
      stdlib,
      createDocument,
      target,
      debugAssertions,
      collectAnalysisTokens: target === 'analysis',
    });
    // Str and F64 are JS strings and numbers: programs using declarations get the
    // standard String/Number members even when their packages never mention them.
    const hasString = abi => Object.hasOwn(abi.names, 'String') || abi.types.some(type => type?.lib === 'String');
    // A caught exception is a host value too: `catch |e| { e.message }` needs the JS declarations.
    const catches = [...graph.values()].some(sourceDoc => sourceDoc.querySelector('ir-caught'));
    if ((foreign.size || catches) && ![...foreign.values()].some(hasString) && typeof stdlib.get('std:JS') === 'function') {
      foreign.set('std:JS', (await stdlib.get('std:JS')()).abi);
    }
    const foreignABI = foreign.size ? new ForeignABI(foreign) : null;
    // Any reactive template switches every template to the reconciler, so
    // components can join reactive views.
    const reactiveProject = [...graph.values()].some(sourceDoc => [...sourceDoc.querySelectorAll('ir-dsl')]
      .some(site => /@(?:reactive|island)/.test(site.getAttribute('body') ?? '')));
    for (const sourceDoc of graph.values()) {
      expandSourceDsls(sourceDoc, { parser, createDocument, standardDsls, reactiveProject, expandTemplates: !dsls.wutu });
    }
    if (foreignABI) prepareForeignImports(graph, imports, foreignABI);
    clock('buildModuleGraph + DSLs', graph.get(filePath));
    debugAssert(graph.get(filePath), 'buildModuleGraph');
    bringTargetToTopLevel(graph.get(filePath), { target, filePath, debugAssertions });
    debugAssert(graph.get(filePath), 'bringTargetToTopLevel');
    // Syntax errors in an imported file are reported as such. Inlining its
    // recovered tree would only produce misleading follow-on diagnostics.
    const importedParseErrors = [...graph]
      .filter(([file, sourceDoc]) => file !== filePath && sourceDoc.body.firstChild?.attr?.('data-parse-errors'))
      .map(([file, sourceDoc]) => ({ file, errors: JSON.parse(sourceDoc.body.firstChild.attr('data-parse-errors')) }));
    const doc = importedParseErrors.length ? graph.get(filePath) : inlineImports(graph, order, { debugAssertions });
    if (importedParseErrors.length && doc.body.firstChild) {
      doc.body.firstChild.setAttribute('data-imported-parse-errors', JSON.stringify(importedParseErrors));
    }
    // The entry file's name for std:JS, which mem views are typed with.
    const jsImport = imports.find(({ from, to }) => from === filePath && to === 'std:JS');
    if (jsImport && doc.body.firstChild) {
      doc.body.firstChild.setAttribute('data-js-alias', jsImport.node.getAttribute('alias') ?? jsImport.node.getAttribute('module'));
    }
    // -Oz ('size', the default) or -O3 ('speed'): read by host-call lowering and emitBinary.
    if (doc.body.firstChild) doc.body.firstChild.setAttribute('data-optimize', optimize);
    doc.__utuForeign = foreignABI;
    doc.__utuSourceTexts = new Map([...graph].map(([file, sourceDoc]) => [file, sourceDoc.__utuSourceText ?? '']));
    if (target === 'analysis') {
      doc[ANALYSIS_TOKENS] = [...graph.values()].flatMap(sourceDoc => sourceDoc[ANALYSIS_TOKENS] ?? []);
    }
    retainGraph(doc, 'modules', { kind: 'module', files: new Map(graph), order: [...order], imports });
    debugAssert(doc, 'inlineImports');
    clock('inlineImports', doc);

    // A recovered parse tree is intentionally incomplete. Running module
    // instantiation/hoisting over it can manufacture duplicate declarations
    // or trigger invariants that hide the actionable syntax diagnostics.
    if (doc.hasAttributeBelowRoot('data-parse-errors') || doc.hasAttributeBelowRoot('data-imported-parse-errors')
        || doc.hasAttributeBelowRoot('data-error-kind', 'parse-error') || doc.hasAttributeBelowRoot('data-error', 'parse-error')) {
      const root = doc.body.firstChild;
      if (root && !root.attr('data-error')) root.setAttribute('data-error', 'parse-error');
      return doc;
    }

    // ── Prelude injection ─────────────────────────────────────────────────────
    // Prepend standard modules (I32, U32, …, Array) that are not already
    // present in the merged document.  Injected before the first child so
    // they appear as the earliest declarations and are visible to all passes.
    const mergedRoot = doc.body.firstChild;
    if (mergedRoot) {
      for (const { module: modName, path: stdPath, element: child } of [...preludeModules].reverse()) {
        if (mergedRoot.querySelector(`ir-module[name="${modName}"]`)) continue;
        doc.__utuSourceTexts?.set(stdPath, stdlib.get(stdPath));
        const clone = doc.importNode?.(child, true) ?? child.cloneNode(true);
        restampSubtree(clone, stdPath, doc);
        clone.setAttribute('data-synthetic', 'true');
        clone.setAttribute('data-rewrite-pass', 'compiler-prelude');
        clone.setAttribute('data-rewrite-kind', 'prelude-module');
        clone.setAttribute('data-rewrite-of', child.attr('data-origin-id') ?? child.id ?? '');
        clone.setAttribute('data-imported-from', stdPath);
        mergedRoot.insertBefore(clone, mergedRoot.firstChild);
      }
    }
    debugAssert(doc, 'prelude');
    clock('prelude', doc);

    lowerTuples(doc);
    clock('lowerTuples', doc);
    lowerDistinctTypes(doc, parser, createDocument);
    clock('lowerDistinctTypes', doc);
    lowerIntEnums(doc, parser, createDocument);
    clock('lowerIntEnums', doc);
    await lowerMems(doc, parser, createDocument, { readBinaryFile, resolvePath, evaluateComptime });
    clock('lowerMems', doc);
    lowerGenerators(doc, parser, createDocument);
    clock('lowerGenerators', doc);
    lowerForArrays(doc, parser, createDocument);
    clock('lowerForArrays', doc);
    lowerIterators(doc, parser, createDocument);
    clock('lowerIterators', doc);
    const arrayDefaults = requestLiteralArrayTypes(doc, nameArrayElements(arrayElements, foreignABI));
    const elaboration = retainGraph(doc, 'elaboration', buildElaborationGraph(doc));
    checkModuleVariance(doc, elaboration);
    debugAssert(doc, 'checkModuleVariance');
    clock('elaboration + variance', doc);
    instantiateModules(doc, { debugAssertions, graph: elaboration });
    arrayDefaults?.remove();
    debugAssert(doc, 'instantiateModules');
    clock('instantiateModules', doc);
    // Elaboration errors can intentionally leave unresolved requests behind.
    // Stop before binding/type passes turn a user-facing arity error into an
    // invariant failure; analyzeFile will collect the stamped diagnostic.
    if (diagnosticFacts(doc).size > 0) return doc;
    lowerPipe(doc, { debugAssertions });
    lowerOptionalChains(doc);
    debugAssert(doc, 'lowerPipe');
    clock('lowerPipe + optional chains', doc);
    hoistModules(doc, { debugAssertions, graph: elaboration });
    debugAssert(doc, 'hoistModules');
    clock('hoistModules', doc);
    expandDsls(doc, { dsls: dslRegistry, debugAssertions });
    debugAssert(doc, 'expandDsls');
    clock('expandDsls', doc);
    refreshProgramIndex(doc);
    // Analysis passes
    let typeIndex = linkTypeDecls(doc, elaboration);
    debugAssert(doc, 'linkTypeDecls', { typeIndex });
    clock('programIndex + linkTypeDecls', doc);
    const scopeGraph = resolveBindings(doc);
    retainGraph(doc, 'scope', scopeGraph);
    const retainedCaptures = new Map(scopeGraph.captures);
    debugAssert(doc, 'resolveBindings', { typeIndex, requireBindings: true });
    clock('resolveBindings', doc);
    // Build contexts first. Literals, closures, and implicit struct literals
    // consume them; then one worklist propagates actual types to a fixed point.
    let typeGraph = retainGraph(doc, 'types', settleTypeGraph(doc, typeIndex));
    // `let xs = [a, b]` needs an `Array[T]` instance chosen before typing:
    // request the element types typing discovered and compile once more.
    const requested = new Set(arrayElements.map(request => JSON.stringify(request)));
    const missingArrays = missingArrayElements(doc, typeGraph).filter(request => !requested.has(JSON.stringify(request)));
    if (missingArrays.length) return compileFileInternal(filePath, [...arrayElements, ...missingArrays]);
    retainGraph(doc, 'calls', buildCallGraph(doc.body.firstChild, typeGraph));
    projectTypeGraph(typeGraph); // explicit compatibility boundary for typed lowerings
    debugAssert(doc, 'solveTypeGraph', { typeIndex, requireBindings: true });
    clock('type graph 1', doc);

    if (lowerForeignOperations(typeGraph, buildExternFn)) {
      refreshProgramIndex(doc);
      typeIndex = linkTypeDecls(doc, elaboration);
      retainGraph(doc, 'scope', resolveBindings(doc));
      typeGraph = retainGraph(doc, 'types', settleTypeGraph(doc, typeIndex));
      projectTypeGraph(typeGraph);
    }

    // Captured variables reassigned after capture become shared cells.
    if (boxMutatedCaptures(doc, retainedGraphs(doc).scope, typeGraph)) {
      refreshProgramIndex(doc);
      typeIndex = linkTypeDecls(doc, elaboration);
      retainGraph(doc, 'scope', resolveBindings(doc));
      typeGraph = retainGraph(doc, 'types', settleTypeGraph(doc, typeIndex));
      projectTypeGraph(typeGraph);
    }

    // A closure parameter with no annotation and no context has no representation.
    // Report it before closure conversion needs one.
    const untyped = [...doc.querySelectorAll('ir-closure')].flatMap(paramsOf)
      .filter(param => !param.querySelector(':scope > [name], :scope > *') && !typeGraph.slots.get(param)?.actual);
    for (const param of untyped) {
      stampDiagnostic(param, DIAGNOSTIC_KINDS.UNKNOWN_TYPE,
        `Cannot infer the type of closure parameter '${param.getAttribute('name')}'; annotate it or pass the closure where its type is known`,
        { parameter: param.getAttribute('name') });
    }
    if (untyped.length) { projectGraphs(doc); return doc; }
    clock('foreign ops + boxed captures (type graphs 2-3)', doc);

    // The program as written is checked: diagnostics, the editor's graphs,
    // and its explain views all describe the surface program (operators are
    // checked as the calls they will lower to). Analysis stops here, as does
    // a build with errors.
    elaboration.typeIndex = typeIndex;
    elaboration.layout = retainGraph(doc, 'layout', buildLayoutGraph(typeIndex));
    elaboration.declarations = retainGraph(doc, 'declarations', buildTypeDeclarationGraph(typeIndex));
    retainGraph(doc, 'calls', buildCallGraph(doc.body.firstChild, typeGraph));
    retainGraph(doc, 'controlFlow', buildControlFlowGraph(doc.body.firstChild, retainedGraphs(doc).program));
    projectTypeGraph(typeGraph);
    checkTypeGraph(typeGraph);
    debugAssert(doc, 'checkTypeGraph', { typeIndex, requireBindings: true });
    validateAnalysis(doc, typeIndex);
    debugAssert(doc, 'validateAnalysis', { typeIndex, requireBindings: true });
    clock('check + validate', doc);
    if (target === 'analysis') {
      const plan = retainGraph(doc, 'backend', buildBackendPlan(doc, typeIndex, retainedGraphs(doc).program));
      projectGraphs(doc);
      sealBackendPlan(plan);
      return doc;
    }
    if (diagnosticFacts(doc).size > 0) { projectGraphs(doc); return doc; }

    // Closure and operator lowering edit the program. They consume this
    // settled graph; the graphs are then brought up to date for what they
    // changed (refreshSemanticGraphs), and debug builds check that against
    // a full settle.
    let edits = watchEdits(doc);
    if (lowerClosures(doc, typeIndex, typeGraph)) {
      typeIndex = linkTypeDecls(doc, elaboration);
      debugAssert(doc, 'lowerClosures', { typeIndex });
    }
    lowerOperators(doc, typeGraph);
    clock('lowerClosures + lowerOperators', doc);

    let semantic = refreshSemanticGraphs(doc, typeIndex, typeGraph, edits(), { captures: retainedCaptures, check: debugAssertions });
    let typedProgram = semantic.program;
    typeGraph = semantic.types;
    if (typeGraph.lastRefresh) clock(`  refreshed ${typeGraph.lastRefresh.dirty} of ${typeGraph.lastRefresh.nodes} nodes`, null);
    elaboration.typeIndex = typeIndex;
    elaboration.layout = retainGraph(doc, 'layout', buildLayoutGraph(typeIndex));
    elaboration.declarations = retainGraph(doc, 'declarations', buildTypeDeclarationGraph(typeIndex));

    projectTypeGraph(typeGraph); // backend-control compatibility boundary
    clock('semantic graphs (type graph 4)', doc);

    // Backend control lowering is another destructive boundary. Normal builds
    // receive a fresh canonical graph set for the lowered program; analysis
    // builds retain the checked surface graph unchanged.
    edits = watchEdits(doc);
    const backendChanged = lowerBackendControl(doc, typeIndex, { target });
    const backendEdits = edits();
    debugAssert(doc, 'lowerBackendControl', { typeIndex, requireBindings: true, target });
    clock('lowerBackendControl', doc);
    if (backendChanged) {
      semantic = refreshSemanticGraphs(doc, typeIndex, typeGraph, backendEdits, { captures: retainedCaptures, check: debugAssertions });
      typedProgram = semantic.program;
      typeGraph = semantic.types;
    }

    const backendPlan = retainGraph(doc, 'backend', buildBackendPlan(doc, typeIndex, typedProgram));
    projectGraphs(doc);
    sealBackendPlan(backendPlan);
    clock('semantic graphs (type graph 5) + backend plan', doc);
    return doc;
  }

  /**
   * `@comptime/\ expr \/` initializers: compile `source` (the entry file
   * trimmed by lowerMems) once, with one export per expression that evaluates
   * it to an Array, run them, and return each one's elements.
   */
  async function evaluateComptime({ file, source, items }) {
    const key = `${JSON.stringify(items.map(({ expression, valueType }) => [expression, valueType]))}\0${source}`;
    if (comptimeCache.has(key)) return comptimeCache.get(key);
    const types = [...new Set(items.map(item => item.valueType))];
    const program = `${source}
export lib {
${items.map(({ expression, valueType }, k) => `    fn __utu_comptime_${k}() Array[${valueType}] { ${expression}; }`).join('\n')}
${types.map(type => `    fn __utu_comptime_len_${type}(values: Array[${type}]) I32 { values.len(); }
    fn __utu_comptime_at_${type}(values: Array[${type}], i: I32) ${type} { values[i]; }`).join('\n')}
}
`;
    const virtual = `${file.replace(/\.utu$/, '')}.comptime.utu`;
    const nested = createCompiler({
      // Only the values matter: skip Binaryen's optimizer.
      ...env, target: 'normal', optimize: 'none',
      readFile: path => (path === virtual ? Promise.resolve(program) : readFile(path)),
    });
    const fail = (message, site) => compilerError(DIAGNOSTIC_KINDS.TYPE_MISMATCH, message, site);
    const { doc: built } = await nested.analyzeFile(virtual)
      .catch(error => { throw fail(`@comptime: ${error.message}`, items[0].site); });
    const problems = collectAnalysisDiagnostics(built);
    if (problems.length) {
      // The trimmed copy keeps the entry file's line numbers.
      const row = problems[0].primary?.row;
      const site = items.find(item => item.site.attr('data-row') != null && Number(item.site.attr('data-row')) === row)?.site ?? items[0].site;
      throw fail(`@comptime: ${problems[0].message}${row != null ? ` (line ${row})` : ''}`, site);
    }
    const { emitBinary, buildImportObject, instantiateLowered } = await import('../index.js');
    const wasm = emitBinary(built);
    const { instance } = await instantiateLowered(wasm, await buildImportObject(built, { wasm }));
    const exports = instance.exports;
    const results = items.map(({ expression, valueType, site }, k) => {
      try {
        const values = exports[`__utu_comptime_${k}`]();
        const count = exports[`__utu_comptime_len_${valueType}`](values);
        const elements = Array.from({ length: count }, (_, i) => exports[`__utu_comptime_at_${valueType}`](values, i));
        return valueType === 'U32' ? elements.map(value => value >>> 0) : elements;
      } catch (error) {
        throw fail(`@comptime ${expression} failed: ${error.message}`, site);
      }
    });
    comptimeCache.set(key, results);
    return results;
  }

  function debugAssert(doc, phase, opts = {}) {
    if (!debugAssertions) return;
    validateIrStructure(doc, { phase, ...opts });
  }

  return { parseSource, compileFile, analyzeFile };
}

const SOURCE_DSLS = new Set(['utu', 'css', 'wutu', 'stored', 'json']);
const MAX_DSL_ROUNDS = 100;

/**
 * Expand the built-in source DSLs. They can produce one another (Wutu inside
 * Utu inside Wutu), so expansion repeats until a round introduces nothing new.
 */
function expandSourceDsls(sourceDoc, { parser, createDocument, standardDsls, reactiveProject, expandTemplates }) {
  const pending = () => [...sourceDoc.querySelectorAll('ir-dsl')].filter(site => SOURCE_DSLS.has(site.getAttribute('name')));
  for (let round = 0; round < MAX_DSL_ROUNDS; round++) {
    const before = pending();
    if (!before.length) return;
    expandDsls(sourceDoc, { dsls: { utu: standardDsls.utu, css: standardDsls.css } });
    expandStored(sourceDoc, parser, createDocument);
    expandJson(sourceDoc, parser, createDocument);
    if (expandTemplates) expandWutu(sourceDoc, parser, createDocument, reactiveProject);
    if (pending().every(site => before.includes(site))) return;
  }
  throw new Error('Recursive DSL expansion limit exceeded');
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

  const lang = await Language.load(languageInput);
  const parser = new Parser();
  try {
    parser.setLanguage(lang);
    return parser;
  } catch (error) {
    parser.delete();
    throw error;
  }
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
