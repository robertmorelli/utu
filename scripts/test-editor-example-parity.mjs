import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { UtuParserService } from '../parser.js';
import { UtuLanguageService } from '../lsp_core/languageService.js';
import {
  loadCliCompilerTestAssets,
  loadPackagedEditorTestAssets,
} from './editor-test-assets.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
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

    const mismatches = results.filter(({ webResult, cliResult }) => webResult.ok !== cliResult.ok);
    const anyCompileSuccess = results.some(({ webResult, cliResult }) => webResult.ok || cliResult.ok);

    if (mismatches.length) {
      failed = true;
      console.log(`FAIL ${rel}`);
      console.log(`  Web/CLI compile parity mismatch.`);
      for (const { mode, webResult, cliResult } of mismatches) {
        console.log(`  [${mode}] web=${formatCompileResult(webResult)} cli=${formatCompileResult(cliResult)}`);
      }
      continue;
    }

    if (!anyCompileSuccess) {
      failed = true;
      console.log(`FAIL ${rel}`);
      console.log(`  Neither the packaged web compiler nor the CLI compiler could compile this example.`);
      for (const { mode, webResult, cliResult } of results) {
        console.log(`  [${mode}] web=${formatCompileResult(webResult)} cli=${formatCompileResult(cliResult)}`);
      }
      continue;
    }

    if (diagnostics.length) {
      failed = true;
      console.log(`FAIL ${rel}`);
      console.log(`  Editor diagnostics were reported for an example that compiles.`);
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

if (failed) {
  process.exit(1);
}

function collectCompileJobs(source) {
  const jobs = [{ mode: 'program' }];
  if (/^\s*test\s+"/m.test(source)) jobs.push({ mode: 'test' });
  if (/^\s*bench\s+"/m.test(source)) jobs.push({ mode: 'bench' });
  return jobs;
}

async function attemptCompile(compiler, source, mode, assets) {
  try {
    await compiler.compile(source, {
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

async function loadWebCompiler(repoRoot) {
  const bundledCompilerPath = resolve(repoRoot, 'vscode', 'dist', 'compiler.web.mjs');

  try {
    await access(bundledCompilerPath);
    return import(`${pathToFileURL(bundledCompilerPath).href}?instance=web-bundle`);
  } catch {
    return loadIsolatedCompiler('web-source');
  }
}

async function collectUtuFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectUtuFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.utu')) {
      files.push(fullPath);
    }
  }

  return files;
}

function createDocument(uri, text) {
  const lines = text.split('\n');

  return {
    uri,
    version: 1,
    getText() {
      return text;
    },
    lineCount: lines.length,
    lineAt(line) {
      return { text: lines[line] ?? '' };
    },
    positionAt(offset) {
      const clamped = Math.max(0, Math.min(offset, text.length));
      let consumed = 0;

      for (let line = 0; line < lines.length; line += 1) {
        const lineText = lines[line];
        const next = consumed + lineText.length;
        if (clamped <= next) {
          return { line, character: clamped - consumed };
        }
        consumed = next + 1;
      }

      return {
        line: Math.max(lines.length - 1, 0),
        character: lines.at(-1)?.length ?? 0,
      };
    },
  };
}

function formatCompileResult(result) {
  return result.ok ? 'ok' : `error(${result.error})`;
}

function formatDiagnostic(diagnostic) {
  const start = diagnostic.range.start;
  return `${diagnostic.message} at ${start.line + 1}:${start.character + 1}`;
}

function firstLine(value) {
  return String(value).split('\n')[0];
}
