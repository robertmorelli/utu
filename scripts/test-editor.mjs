import { access, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { compile } from '../index.js';
import { loadNodeModuleFromSource } from '../loadNodeModuleFromSource.mjs';
import { UtuParserService, createSourceDocument, spanFromOffsets } from '../parser.js';
import { UtuLanguageService, UtuWorkspaceSymbolIndex } from '../lsp_core/languageService.js';
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
  const { grammarWasmPath, runtimeWasmPath } = await loadEditorTestAssets(repoRoot);
  const sharedCompileOptions = {
    runtimeWasmUrl: runtimeWasmPath,
    wasmUrl: grammarWasmPath,
  };
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
    compiledCase('resolves es functions from explicit JS globals', `shimport "es" math_sqrt(f64) f64;

export fun main() f64 {
    math_sqrt(81.0);
}`, {}, async (_, { instantiate }) => {
      globalThis.math = Math;
      try {
        const exports = await instantiate();
        expectValue(await exports.main?.(), 9);
      } finally {
        delete globalThis.math;
      }
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
    compiledCase('resolves namespace paths from node module exports', `shimport "node:path" posix_basename(str) str;

export fun main() str {
    posix_basename("/tmp/demo.txt");
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
      const originalLog = console.log;
      console.log = (line) => {
        logs.push(String(line));
      };
      try {
        const exports = await instantiate();
        expectValue(await exports.main?.(), undefined);
        expectDeepEqual(logs, ['ok']);
      } finally {
        console.log = originalLog;
      }
    }),
    compiledCase('instantiates benchmark modules with es host imports', `${consoleLogImport}

bench "smoke" |i| {
    setup {
        measure {
            "ok" -o console_log;
            i;
        }
    }
}`, {
      mode: 'bench',
    }, async (result, { instantiate }) => {
      const logs = [];
      const originalLog = console.log;
      console.log = (line) => {
        logs.push(String(line));
      };
      try {
        const exports = await instantiate();
        expectValue(await exports[getBenchExport(result)](3), undefined);
        expectDeepEqual(logs, ['ok', 'ok', 'ok']);
      } finally {
        console.log = originalLog;
      }
    }),
  ];

  async function withCompiledModule(sourceText, options, run) {
    const result = await compile(sourceText, { ...sharedCompileOptions, ...options });
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

async function attemptCompile(compilerModule, source, mode, assets) {
  try {
    await compilerModule.compile(source, {
      mode,
      wasmUrl: assets.grammarWasmPath,
      runtimeWasmUrl: assets.runtimeWasmPath,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: firstLine(error?.message ?? error),
    };
  }
}

async function loadIsolatedCompiler(label) {
  return import(new URL(`../index.js?instance=${label}`, import.meta.url).href);
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
