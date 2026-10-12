#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createCompiler, initParser, formatDiagnostics, emitBinary, renderHighlightedSource } from '../src/index.js';
import { glueModuleSource, liveGlueFields, runtimeIsEmpty } from '../src/runtime/host-imports.js';

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
  try {
    await fs.access(file);
  } catch {
    console.error(`${fileArg}: file not found`);
    process.exit(1);
  }
  const optimize = flags.has('-O3') ? 'speed' : 'size';
  const compiler = await makeCompiler(command === 'build-exe' ? 'normal' : 'analysis', optimize);

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

  if (command === 'graph') {
    await writeGraph(compiler, file, process.argv.slice(4));
    return;
  }

  if (command === 'build-exe') {
    await buildExe(compiler, file, process.argv.slice(4));
    return;
  }

  console.error(`unknown command: ${command}`);
  usage(1);
}

async function makeCompiler(target = 'analysis', optimize = 'size') {
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  return createCompiler({
    parser,
    target,
    optimize,
    readFile: (file) => fs.readFile(file, 'utf8'),
    readBinaryFile: (file) => fs.readFile(file),
    resolvePath: (fromFile, importPath) => path.resolve(path.dirname(fromFile), importPath),
    resolvePackage: lazyPackageResolver(),
  });
}

// TypeScript is only needed when a program imports "npm:…" or "node:…".
function lazyPackageResolver() {
  let resolver;
  return async (specifier, request) => {
    resolver ??= (await import('../tools/dts/packages.mjs')).nodePackageResolver({ root: process.cwd() });
    return resolver(specifier, request);
  };
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

// `utu graph <file> [-o out.html]` — render the compiler's graphs over the
// source they came from. Self-contained: no assets, no network.
async function writeGraph(compiler, file, args) {
  const { renderGraphHtml } = await import('../src/compiler/graph-html.js');
  const outFlag = args.indexOf('-o') >= 0 ? args.indexOf('-o') : args.indexOf('--out');
  const out = outFlag >= 0
    ? path.resolve(args[outFlag + 1])
    : path.resolve(`${path.basename(file, '.utu')}.graph.html`);

  const source = await fs.readFile(file, 'utf8');
  let doc;
  try {
    ({ doc } = await compiler.analyzeFile(file));
  } catch (error) {
    doc = error.doc ?? null;
    if (!doc) throw error;
  }
  await fs.writeFile(out, renderGraphHtml(doc, source, file));
  console.error(`wrote ${out}`);
}

async function buildExe(compiler, file, args) {
  const outFlag = args.indexOf('-o') >= 0 ? args.indexOf('-o') : args.indexOf('--out');
  const out = outFlag >= 0 ? path.resolve(args[outFlag + 1]) : path.resolve(path.basename(file, '.utu'));
  const { doc, artifacts, snapshot } = await compiler.analyzeFile(file);
  if (artifacts.diagnostics.length) {
    await printDiagnostics(artifacts.diagnostics, snapshot);
    // Warnings are reported; only errors stop the build.
    if (artifacts.diagnostics.some(d => d.severity !== 'warning')) process.exit(1);
  }

  const wasm = emitBinary(doc);
  const root = doc.body.firstChild;
  const importSpec = JSON.parse(root?.dataset?.dslImportsJs || '{}');
  const declaredClosures = JSON.parse(root?.dataset?.closureRuntime || 'null');
  const mems = JSON.parse(root?.dataset?.mems || '[]').filter(mem => mem.host);
  // Build inside the project when it has dependencies, so `bun build` resolves
  // an `@es` body's bare specifiers exactly as the project's own source would
  // and bundles the result into the executable. Projects without dependencies
  // build in a temp directory as before.
  const dir = await buildDirectory();
  // Only bindings the binary actually imports reach the glue, so a declared but
  // unused `@es` body costs neither bytes nor a package load.
  const live = await liveGlueFields(wasm);
  const glue = glueModuleSource(importSpec, live);
  const fields = Object.fromEntries(Object.entries(importSpec).map(([module, bindings]) =>
    [module, Object.fromEntries(Object.keys(bindings).filter(name => live.has(name)).map(name => [name, '']))]));
  const closureSpec = { new: !!declaredClosures?.new && live.has('closure_new'),
    calls: (declaredClosures?.calls ?? []).filter(name => live.has(name)) };
  if (glue) await fs.writeFile(path.join(dir, 'glue.mjs'), glue);
  const tmp = path.join(dir, 'runner.mjs');
  await fs.writeFile(tmp, runnerSource(wasm, fields, closureSpec, Boolean(glue), mems, live.has('js_tag')));

  const result = spawnSync('bun', ['build', tmp, '--compile', '--outfile', out], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.error(`wrote ${out}`);
}

/** Choose a directory `bun build` can resolve the glue module's imports from. */
async function buildDirectory() {
  const nested = path.join(process.cwd(), 'node_modules', '.utu');
  try {
    await fs.access(path.join(process.cwd(), 'node_modules'));
    await fs.mkdir(nested, { recursive: true });
    return nested;
  } catch {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'utu-cli-'));
  }
}

// The launcher is standalone generated source compiled by `bun build --compile`.
// It imports the runtime by absolute path rather than reimplementing it — that
// module is dependency-free, so bundling it pulls in nothing else, and the exe
// cannot drift from what `buildImportObject` does.
//
// The `@es` glue is a sibling module rather than inline source: a static import
// is what lets `bun build` see an `@es` body's npm dependencies and bundle them
// into the executable.
// Only the pieces the program uses are imported, so a binary that needs no
// closures and no promises carries none of that runtime.
function runnerSource(wasm, importSpec, closureSpec, hasGlue, mems = [], catches = false) {
  const runtime = JSON.stringify(path.join(ROOT, 'src', 'runtime', 'host-imports.js'));
  const needsRuntime = !runtimeIsEmpty(closureSpec, null);
  const parts = [
    hasGlue && `import { importObjectFromGlue } from ${runtime};`,
    hasGlue && `import * as glue from './glue.mjs';`,
    needsRuntime && `import { closureImports } from ${runtime};`,
    mems.length && `import { memoryImports } from ${runtime};`,
    catches && `import { exceptionImports } from ${runtime};`,
  ].filter(Boolean);
  return `#!/usr/bin/env bun
${parts.join('\n')}
const wasmBase64 = ${JSON.stringify(Buffer.from(wasm).toString('base64'))};
const bytes = Uint8Array.from(atob(wasmBase64), c => c.charCodeAt(0));
${hasGlue
    ? `const imports = importObjectFromGlue(${JSON.stringify(importSpec)}, glue);`
    : 'const imports = {};'}
${needsRuntime
    ? `imports.utu = closureImports(${JSON.stringify(closureSpec)});`
    : ''}
${mems.length ? `imports.utu = memoryImports(${JSON.stringify(mems)}, imports.utu ?? {});` : ''}
${catches ? 'imports.utu = exceptionImports(imports.utu ?? {});' : ''}
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
  bun cli/utu.mjs build-exe <file.utu> [-o out] [-Oz | -O3]   (-Oz: smallest, default; -O3: fastest)`);
  process.exit(code);
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
