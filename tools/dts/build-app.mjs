#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { build } from 'esbuild';
import { initParser, createCompiler, emitBinary } from '../../src/index.js';
import { glueModuleSource, liveGlueFields } from '../../src/runtime/host-imports.js';
import { nodePackageResolver } from './packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Package any UTU main as browser Wasm + minimal generated JS, with no app glue. */
export async function buildBrowserApp({ entry, outDir, stdlib, parser: suppliedParser }) {
  const parser = suppliedParser ?? await initParser({ wasmDir: `${ROOT}/` });
  const started = performance.now();
  try {
    const compiler = createCompiler({ parser, target: 'normal', ...(stdlib ? { stdlib } : {}),
      readFile: file => fs.readFile(file, 'utf8'), resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
      resolvePackage: nodePackageResolver({ root: path.dirname(path.resolve(entry)) }) });
    const doc = await compiler.compileFile(path.resolve(entry));
    const errors = [...doc.querySelectorAll('[data-error]')];
    if (errors.length) throw new Error(errors.slice(0, 10).map(n => n.dataset.errorMessage ?? n.dataset.error).join('\n'));
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
    lines.push(`const module = await WebAssembly.compileStreaming(fetch(new URL('./app.wasm', import.meta.url)), {builtins:['js-string'],importedStringConstants:"'"});`,
      'const instance = await WebAssembly.instantiate(module, imports);');
    if (promises.asyncExports.length) lines.push(`import { promisifyExports } from ${runtime};`, `const exports = promisifyExports(instance, ${JSON.stringify(promises)});`);
    else lines.push('const exports = instance.exports;');
    lines.push('await exports.main?.();');
    await build({ stdin: { contents: lines.join('\n'), resolveDir: ROOT, sourcefile: 'generated-loader.mjs', loader: 'js' },
      outfile: path.join(outDir, 'app.js'), bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', legalComments: 'none' });
    // The intermediate module is not a deployed asset.
    await fs.unlink(gluePath);
    const javascript = await fs.readFile(path.join(outDir, 'app.js'));
    const size = bytes => ({ raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, brotli: brotliCompressSync(bytes).length });
    const report = { wasm: size(wasm), javascript: size(javascript), imports: live.size,
      declaredBindings: Object.values(spec).reduce((n, m) => n + Object.keys(m).length, 0), compileMs: Math.round(performance.now() - started) };
    report.total = Object.fromEntries(['raw', 'gzip', 'brotli'].map(key => [key, report.wasm[key] + report.javascript[key]]));
    await fs.writeFile(path.join(outDir, 'sizes.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {
    if (!suppliedParser) parser.delete();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const entry = process.argv[2], outDir = process.argv[3];
  if (!entry || !outDir) throw new Error('usage: node tools/dts/build-app.mjs entry.utu output-directory');
  console.log(JSON.stringify(await buildBrowserApp({ entry, outDir }), null, 2));
}
