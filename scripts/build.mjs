import { syncWutuRuntime } from './sync-wutu-runtime.mjs';
// scripts/build.mjs — Utu build script
//
// Usage:
//   bun run build           — the self-hosted compiler (dist/utu.wasm, bootstrapped
//                             from stage0/), its JS API (dist/selfhost/), the
//                             host catalog, and the VS Code extension
//   bun run build --grammar — also regenerate the editor grammar's grammar.json
//                             + parser.c (requires the tree-sitter CLI)
//   bun run build --wasm    — the above, plus rebuild tree-sitter-utu.wasm
//                             (requires emscripten)
//   bun run build --docs    — also document the compiler: dist/compiler.pdf
//                             (requires typst; dist/compiler.typ without it)
//
// The editor grammar lives in editors/tree-sitter-utu/. Its grammar.cjs and
// grammar/rules/*.cjs generate src/grammar.json, src/parser.c, and
// src/node-types.json there. --wasm also rebuilds tree-sitter-utu.wasm.
// These artifacts are committed for editor installs without a parser toolchain.

import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { build } from 'esbuild';

const ROOT = process.cwd();
const STD_DIR = path.join(ROOT, 'std');
const OUT_FILE = path.join(ROOT, 'src', 'selfhost', 'platform-sources.generated.js');
const DIST_DIR = path.join(ROOT, 'dist');

const args = new Set(process.argv.slice(2));
const buildGrammar = args.has('--grammar') || args.has('--wasm');
const buildWasm    = args.has('--wasm');
const buildDocs    = args.has('--docs');

async function main() {
  if (buildGrammar) await generateParser();
  await syncWutuRuntime();
  await generatePlatformSources();
  buildCompiler();
  await bundleSelfhost();
  execSync(`node ${path.join('scripts', 'build-catalog.mjs')}`, { cwd: ROOT, stdio: 'inherit' });
  await bundleVscodeExtension();
  if (buildDocs) documentCompiler();
}

// ── Parser (parser.c + wasm) ──────────────────────────────────────────────────

async function generateParser() {
  // Use the project-bundled tree-sitter CLI so the emitted grammar's ABI
  // version matches the editor grammar runtime. Falling
  // back to a system-wide `tree-sitter` often pins a newer/older ABI and
  // silently produces wasm that the runtime refuses to load.
  const cli = path.join(ROOT, 'node_modules', 'tree-sitter-cli', 'tree-sitter');
  // No argument: the CLI resolves grammar.js → grammar.cjs → grammar/rules/*.
  // Passing src/grammar.json instead would make the generated file its own
  // input, so a rule change in the .cjs sources would be silently ignored.
  console.log('Regenerating editor grammar from grammar.cjs…');
  execSync(`${cli} generate`, { cwd: path.join(ROOT, 'editors', 'tree-sitter-utu'), stdio: 'inherit' });

  if (buildWasm) {
    console.log('Building wasm…');
    try {
      execSync(`${cli} build --wasm`, { cwd: path.join(ROOT, 'editors', 'tree-sitter-utu'), stdio: 'inherit' });
    } catch {
      console.warn('Warning: wasm build failed (emscripten may not be installed). Skipping.');
    }
  }
}

// ── The self-hosted compiler ─────────────────────────────────────────────────

// dist/utu.wasm: stage 0 (the checked-in compiler, stage0/utu.wasm) builds
// selfhost/ into stage 1, which builds stage 2; the build fails unless stage 2
// builds itself to the same bytes. Stage -1, the JavaScript compiler, builds
// stage 1 only when stage 0 cannot. A child process, so it reads the platform
// sources just generated.
function buildCompiler() {
  console.log('Building the self-hosted compiler…');
  execSync(`node ${path.join('scripts', 'selfhost-bootstrap.mjs')} --out=${path.join(DIST_DIR, 'utu.wasm')}`, { cwd: ROOT, stdio: 'inherit' });
}

// dist/compiler.pdf: the compiler's doc comments, by tools/utudoc. lib.utu
// (the host interface, and where to start reading) first, then the files in
// the order the compiler is joined: about the order a program goes through it.
function documentCompiler() {
  console.log('Documenting the self-hosted compiler…');
  const order = readFileSync(path.join(ROOT, 'selfhost', 'files.txt'), 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
  const files = ['lib.utu', ...order.filter(name => name !== 'lib.utu')].map(name => path.join('selfhost', name));
  execSync(`node ${path.join('tools', 'utudoc', 'utudoc.mjs')} ${files.join(' ')} -o ${path.join(DIST_DIR, 'compiler.pdf')} --title "The utu compiler"`, { cwd: ROOT, stdio: 'inherit' });
}

// ── Platform sources ──────────────────────────────────────────────────────────

async function generatePlatformSources() {
  const entries = await loadStdEntries();
  assertPreludeResolves(entries);
  const lines = [
    '// Generated platform source registry.',
    '// Run `bun run build` to refresh from std/*.utu.',
    '',
    "import { browserSource, jsSource, webSource, workerSource } from '../bindings/browser.js';",
    "const IR_WASM_PREFIX = 'ir-' + 'wasm-';",
    '',
    'export const PLATFORM_SOURCES = new Map([',
    ...entries.map(({ key, source }) => `  [${JSON.stringify(key)}, ${sourceLiteral(source)}],`),
    ']);',
    "PLATFORM_SOURCES.set('std:Browser', browserSource);",
    "PLATFORM_SOURCES.set('std:JS', jsSource);",
    "PLATFORM_SOURCES.set('std:Web', webSource);",
    "PLATFORM_SOURCES.set('std:Worker', workerSource);",
    '',
  ];
  await fs.writeFile(OUT_FILE, lines.join('\n'));
}

// Registry keys are derived from std/ filenames, so a case-only rename that git
// records on a case-insensitive filesystem silently produces `std:i32` where the
// prelude asks for `std:I32`.  On a case-sensitive checkout that yields an empty
// prelude and every compile fails.  Fail the build here instead.
function assertPreludeResolves(entries) {
  const keys = new Set(entries.map(entry => entry.key));
  const prelude = entries.find(entry => entry.key === 'std:Prelude');
  if (!prelude) {
    throw new Error('build: std/Prelude.utu is missing from the platform source registry');
  }
  const missing = [...prelude.source.matchAll(/\bfrom\s+(std:\w+)/g)]
    .map(match => match[1])
    .filter(key => !keys.has(key));
  if (missing.length) {
    throw new Error(
      `build: std/Prelude.utu imports ${missing.join(', ')} but no std/ file generates ` +
      `${missing.length === 1 ? 'that key' : 'those keys'} (check filename casing)`,
    );
  }
}

function sourceLiteral(source) {
  return `${JSON.stringify(source.replaceAll('ir-wasm-', '@@IR_WASM@@'))}.replaceAll('@@IR_WASM@@', IR_WASM_PREFIX)`;
}

async function loadStdEntries() {
  const entries = [];
  const keys = new Set();
  async function visit(directory) {
    const dirents = await fs.readdir(directory, { withFileTypes: true });
    for (const file of dirents.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const fullPath = path.join(directory, file.name);
      if (file.isDirectory()) { await visit(fullPath); continue; }
      if (!file.isFile() || !file.name.endsWith('.utu')) continue;
      const key = `std:${path.basename(file.name, '.utu')}`;
      if (keys.has(key)) throw new Error(`build: duplicate stdlib key ${key}`);
      keys.add(key);
      entries.push({ key, source: await fs.readFile(fullPath, 'utf8') });
    }
  }
  await visit(STD_DIR);
  return entries;
}

// ── Published bundle ─────────────────────────────────────────────────────────

// dist/selfhost/utu.js: the self-hosted compiler's JavaScript API (the
// driver, the standard library's sources), for editors and pages. The
// browser catalog is a chunk of its own, loaded only by programs that
// import it, and holds its graphs as JSON: larger on disk than the
// committed gzip, but half the size served compressed.
async function bundleSelfhost() {
  await fs.rm(path.join(DIST_DIR, 'selfhost'), { recursive: true, force: true });
  await build({
    plugins: [wasmToolsBrowserPlugin(), {
      name: 'catalog-json',
      setup(api) {
        api.onLoad({ filter: /browser-catalog\.generated\.js$/ }, async ({ path: file }) => {
          const { gunzipSync } = await import('node:zlib');
          const catalog = await import(pathToFileURL(file).href);
          const json = name => JSON.stringify(gunzipSync(Buffer.from(catalog[`${name}_GZIP`], 'base64')).toString());
          return { contents: `export const BROWSER_ABI_JSON = ${json('BROWSER_ABI')};\nexport const WORKER_ABI_JSON = ${json('WORKER_ABI')};\n`, loader: 'js' };
        });
      },
    }],
    entryPoints: { utu: path.join(ROOT, 'src', 'selfhost', 'index.js') },
    outdir: path.join(DIST_DIR, 'selfhost'),
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    chunkNames: '[name]-[hash]',
  });
  // wasm-tools is a lazy WAT viewer dependency. Its WebAssembly payloads are
  // loaded only when the WAT view opens, beside the generated JS chunk.
  const vendor = path.join(ROOT, 'node_modules', '@bytecodealliance', 'jco-transpile', 'vendor');
  await Promise.all(['wasm-tools.core.wasm', 'wasm-tools.core2.wasm'].map(name =>
    fs.copyFile(path.join(vendor, name), path.join(DIST_DIR, 'selfhost', name))));
}

function wasmToolsBrowserPlugin() {
  return {
    name: 'wasm-tools-browser',
    setup(api) {
      api.onResolve({ filter: /^node:process$/ }, () => ({ path: 'process', namespace: 'utu-wat-browser' }));
      // The vendor reaches this dynamic import only in Node; leaving it
      // external lets the same emitted chunk read its assets in Node.
      api.onResolve({ filter: /^node:fs\/promises$/ }, () => ({ path: 'node:fs/promises', external: true }));
      api.onLoad({ filter: /.*/, namespace: 'utu-wat-browser' }, ({ path: name }) => ({
        loader: 'js',
        contents: "export const platform = 'browser';",
      }));
    },
  };
}

async function bundleVscodeExtension() {
  const entry = path.join(ROOT, 'src', 'vscode', 'extension.js');
  const shared = {
    entryPoints: [entry],
    bundle: true,
    platform: 'neutral',
    target: 'es2022',
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    external: ['vscode'],
  };
  await Promise.all([
    build({
      ...shared,
      outfile: path.join(DIST_DIR, 'node', 'extension.cjs'),
      format: 'cjs',
      platform: 'node',
    }),
    build({
      ...shared,
      outfile: path.join(DIST_DIR, 'web', 'extension.cjs'),
      format: 'cjs',
      platform: 'browser',
    }),
  ]);
  // VS Code's web worker extension host currently loads browser entries as
  // CommonJS even when its surrounding test/workbench uses the ESM loader.
  await fs.writeFile(path.join(DIST_DIR, 'web', 'package.json'), '{"type":"commonjs"}\n');
}


await main();
