#!/usr/bin/env bun

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'bun';
import { createCompiler, initParser, formatDiagnostics, emitBinary, renderHighlightedSource } from '../src/index.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const DISPLAY_FILTERS = new Map([
  ['display:tests', new Set(['ir-test'])],
  ['display:benches', new Set(['ir-bench'])],
  ['display:modules', new Set(['ir-module'])],
  ['display:exports', new Set(['ir-export-lib', 'ir-export-main'])],
]);

async function main() {
  const [command, fileArg] = process.argv.slice(2);
  const flags = new Set(process.argv.slice(4));

  if (!command || command === '-h' || command === '--help') {
    usage(0);
  }

  if (!fileArg) {
    console.error('missing file');
    usage(1);
  }

  const file = path.resolve(process.cwd(), fileArg);
  const compiler = await makeCompiler(command === 'build-exe' ? 'normal' : 'analysis');

  if (command === 'check') {
    await checkFile(compiler, file);
    return;
  }

  if (command === 'display' || DISPLAY_FILTERS.has(command)) {
    await displayFile(compiler, file, DISPLAY_FILTERS.get(command), { showLineNumbers: command !== 'display' && !flags.has('--noln') });
    return;
  }

  if (command === 'display:debug') {
    await displayDebugFile(compiler, file, { showLineNumbers: false });
    return;
  }

  if (command === 'build-exe') {
    await buildExe(compiler, file, process.argv.slice(4));
    return;
  }

  console.error(`unknown command: ${command}`);
  usage(1);
}

async function makeCompiler(target = 'analysis') {
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  return createCompiler({
    parser,
    target,
    readFile: (file) => fs.readFile(file, 'utf8'),
    resolvePath: (fromFile, importPath) => path.resolve(path.dirname(fromFile), importPath),
  });
}

async function checkFile(compiler, file) {
  try {
    const { artifacts, snapshot } = await compiler.analyzeFile(file);
    await printDiagnostics(artifacts.diagnostics, snapshot);
    process.exitCode = artifacts.diagnostics.some(d => d.severity === 'error') ? 1 : 0;
  } catch (error) {
    const diagnostics = error.artifacts?.diagnostics ?? [];
    if (diagnostics.length > 0) {
      await printDiagnostics(diagnostics, error.snapshot);
    } else {
      console.error(error?.stack || error?.message || String(error));
    }
    process.exitCode = 1;
  }
}

async function displayFile(compiler, file, sectionTags = null, options = {}) {
  const source = await fs.readFile(file, 'utf8');
  const { snapshot } = await compiler.analyzeFile(file);
  renderSource(file, source, snapshot, sectionTags, {
    showLineNumbers: options.showLineNumbers ?? sectionTags != null,
    showDiagnostics: false,
  });
}

async function displayDebugFile(compiler, file, options = {}) {
  const source = await fs.readFile(file, 'utf8');
  const { artifacts, snapshot } = await compiler.analyzeFile(file);
  if (artifacts.diagnostics.length) {
    await printDiagnostics(artifacts.diagnostics, snapshot);
    process.exitCode = 1;
    return;
  }
  renderSource(file, source, snapshot, null, {
    showLineNumbers: options.showLineNumbers ?? false,
    showDiagnostics: false,
  });
}

async function buildExe(compiler, file, args) {
  const outFlag = args.indexOf('-o') >= 0 ? args.indexOf('-o') : args.indexOf('--out');
  const out = outFlag >= 0 ? path.resolve(args[outFlag + 1]) : path.resolve(path.basename(file, '.utu'));
  const { doc, artifacts, snapshot } = await compiler.analyzeFile(file);
  if (artifacts.diagnostics.length) {
    await printDiagnostics(artifacts.diagnostics, snapshot);
    process.exit(1);
  }

  const wasm = emitBinary(doc);
  const root = doc.body.firstChild;
  const importSpec = JSON.parse(root?.dataset?.dslImportsJs || '{}');
  const closureSpec = JSON.parse(root?.dataset?.closureRuntime || 'null');
  const runner = runnerSource(wasm, importSpec, closureSpec);
  const tmp = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'utu-cli-')), 'runner.mjs');
  await fs.writeFile(tmp, runner);

  const result = spawnSync(['bun', 'build', tmp, '--compile', '--outfile', out], {
    cwd: process.cwd(),
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
  console.error(`wrote ${out}`);
}

// The launcher is standalone generated source compiled by `bun build --compile`.
// It imports the runtime by absolute path rather than reimplementing it — that
// module is dependency-free, so bundling it pulls in nothing else, and the exe
// cannot drift from what `buildImportObject` does.
function runnerSource(wasm, importSpec, closureSpec) {
  const runtime = path.join(ROOT, 'src', 'runtime', 'host-imports.js');
  return `#!/usr/bin/env bun
import { utuRuntimeImports } from ${JSON.stringify(runtime)};
const wasmBase64 = ${JSON.stringify(Buffer.from(wasm).toString('base64'))};
const importSpec = ${JSON.stringify(importSpec)};
const closureSpec = ${JSON.stringify(closureSpec)};
const bytes = Uint8Array.from(atob(wasmBase64), c => c.charCodeAt(0));
const imports = {};
for (const [module, fields] of Object.entries(importSpec)) {
  imports[module] = {};
  for (const [field, body] of Object.entries(fields ?? {})) {
    const value = new Function('return (' + body + ');')();
    imports[module][field] = typeof value === 'function' ? value : () => value;
  }
}
Object.assign(imports.utu ??= {}, utuRuntimeImports(closureSpec));
const compiled = await WebAssembly.compile(bytes, { builtins: ['js-string'], importedStringConstants: "'" });
const instance = await WebAssembly.instantiate(compiled, imports);
if (typeof instance.exports.main === 'function') {
  const result = instance.exports.main();
  if (result !== undefined) console.log(result);
}
`;
}

function renderSource(file, source, snapshot, sectionTags = null, options = {}) {
  const rendered = renderHighlightedSource({
    file,
    source,
    snapshot,
    sectionTags,
    showLineNumbers: options.showLineNumbers ?? true,
    showDiagnostics: options.showDiagnostics ?? false,
  });
  if (rendered) console.log(rendered);
}

async function printDiagnostics(diagnostics, snapshot) {
  if (!diagnostics?.length) {
    console.log('ok');
    return;
  }

  console.log(await formatDiagnostics(diagnostics, { readFile: (file) => fs.readFile(file, 'utf8'), snapshot }));
}

async function printSourceLine(file, start, end) {
  const source = await fs.readFile(file, 'utf8');
  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nextNewline = source.indexOf('\n', start);
  const lineEnd = nextNewline === -1 ? source.length : nextNewline;
  const line = source.slice(lineStart, lineEnd);
  const colStart = Math.max(0, start - lineStart);
  const colEnd = Math.max(colStart + 1, Math.min(line.length, end - lineStart));
  const lineNo = source.slice(0, lineStart).split('\n').length;

  console.log(`\n${file}:${lineNo}:${colStart + 1}`);
  console.log(line);
  console.log(`${' '.repeat(colStart)}\x1b[31m${'^'.repeat(Math.max(1, colEnd - colStart))}\x1b[0m`);
}

function usage(code) {
  console.log(`usage:
  bun cli/utu.mjs check <file.utu>
  bun cli/utu.mjs display <file.utu>
  bun cli/utu.mjs display:tests <file.utu> [--noln]
  bun cli/utu.mjs display:benches <file.utu> [--noln]
  bun cli/utu.mjs display:modules <file.utu> [--noln]
  bun cli/utu.mjs display:exports <file.utu> [--noln]
  bun cli/utu.mjs display:debug <file.utu>
  bun cli/utu.mjs build-exe <file.utu> [-o out]`);
  process.exit(code);
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
