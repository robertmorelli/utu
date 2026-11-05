#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const size = bytes => ({ raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, brotli: brotliCompressSync(bytes).length });

// What the page does once the module is instantiated: drop the static
// fallback, run main, and say it is ready; or, when it cannot start, say so.
const START = 'document.querySelectorAll("[data-utu-static]").forEach(n=>n.remove());\nawait exports.main?.();\ndocument.documentElement.setAttribute("data-utu-ready","");';
// A lazy module's chunk: it only exports; the host page owns readiness (and
// reports a failure, from the error the chunk exports).
const CHUNK_FAILED = 'chunkError = error;';
const FAILED = 'document.documentElement.setAttribute("data-utu-error",String(error.message??error));const notice=document.createElement("p");notice.setAttribute("role","status");notice.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.";document.body.append(notice);console.error(error);';

/** Package any UTU main as browser Wasm and its generated JS loader. */
export async function buildBrowserApp({ entry, outDir, stdlib, optimize = 'size', safe = true }) {
  return buildWithSelfhost({ entry, outDir, stdlib, optimize, safe });
}

/**
 * The chunks of the lazy modules a program calls (`using m lazy from "…"`;
 * the compiler lists what it calls in its host section's `lazy`): for each
 * module's file, a program that exports those functions, built to
 * chunks/<name>-<hash>/ (its app.js and app.wasm, named by their bytes, so
 * they cache safely). Returns each path as written, mapped to its chunk's
 * app.js (relative to the page).
 */
async function buildChunks({ lazy, files, outDir, stdlib, optimize, safe }) {
  const chunks = {};
  await fs.rm(path.join(outDir, 'chunks'), { recursive: true, force: true });
  const byFile = new Map();
  for (const call of lazy) {
    const file = files[call.file]?.key;
    if (!file) throw new Error(`no file for lazy module ${call.module}`);
    if (!byFile.has(file)) byFile.set(file, { module: call.module, paths: new Set(), functions: new Map() });
    const entry = byFile.get(file);
    entry.paths.add(JSON.parse(call.path));
    entry.functions.set(call.name, call.signature);
  }
  for (const [file, { module, paths, functions }] of byFile) {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'wutu-chunk-'));
    const wrapper = path.join(temp, 'chunk.utu');
    const exported = [...functions].map(([name, signature]) => {
      const params = /^\((.*)\) /.exec(signature)[1];
      const args = params ? params.split(', ').map(param => param.split(':')[0]).join(', ') : '';
      return `    fn ${name}${signature.replace(/\) /, ') ')} { ${module}.${name}(${args}); }`;
    });
    await fs.writeFile(wrapper, `using Browser from std:Browser;\nusing ${module} from ${JSON.stringify(file)};\n\nexport lib {\n${exported.join('\n')}\n}\n`);
    try {
      await buildWithSelfhost({ entry: wrapper, outDir: temp, stdlib, optimize, safe, chunk: true });
      const digest = createHash('sha256').update(await fs.readFile(path.join(temp, 'app.wasm'))).update(await fs.readFile(path.join(temp, 'app.js'))).digest('hex').slice(0, 10);
      const name = `${path.basename(file, '.utu')}-${digest}`;
      const target = path.join(outDir, 'chunks', name);
      await fs.mkdir(target, { recursive: true });
      for (const asset of ['app.js', 'app.wasm']) await fs.copyFile(path.join(temp, asset), path.join(target, asset));
      for (const written of paths) chunks[written] = `./chunks/${name}/app.js`;
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
  return chunks;
}

/** buildBrowserApp with the self-hosted compiler: its module, glue, and loader. */
async function buildWithSelfhost({ entry, outDir, stdlib, optimize, safe = true, chunk = false }) {
  const started = performance.now();
  const { compileFile, loadNodeCompiler } = await import('../../src/selfhost/node.js');
  const { glueSource, loaderSource } = await import('../../src/selfhost/loader.js');
  const { formatDiagnostics: format } = await import('../../src/selfhost/format.js');
  const utu = await loadNodeCompiler();
  const result = await compileFile(utu, path.resolve(entry), { optimize, safe, ...(stdlib ? { stdlib } : {}) });
  // Warnings alone never fail a build.
  const errors = result.diagnostics.filter(d => d.severity !== 'warning');
  if (!result.wasm || errors.length) throw new Error(format(errors, new Map(result.files.map(f => [f.key, f.text]))));
  const { wasm, spec } = result;
  // A chunk runs in a page that has std:Wutu's runtime already: it does not ship it again.
  if (chunk) for (const bindings of Object.values(spec.es ?? {}))
    for (const [name, body] of Object.entries(bindings)) if (typeof body === 'string' && body.includes('function createWutuRuntime')) bindings[name] = '() => {}';
  await fs.mkdir(outDir, { recursive: true });
  const chunks = !chunk && spec.lazy?.length ? await buildChunks({ lazy: spec.lazy, files: result.files, outDir, stdlib, optimize, safe }) : {};
  await fs.writeFile(path.join(outDir, 'app.wasm'), wasm);
  const glue = glueSource(spec, wasm);
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
  // Where each lazy module's chunk is (relative to this script), and what
  // calls a lazy module's function (src/runtime/wutu.js's createWutuLazy).
  const lazy = Object.keys(chunks).length > 0;
  if (lazy) imports.push(`import { createWutuLazy } from ${JSON.stringify(path.join(ROOT, 'src/runtime/wutu.js'))};`);
  const chunkMap = lazy
    ? `globalThis.__wutuChunks={...globalThis.__wutuChunks,${Object.entries(chunks).map(([written, url]) => `${JSON.stringify(written)}:new URL(${JSON.stringify(url)},import.meta.url).href`).join(',')}};globalThis.__wutuLazy??=createWutuLazy();`
    : '';
  // A chunk exports its module's functions (runtime lazyCall calls them).
  const source = chunk
    ? [...imports, 'let chunkExports = null, chunkError = null;', 'try {', ...body, 'chunkExports = exports;', '} catch (error) {', CHUNK_FAILED, '}', 'export { chunkExports as exports, chunkError as error };'].join('\n')
    : [...imports, chunkMap, 'try {', ...body, START, '} catch (error) {', FAILED, '}'].join('\n');
  await build({ stdin: { contents: source, resolveDir: ROOT, sourcefile: 'generated-loader.mjs', loader: 'js' },
    outfile: path.join(outDir, 'app.js'), bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', legalComments: 'none' });
  // The intermediate module is not a deployed asset.
  if (glue) await fs.unlink(gluePath);
  const javascript = await fs.readFile(path.join(outDir, 'app.js'));
  const imported = WebAssembly.Module.imports(new WebAssembly.Module(wasm, { builtins: ['js-string'], importedStringConstants: "'" }));
  const report = { wasm: size(wasm), javascript: size(javascript), imports: imported.filter(entry => entry.module !== "'").length,
    declaredBindings: Object.values(spec.es ?? {}).reduce((n, m) => n + Object.keys(m).length, 0), compileMs: Math.round(performance.now() - started) };
  report.total = Object.fromEntries(['raw', 'gzip', 'brotli'].map(key => [key, report.wasm[key] + report.javascript[key]]));
  // Lazy chunks load later: counted apart from the page's total.
  if (!chunk && Object.keys(chunks).length) {
    report.chunks = {};
    for (const url of new Set(Object.values(chunks))) {
      const dir = path.join(outDir, path.dirname(url));
      const bytes = Buffer.concat([await fs.readFile(path.join(dir, 'app.js')), await fs.readFile(path.join(dir, 'app.wasm'))]);
      report.chunks[path.basename(dir)] = size(bytes);
    }
  }
  await fs.writeFile(path.join(outDir, 'sizes.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const entry = process.argv[2], outDir = process.argv[3];
  if (!entry || !outDir) throw new Error('usage: node tools/dts/build-app.mjs entry.utu output-directory');
  console.log(JSON.stringify(await buildBrowserApp({ entry, outDir }), null, 2));
}
