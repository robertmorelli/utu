#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { build } from 'esbuild';
import { initParser, createCompiler, emitBinary, formatDiagnostics } from '../../src/index.js';
import { glueModuleSource, liveGlueFields } from '../../src/runtime/host-imports.js';
import { nodePackageResolver } from './packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const size = bytes => ({ raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, brotli: brotliCompressSync(bytes).length });

// What the page does once the module is instantiated: drop the static
// fallback, run main, and say it is ready; or, when it cannot start, say so.
const START = 'document.querySelectorAll("[data-utu-static]").forEach(n=>n.remove());\nawait exports.main?.();\ndocument.documentElement.setAttribute("data-utu-ready","");';
const FAILED = 'document.documentElement.setAttribute("data-utu-error",String(error.message??error));const notice=document.createElement("p");notice.setAttribute("role","status");notice.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.";document.body.append(notice);console.error(error);';

/**
 * Package any UTU main as browser Wasm + minimal generated JS, with no app
 * glue. The self-hosted compiler builds it (`compiler: 'stage0'`, or a
 * custom `stdlib`, uses the JavaScript compiler).
 */
export async function buildBrowserApp({ entry, outDir, stdlib, parser: suppliedParser, optimize = 'size', compiler = 'self' }) {
  if (compiler === 'self' && !stdlib) return buildWithSelfhost({ entry, outDir, optimize });
  const parser = suppliedParser ?? await initParser({ wasmDir: `${ROOT}/` });
  const started = performance.now();
  try {
    const compiler = createCompiler({ parser, target: 'normal', optimize, ...(stdlib ? { stdlib } : {}),
      readFile: file => fs.readFile(file, 'utf8'), resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
      resolvePackage: nodePackageResolver({ root: path.dirname(path.resolve(entry)) }) });
    const doc = await compiler.compileFile(path.resolve(entry));
    const errors = [...doc.querySelectorAll('[data-error]')];
    if (errors.length) {
      const { artifacts, snapshot } = await compiler.analyzeFile(path.resolve(entry));
      throw Object.assign(new Error(describeErrorNodes(errors)), { artifacts, snapshot });
    }
    const wasm = emitBinary(doc);
    const live = await liveGlueFields(wasm);
    const root = doc.body.firstChild;
    const spec = JSON.parse(root.dataset.dslImportsJs ?? '{}');
    const glue = glueModuleSource(spec, live);
    const fields = Object.fromEntries(Object.entries(spec).map(([module, bindings]) =>
      [module, Object.fromEntries(Object.keys(bindings).filter(name => live.has(name)).map(name => [name, '']))]));
    const closures = { new: live.has('closure_new'), calls: [...live].filter(n => n.startsWith('closure_call_')) };
    const declaredPromises = JSON.parse(root.dataset.promiseRuntime ?? '{}');
    const promises = { ops: (declaredPromises.ops ?? []).filter(n => live.has(n)),
      awaits: (declaredPromises.awaits ?? []).filter(n => live.has(`await_${n}`)),
      asyncExports: declaredPromises.asyncExports ?? [] };
    await fs.mkdir(outDir, { recursive: true });
    const gluePath = path.resolve(outDir, 'glue.mjs');
    await fs.writeFile(gluePath, glue);
    await fs.writeFile(path.join(outDir, 'app.wasm'), wasm);
    const runtime = JSON.stringify(path.join(ROOT, 'src/runtime/host-imports.js'));
    const lines = [];
    if (glue) lines.push(`import * as glue from ${JSON.stringify(gluePath)};`, `import { importObjectFromGlue } from ${runtime};`, `const imports = importObjectFromGlue(${JSON.stringify(fields)}, glue);`);
    else lines.push('const imports = {};');
    if (closures.new || closures.calls.length) lines.push(`import { closureImports } from ${runtime};`, `imports.utu = closureImports(${JSON.stringify(closures)}, imports.utu);`);
    if (live.has('js_tag')) lines.push(`import { exceptionImports } from ${runtime};`, 'imports.utu = exceptionImports(imports.utu);');
    if (promises.ops.length) lines.push(`import { promiseImports } from ${runtime};`, `imports.utu = promiseImports(${JSON.stringify(promises)}, imports.utu);`);
    if (promises.awaits.length) lines.push(`import { awaitImports } from ${runtime};`, `imports.utu = awaitImports(${JSON.stringify(promises)}, imports.utu);`);
    lines.push('try {', `const module = await WebAssembly.compileStreaming(fetch(new URL('./app.wasm', import.meta.url)), {builtins:['js-string'],importedStringConstants:"'"});`,
      'const instance = await WebAssembly.instantiate(module, imports);');
    if (promises.asyncExports.length) {lines.unshift(`import { promisifyExports } from ${runtime};`);lines.push(`const exports = promisifyExports(instance, ${JSON.stringify(promises)});`);}
    else lines.push('const exports = instance.exports;');
    lines.push('document.querySelectorAll("[data-utu-static]").forEach(n=>n.remove());', 'await exports.main?.();', 'document.documentElement.setAttribute("data-utu-ready","");', '} catch(error) { document.documentElement.setAttribute("data-utu-error",String(error.message??error));const notice=document.createElement("p");notice.setAttribute("role","status");notice.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.";document.body.append(notice);console.error(error); }');
    await build({ stdin: { contents: lines.join('\n'), resolveDir: ROOT, sourcefile: 'generated-loader.mjs', loader: 'js' },
      outfile: path.join(outDir, 'app.js'), bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', legalComments: 'none' });
    // The intermediate module is not a deployed asset.
    await fs.unlink(gluePath);
    const javascript = await fs.readFile(path.join(outDir, 'app.js'));
    const report = { wasm: size(wasm), javascript: size(javascript), imports: live.size,
      declaredBindings: Object.values(spec).reduce((n, m) => n + Object.keys(m).length, 0), compileMs: Math.round(performance.now() - started) };
    report.total = Object.fromEntries(['raw', 'gzip', 'brotli'].map(key => [key, report.wasm[key] + report.javascript[key]]));
    await fs.writeFile(path.join(outDir, 'sizes.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  } catch (error) {
    // Warnings alone never fail a build, so only report when an error is present.
    const diagnostics = error.artifacts?.diagnostics ?? [];
    if (diagnostics.some(d => d.severity !== 'warning')) {
      throw new Error(await formatDiagnostics(diagnostics, { readFile: file => fs.readFile(file, 'utf8'), snapshot: error.snapshot, color: false }));
    }
    throw error;
  } finally {
    if (!suppliedParser) parser.delete();
  }
}

/** buildBrowserApp with the self-hosted compiler: its module, glue, and loader. */
async function buildWithSelfhost({ entry, outDir, optimize }) {
  const started = performance.now();
  const { compileFile, loadNodeCompiler } = await import('../../src/selfhost/node.js');
  const { glueSource, loaderSource } = await import('../../src/selfhost/loader.js');
  const { formatDiagnostics: format } = await import('../../src/selfhost/format.js');
  const utu = await loadNodeCompiler();
  const result = await compileFile(utu, path.resolve(entry), { optimize });
  // Warnings alone never fail a build.
  const errors = result.diagnostics.filter(d => d.severity !== 'warning');
  if (!result.wasm || errors.length) throw new Error(format(errors, new Map(result.files.map(f => [f.key, f.text]))));
  const { wasm, spec } = result;
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'app.wasm'), wasm);
  const glue = glueSource(spec);
  const gluePath = path.resolve(outDir, 'glue.mjs');
  if (glue) await fs.writeFile(gluePath, glue);
  const loader = loaderSource(spec, wasm, {
    runtime: path.join(ROOT, 'src/runtime/host-imports.js'), glue: glue ? gluePath : null, streaming: true,
    wasm: "fetch(new URL('./app.wasm', import.meta.url))",
  });
  // The loader's statements, with what the page does after, inside one try.
  const lines = loader.trimEnd().split('\n');
  const imports = lines.filter(line => line.startsWith('import '));
  const body = lines.filter(line => !line.startsWith('import ')).map(line => line.replace(/^export const /, 'const '));
  const source = [...imports, 'try {', ...body, START, '} catch (error) {', FAILED, '}'].join('\n');
  await build({ stdin: { contents: source, resolveDir: ROOT, sourcefile: 'generated-loader.mjs', loader: 'js' },
    outfile: path.join(outDir, 'app.js'), bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', legalComments: 'none' });
  // The intermediate module is not a deployed asset.
  if (glue) await fs.unlink(gluePath);
  const javascript = await fs.readFile(path.join(outDir, 'app.js'));
  const imported = WebAssembly.Module.imports(new WebAssembly.Module(wasm, { builtins: ['js-string'], importedStringConstants: "'" }));
  const report = { wasm: size(wasm), javascript: size(javascript), imports: imported.filter(entry => entry.module !== "'").length,
    declaredBindings: Object.values(spec.es ?? {}).reduce((n, m) => n + Object.keys(m).length, 0), compileMs: Math.round(performance.now() - started) };
  report.total = Object.fromEntries(['raw', 'gzip', 'brotli'].map(key => [key, report.wasm[key] + report.javascript[key]]));
  await fs.writeFile(path.join(outDir, 'sizes.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

/** Fallback when no structured diagnostic exists: name each error and where it is. */
function describeErrorNodes(nodes) {
  const lines = nodes.slice(0, 20).map(node => {
    const { file, originFile, row, col } = node.dataset;
    const where = (file ?? originFile) && row ? `${file ?? originFile}:${row}:${col ?? 1}: ` : '';
    return `  ${where}${node.dataset.errorMessage ?? node.dataset.error}`;
  });
  return ['Compilation failed:', ...lines].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const entry = process.argv[2], outDir = process.argv[3];
  if (!entry || !outDir) throw new Error('usage: node tools/dts/build-app.mjs entry.utu output-directory');
  console.log(JSON.stringify(await buildBrowserApp({ entry, outDir }), null, 2));
}
