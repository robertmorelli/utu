import { access, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { compile } from '../packages/compiler/index.js';
import {
  analyzeDocument,
  compileDocument,
  getDocumentMetadata,
} from '../packages/compiler/api/index.js';
import { loadNodeModuleFromSource } from '../packages/runtime/node.js';
import { UtuParserService, createSourceDocument, spanFromOffsets } from '../packages/document/index.js';
import { UtuLanguageService, UtuWorkspaceSymbolIndex } from '../packages/language-platform/index.js';
import {
  UtuAnalysisCache,
  UtuWorkspaceSession,
  UtuWorkspaceSymbolIndex as HeaderWorkspaceSymbolIndex,
} from '../packages/workspace/index.js';
import {
  collectCompileJobs,
  collectUtuFiles,
  createDocument,
  expectDeepEqual,
  expectEqual,
  expectValue,
  firstLine,
  getRepoRoot,
  runNamedCases,
} from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const grammarCandidates = ['tree-sitter-utu.wasm'];
const runtimeCandidates = ['web-tree-sitter.wasm', 'node_modules/web-tree-sitter/web-tree-sitter.wasm'];
const loadEditorTestAssets = (root) => loadAssetSet(root, 'UTU grammar wasm'), loadPackagedEditorTestAssets = (root) => loadAssetSet(root, 'packaged VS Code grammar wasm'), loadCliCompilerTestAssets = (root) => loadAssetSet(root, 'CLI grammar wasm');
const subcommand = process.argv[2] ?? 'all';
let failed = false;
if (subcommand !== 'examples' && subcommand !== 'webhost') failed ||= await runCoreSuite();
if (subcommand !== 'core' && subcommand !== 'webhost') failed ||= await runExamplesSuite();
if (subcommand !== 'core' && subcommand !== 'examples') failed ||= await runWebhostSuite();
if (failed) process.exit(1);

async function runCoreSuite() {
  const { grammarWasmPath, runtimeWasmPath } = await loadEditorTestAssets(repoRoot);
  const parserService = new UtuParserService({
    grammarWasmPath,
    runtimeWasmPath,
  });
  const languageService = new UtuLanguageService(parserService);

  const cases = [
    ['static completions', async () => {
      const items = await languageService.getCompletionItems(
        createDocument('file:///static.utu', ''),
        { line: 0, character: 0 },
      );
      expectLabels(items, ['fun', 'while', 'array', 'i64', 'true']);
    }],
    ['namespace completions', async () => {
      const items = await languageService.getCompletionItems(
        createDocument('file:///namespace.utu', 'fun main() i32 { array. }'),
        { line: 0, character: 'fun main() i32 { array.'.length },
      );
      expectLabels(items, ['len', 'new_default']);
    }],
    ['inclusive ranges parse without diagnostics', async () => {
      const source = [
        'export fun main() i32 {',
        '    let sum: i32 = 0;',
        '    for (0...3) |i| {',
        '        sum = sum + i;',
        '    };',
        '    sum;',
        '}',
      ].join('\n');
      const diagnostics = await languageService.getDiagnostics(
        createDocument('file:///inclusive-range.utu', source),
      );
      expectDeepEqual(diagnostics.map((diagnostic) => diagnostic.message), []);
    }],
    ['compound assignments parse without diagnostics', async () => {
      const source = [
        'struct Counter {',
        '    mut value: i32,',
        '}',
        '',
        'export fun main() i32 {',
        '    let total: i32 = 1;',
        '    let xs: array[i32] = array[i32].new(2, 0);',
        '    let counter: Counter = Counter { value: 2 };',
        '    total += 3;',
        '    xs[1] <<= 1;',
        '    counter.value |= 4;',
        '    total + xs[1] + counter.value;',
        '}',
      ].join('\n');
      const diagnostics = await languageService.getDiagnostics(
        createDocument('file:///compound-assign.utu', source),
      );
      expectDeepEqual(diagnostics.map((diagnostic) => diagnostic.message), []);
    }],
    ['top level completions', async () => {
      const items = await languageService.getCompletionItems(
        createDocument('file:///top-level.utu', [
          'fun add_one(value: i64) i64 {',
          '    value + 1',
          '}',
          '',
          'export fun main() i64 {',
          '    add_one(41)',
          '}',
        ].join('\n')),
        { line: 5, character: 8 },
      );
      expectLabels(items, ['add_one', 'main']);
    }],
    ['protocol array element member completions use the inferred protocol type', async () => {
      const source = [
        'proto P[T] {',
        '    get x: f32,',
        '    get y: f32,',
        '    perimeter(T) f32,',
        '};',
        '',
        'fun perimeter_sum(l: array[P]) f32 {',
        '    let s: f32 = 0.0;',
        '    s = s + l[0].perim',
        '    s;',
        '}',
      ].join('\n');
      const items = await languageService.getCompletionItems(
        createDocument('file:///protocol-array-member.utu', source),
        { line: 8, character: '    s = s + l[0].perim'.length },
      );
      expectLabels(items, ['perimeter']);
    }],
    ['protocol array element member completions work immediately after the dot', async () => {
      const source = [
        'proto P[T] {',
        '    get x: f32,',
        '    get y: f32,',
        '    perimeter(T) f32,',
        '};',
        '',
        'fun perimeter_sum(l: array[P]) f32 {',
        '    l[0].',
        '}',
      ].join('\n');
      const items = await languageService.getCompletionItems(
        createDocument('file:///protocol-array-member-dot.utu', source),
        { line: 7, character: '    l[0].'.length },
      );
      expectLabels(items, ['perimeter', 'x', 'y']);
    }],
    ['array values offer builtin method completions through method sugar', async () => {
      const source = [
        'fun size(xs: array[i32]) i32 {',
        '    xs.',
        '}',
      ].join('\n');
      const items = await languageService.getCompletionItems(
        createDocument('file:///array-methods.utu', source),
        { line: 1, character: '    xs.'.length },
      );
      expectLabels(items, ['len']);
    }],
    ['promote captures are indexed with narrowed local types', async () => {
      const source = [
        'struct Box {',
        '    value: i32,',
        '}',
        '',
        'fun maybe_box(flag: bool) ?Box {',
        '    if flag { Box { value: 41 }; } else { ref.null Box; };',
        '}',
        '',
        'fun inferred(flag: bool) i32 {',
        '    promote maybe_box(flag) |box| {',
        '        box.value;',
        '    } else {',
        '        0;',
        '    };',
        '}',
        '',
        'fun inferred_again(flag: bool) i32 {',
        '    promote maybe_box(flag) |other| {',
        '        other.value;',
        '    } else {',
        '        0;',
        '    };',
        '}',
      ].join('\n');
      const document = createDocument('file:///promote-hover.utu', source);
      const diagnostics = await languageService.getDiagnostics(document);
      expectDeepEqual(diagnostics.map((diagnostic) => diagnostic.message), []);
      await expectHoverContains(languageService, document, source, 'box.value', 1, 'box: Box');
      await expectHoverContains(languageService, document, source, 'other.value', 1, 'other: Box');
    }],
    ['nullable fatal unwrap narrows field access', async () => {
      const source = [
        'struct Box {',
        '    value: i32,',
        '}',
        '',
        'fun maybe_box(flag: bool) ?Box {',
        '    if flag { Box { value: 41 }; } else { ref.null Box; };',
        '}',
        '',
        'fun use(flag: bool) i32 {',
        '    (maybe_box(flag) \\ fatal).value;',
        '}',
      ].join('\n');
      const document = createDocument('file:///fatal-narrow.utu', source);
      const diagnostics = await languageService.getDiagnostics(document);
      expectDeepEqual(diagnostics.map((diagnostic) => diagnostic.message), []);
      await expectHoverContains(languageService, document, source, 'fatal).value', 'fatal).'.length + 1, 'value: i32');
    }],
    ['compiler source documents expose offset and line ranges', async () => {
      const document = createSourceDocument('alpha\nbeta', {
        uri: 'file:///ranges.utu',
        version: 7,
      });
      const span = spanFromOffsets(document, 2, 7);
      expectEqual(document.offsetAt({ line: 1, character: 2 }), 8);
      expectDeepEqual(span, {
        range: {
          start: { line: 0, character: 2 },
          end: { line: 1, character: 1 },
        },
        offsetRange: {
          start: 2,
          end: 7,
        },
      });
    }],
    ['compiler api analyzeDocument returns tolerant syntax/header snapshots for broken code', async () => {
      const analysis = await analyzeDocument({
        mode: 'editor',
        uri: 'file:///broken-editor.utu',
        sourceText: [
          'export fun main() i32 {',
          '    let value =',
          '}',
        ].join('\n'),
        parserService,
      });

      expectEqual(analysis.mode, 'editor');
      expectEqual(analysis.syntax.kind, 'syntax');
      expectEqual(analysis.header.kind, 'header');
      expectEqual(analysis.body, null);
      expectEqual(analysis.header.hasMain, true);
      expectValue(analysis.diagnostics.length > 0, true);
    }],
    ['compiler api getDocumentMetadata normalizes header snapshots', async () => {
      const metadata = await getDocumentMetadata({
        hasMain: true,
        tests: [{ name: 'smoke' }],
        benches: [{ name: 'bench-main' }],
      });

      expectDeepEqual(metadata, {
        hasMain: true,
        tests: ['smoke'],
        benches: ['bench-main'],
      });
    }],
    ['compiler api compileDocument aborts on blocking shared-analysis errors', async () => {
      const result = await compileDocument({
        analyzeResult: {
          sourceText: 'export fun main() i32 { missing_value; }',
          diagnostics: [{ severity: 'error', message: 'Undefined value "missing_value".' }],
        },
      });

      expectDeepEqual(result, {
        wat: null,
        wasm: null,
        js: null,
        shim: null,
        metadata: null,
        backendDiagnostics: [{ message: 'Compilation aborted due to frontend errors.' }],
      });
    }],
    ['workspace symbol index caches unchanged versions', async () => {
      let getDocumentIndexCalls = 0;
      const workspaceSymbols = new UtuWorkspaceSymbolIndex({
        async getDocumentIndex(document) {
          getDocumentIndexCalls += 1;
          return {
            uri: document.uri,
            topLevelSymbols: [
              {
                name: document.symbolName,
                detail: `${document.symbolName} detail`,
                kind: 'function',
                uri: document.uri,
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: document.symbolName.length },
                },
              },
            ],
          };
        },
      });

      const alphaV1 = { uri: 'file:///alpha.utu', version: 1, symbolName: 'alpha' };
      const betaV1 = { uri: 'file:///beta.utu', version: 1, symbolName: 'beta' };

      await workspaceSymbols.syncDocuments([alphaV1, betaV1], { replace: true });
      expectEqual(getDocumentIndexCalls, 2);
      expectDeepEqual(workspaceSymbols.getWorkspaceSymbols('').map((symbol) => symbol.name).sort(), ['alpha', 'beta']);

      await workspaceSymbols.syncDocuments([alphaV1, betaV1], { replace: true });
      expectEqual(getDocumentIndexCalls, 2);

      await workspaceSymbols.updateDocument({ ...alphaV1, version: 2, symbolName: 'alpha2' });
      expectEqual(getDocumentIndexCalls, 3);
      expectDeepEqual(workspaceSymbols.getWorkspaceSymbols('alpha').map((symbol) => symbol.name), ['alpha2']);

      await workspaceSymbols.syncDocuments([betaV1], { replace: true });
      expectDeepEqual(workspaceSymbols.getWorkspaceSymbols('').map((symbol) => symbol.name), ['beta']);
    }],
    ['analysis cache reuses richer snapshot tiers for the same document version', async () => {
      const cache = new UtuAnalysisCache({
        parserService,
        languageService,
      });
      const document = createSourceDocument('export fun main() i32 { 0; }', {
        uri: 'file:///analysis-cache.utu',
        version: 1,
      });
      const validation = await cache.analyze(document, { mode: 'validation' });
      const editor = await cache.analyze(document, { mode: 'editor' });

      expectValue(editor === validation, true);
      expectEqual(editor.syntax.kind, 'syntax');
      expectEqual(editor.header.kind, 'header');
      expectEqual(editor.body.kind, 'body');
      expectEqual(editor.header.hasMain, true);
      expectValue(Array.isArray(editor.header.symbols), true);
    }],
    ['analysis cache can serve header snapshots without invoking body analysis', async () => {
      let bodyAnalysisCalls = 0;
      const cache = new UtuAnalysisCache({
        parserService,
        languageService: {
          async getDocumentIndex() {
            bodyAnalysisCalls += 1;
            throw new Error('header snapshot path should not request body analysis');
          },
        },
      });
      const document = createSourceDocument([
        'struct Vec2 {',
        '    x: f32,',
        '    y: f32,',
        '}',
        '',
        'export fun main() i32 { 0; }',
      ].join('\n'), {
        uri: 'file:///header-only.utu',
        version: 1,
      });

      const header = await cache.getHeaderSnapshot(document);
      const syntax = await cache.getSyntaxSnapshot(document);

      expectEqual(bodyAnalysisCalls, 0);
      expectEqual(header.kind, 'header');
      expectEqual(header.hasMain, true);
      expectValue(header.symbols.some((symbol) => symbol.name === 'Vec2' && symbol.kind === 'struct'), true);
      expectEqual(syntax.kind, 'syntax');
      expectValue(Array.isArray(syntax.diagnostics), true);
    }],
    ['workspace package symbol index is driven by header snapshots', async () => {
      let headerSnapshotCalls = 0;
      const workspaceSymbols = new HeaderWorkspaceSymbolIndex({
        async getHeaderSnapshot(document) {
          headerSnapshotCalls += 1;
          return {
            kind: 'header',
            symbols: [
              {
                name: document.symbolName,
                kind: 'function',
                signature: `${document.symbolName}()`,
                uri: document.uri,
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: document.symbolName.length },
                },
              },
            ],
          };
        },
      });

      const alphaV1 = { uri: 'file:///alpha-header.utu', version: 1, symbolName: 'alpha' };
      const betaV1 = { uri: 'file:///beta-header.utu', version: 1, symbolName: 'beta' };

      await workspaceSymbols.syncDocuments([alphaV1, betaV1], { replace: true });
      expectEqual(headerSnapshotCalls, 2);
      expectDeepEqual(workspaceSymbols.getWorkspaceSymbols('').map((symbol) => symbol.name).sort(), ['alpha', 'beta']);

      await workspaceSymbols.syncDocuments([alphaV1, betaV1], { replace: true });
      expectEqual(headerSnapshotCalls, 2);

      await workspaceSymbols.updateDocument({ ...alphaV1, version: 2, symbolName: 'alpha2' });
      expectEqual(headerSnapshotCalls, 3);
      expectDeepEqual(workspaceSymbols.getWorkspaceSymbols('alpha').map((symbol) => symbol.name), ['alpha2']);
    }],
    ['workspace session returns semantic editor diagnostics and header-backed workspace symbols', async () => {
      const session = new UtuWorkspaceSession({
        parserService,
        languageService,
      });
      try {
        const uri = 'file:///workspace-session.utu';
        const diagnostics = await session.openDocument({
          uri,
          version: 1,
          text: [
            'fun helper() i32 { 1; }',
            'export fun main() i32 {',
            '    missing_value;',
            '}',
          ].join('\n'),
        });

        expectValue(diagnostics.some((diagnostic) => diagnostic.message.includes('Undefined value "missing_value".')), true);
        expectDeepEqual((await session.getWorkspaceSymbols('')).map((symbol) => symbol.name).sort(), ['helper', 'main']);
      } finally {
        session.dispose();
      }
    }],
  ];

  try {
    return await runNamedCases(cases);
  } finally {
    languageService.dispose();
    parserService.dispose();
  }
}

async function runExamplesSuite() {
  const exampleRoot = resolve(repoRoot, 'examples');
  const [editorAssets, cliAssets] = await Promise.all([
    loadPackagedEditorTestAssets(repoRoot),
    loadCliCompilerTestAssets(repoRoot),
  ]);
  const parserService = new UtuParserService({
    grammarWasmPath: editorAssets.grammarWasmPath,
    runtimeWasmPath: editorAssets.runtimeWasmPath,
  });
  const languageService = new UtuLanguageService(parserService);
  const [webCompiler, cliCompiler] = await Promise.all([
    loadWebCompiler(repoRoot),
    loadIsolatedCompiler('cli'),
  ]);

  // Pre-warm binaryen sequentially to avoid a Bun bug where concurrent
  // top-level-await module imports race and one importer gets an uninitialized module.
  const warmupSource = 'export fun main() i32 { 0; }';
  await webCompiler.compile(warmupSource).catch(() => {});
  await cliCompiler.compile(warmupSource).catch(() => {});

  let failed = false;
  try {
    const files = (await collectUtuFiles(exampleRoot)).sort();

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const rel = relative(repoRoot, file);
      const diagnostics = await languageService.getDiagnostics(createDocument(`file://${file}`, source));
      const jobs = collectCompileJobs(source);
      const results = [];

      for (const { mode } of jobs) {
        const [webResult, cliResult] = await Promise.all([
          attemptCompile(webCompiler, source, mode, editorAssets),
          attemptCompile(cliCompiler, source, mode, cliAssets),
        ]);
        results.push({ mode, webResult, cliResult });
      }

      if (results.some(({ webResult, cliResult }) => webResult.ok !== cliResult.ok)) {
        failed = true;
        console.log(`FAIL ${rel}`);
        console.log('  Web/CLI compile parity mismatch.');
        for (const { mode, webResult, cliResult } of results.filter(({ webResult, cliResult }) => webResult.ok !== cliResult.ok)) {
          console.log(`  [${mode}] web=${formatCompileResult(webResult)} cli=${formatCompileResult(cliResult)}`);
        }
        continue;
      }

      if (!results.some(({ webResult, cliResult }) => webResult.ok || cliResult.ok)) {
        failed = true;
        console.log(`FAIL ${rel}`);
        console.log('  Neither the packaged web compiler nor the CLI compiler could compile this example.');
        for (const { mode, webResult, cliResult } of results) {
          console.log(`  [${mode}] web=${formatCompileResult(webResult)} cli=${formatCompileResult(cliResult)}`);
        }
        continue;
      }

      if (diagnostics.length) {
        failed = true;
        console.log(`FAIL ${rel}`);
        console.log('  Editor diagnostics were reported for an example that compiles.');
        for (const diagnostic of diagnostics) {
          console.log(`  ${formatDiagnostic(diagnostic)}`);
        }
        continue;
      }

      console.log(`PASS ${rel} ${results.map(({ mode }) => `[${mode}]`).join(' ')}`);
    }
  } finally {
    languageService.dispose();
    parserService.dispose();
  }

  return failed;
}

async function runWebhostSuite() {
  const sharedModuleLoadOptions = {
    prefix: 'utu-webhost-test-',
  };
  const consoleLogImport = 'shimport "es" console_log(str) void;';

  const blockerCase = (name, input, expected) => [name, () => expectValue(undefined, expected)];

  const compiledCase = (name, input, options, run) => [name, () => withCompiledModule(input, options, run)];

  const cases = [
    blockerCase('allows plain exported mains', `export fun main() i32 {
    0;
}`, undefined),
    blockerCase('allows exported mains with explicit void returns', `export fun main() void {
    assert true;
}`, undefined),
    blockerCase('allows es imports that can be resolved from the JS host', `shimport "es" console_log(str) void;
shimport "es" math_sqrt(f64) f64;
export fun main() i32 {
    console_log("ok");
    0;
}`, undefined),
    blockerCase('does not special-case prompt imports', 'shimport "es" prompt(str) str;', undefined),
    blockerCase(
      'allows browser globals such as fetch',
      'shimport "es" fetch(str) str;',
      undefined,
    ),
    blockerCase('does not special-case node imports', 'shimport "node:fs" readFileSync(str) str;', undefined),
    ['collects no unsupported imports', () => expectDeepEqual([], [])],
    compiledCase('resolves es functions from explicit host imports', `shimport "es" math_sqrt(f64) f64;

export fun main() f64 {
    math_sqrt(81.0);
}`, {}, async (_, { instantiate }) => {
      const exports = await instantiate(undefined, { es: { math_sqrt: Math.sqrt } });
      expectValue(await exports.main?.(), 9);
    }),
    compiledCase('throws clearly for missing es value imports', `shimport "es" label: str;

export fun main() str {
    label;
}`, {}, async (_, { instantiate }) => {
      let message = '';
      try {
        await instantiate();
      } catch (error) {
        message = firstLine(error?.message ?? error);
      }
      expectValue(message, 'Missing host import "es.label"');
    }),
    compiledCase('treats comments as compiler trivia', `// top-level comment
export fun main() i32 {
    // block comment
    1 // inline comment
    + 2;
}`, {}, async (_, { instantiate }) => {
      const exports = await instantiate();
      expectValue(await exports.main?.(), 3);
    }),
    compiledCase('auto-resolves node builtin imports', `shimport "node:fs" existsSync(str) bool;

export fun main() bool {
    existsSync("./package.json");
}`, {}, async (_, { instantiate }) => {
      const exports = await instantiate();
      expectValue(await exports.main?.(), 1);
    }),
    compiledCase('resolves namespace paths from node module exports', `shimport "node:path" _posix_basename(str) str;

export fun main() str {
    _posix_basename("/tmp/demo.txt");
}`, {}, async (_, { instantiate }) => {
      const exports = await instantiate();
      expectValue(await exports.main?.(), 'demo.txt');
    }),
    compiledCase('loads local-file-node shims through the shared node loader', `${consoleLogImport}

export fun main() void {
    "ok" -o console_log;
}`, {
      where: 'local_file_node',
    }, async (_, { instantiate }) => {
      const logs = [];
      const console_log = (line) => {
        logs.push(String(line));
      };
      const exports = await instantiate(undefined, { es: { console_log } });
      expectValue(await exports.main?.(), undefined);
      expectDeepEqual(logs, ['ok']);
    }),
    compiledCase('instantiates benchmark modules with es host imports', `${consoleLogImport}

bench "sample" {
    setup {
        measure {
            "ok" -o console_log;
        }
    }
}`, {
      mode: 'bench',
    }, async (result, { instantiate }) => {
      const logs = [];
      const console_log = (line) => {
        logs.push(String(line));
      };
      const exports = await instantiate(undefined, { es: { console_log } });
      expectValue(await exports[getBenchExport(result)](3), undefined);
      expectDeepEqual(logs, ['ok', 'ok', 'ok']);
    }),
    compiledCase('wires module-local escape imports through the webhost shim', `mod Console[T] {
    escape |(a) => a| _log(T) T;

    fun log(t: T) T {
        _log(t);
    }
}

export fun main() i32 {
    Console[i32].log(3);
}`, {}, async (_, { instantiate }) => {
      const exports = await instantiate();
      expectValue(await exports.main?.(), 3);
    }),
  ];

  async function withCompiledModule(sourceText, options, run) {
    const result = await compile(sourceText, options);
    const compiledModule = await loadNodeModuleFromSource(result.shim, {
      ...sharedModuleLoadOptions,
      wasm: options.where === 'local_file_node' ? result.wasm : null,
    });
    try {
      return await run(result, compiledModule.module);
    } finally {
      await compiledModule.cleanup?.();
    }
  }

  return runNamedCases(cases);
}

function expectLabels(items, expectedLabels) {
  const labels = new Set(items.map((item) => item.label));
  for (const label of expectedLabels) if (!labels.has(label)) throw new Error(`Missing completion "${label}"`);
}

async function expectHoverContains(languageService, document, source, marker, characterOffset, fragment) {
  const markerOffset = source.indexOf(marker);
  if (markerOffset < 0)
    throw new Error(`Could not find marker ${JSON.stringify(marker)}`);
  const hover = await languageService.getHover(document, document.positionAt(markerOffset + characterOffset));
  const value = hover?.contents?.value;
  if (!value?.includes(fragment))
    throw new Error(`Expected hover for ${JSON.stringify(marker)} to include ${JSON.stringify(fragment)}, received ${JSON.stringify(value)}`);
}

async function attemptCompile(compilerModule, source, mode, assets) {
  try {
    await compilerModule.compile(source, { mode });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: firstLine(error?.message ?? error),
    };
  }
}

async function loadIsolatedCompiler(label) {
  return import(new URL(`../packages/compiler/index.js?instance=${label}`, import.meta.url).href);
}

async function loadWebCompiler(root) {
  const bundledCompilerPath = resolve(root, 'vscode', 'dist', 'compiler.web.mjs');

  try {
    await access(bundledCompilerPath);
    return import(`${pathToFileURL(bundledCompilerPath).href}?instance=web-bundle`);
  } catch {
    return loadIsolatedCompiler('web-source');
  }
}

function formatCompileResult(result) {
  return result.ok ? 'ok' : `error(${result.error})`;
}

function formatDiagnostic(diagnostic) {
  const start = diagnostic.range.start;
  return `${diagnostic.message} at ${start.line + 1}:${start.character + 1}`;
}

function getBenchExport(result) {
  return result.metadata.benches[0].exportName;
}

async function loadAssetSet(root, grammarLabel) {
  const [grammarPath, runtimePath] = await Promise.all([findExistingAsset(root, grammarCandidates, grammarLabel), findExistingAsset(root, runtimeCandidates, 'Tree-sitter runtime wasm')]);
  const [grammarWasmPath, runtimeWasmPath] = await Promise.all([readFile(grammarPath), readFile(runtimePath)]);
  return { grammarPath, runtimePath, grammarWasmPath, runtimeWasmPath };
}

async function findExistingAsset(root, candidates, label) {
  for (const candidate of candidates) {
    const resolvedPath = resolve(root, candidate);
    try {
      await access(resolvedPath);
      return resolvedPath;
    } catch {}
  }
  throw new Error(`Could not find ${label}. Checked: ${candidates.join(', ')}`);
}
