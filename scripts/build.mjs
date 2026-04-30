// scripts/build.mjs — Utu build script
//
// Usage:
//   bun run build           — regenerate platform-sources.generated.js only
//   bun run build --grammar — also regenerate src/parser.c + tree-sitter-utu.wasm
//                             from src/grammar.json (requires tree-sitter CLI)
//   bun run build --wasm    — regenerate wasm only (skips grammar.json → parser.c)
//
// Grammar source of truth:
//   grammar.cjs + grammar/rules/*.cjs  →  (manual: tree-sitter generate src/grammar.json)
//                                              ↓
//                                       src/parser.c, src/node-types.json
//                                              ↓  (--wasm)
//                                       tree-sitter-utu.wasm
//
// When you change grammar.cjs / grammar/rules/*.cjs:
//   1. Apply the same change to src/grammar.json (it is the canonical parser input)
//   2. Run `bun run build --grammar` to regenerate parser.c + wasm

import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { build } from 'esbuild';

const ROOT = process.cwd();
const STD_DIR = path.join(ROOT, 'std');
const GRAMMAR_JSON = path.join(ROOT, 'src', 'grammar.json');
const OUT_FILE = path.join(ROOT, 'src', 'compiler', 'platform-sources.generated.js');
const DIST_DIR = path.join(ROOT, 'dist');
const BUNDLE_FILE = path.join(DIST_DIR, 'utu.js');

const args = new Set(process.argv.slice(2));
const buildGrammar = args.has('--grammar') || args.has('--wasm');
const buildWasm    = args.has('--wasm');

async function main() {
  if (buildGrammar) await generateParser();
  await generatePlatformSources();
  await bundlePackage();
}

// ── Parser (parser.c + wasm) ──────────────────────────────────────────────────

async function generateParser() {
  // Use the project-bundled tree-sitter CLI so the emitted grammar's ABI
  // version matches the `web-tree-sitter` runtime we ship with.  Falling
  // back to a system-wide `tree-sitter` often pins a newer/older ABI and
  // silently produces wasm that the runtime refuses to load.
  const cli = path.join(ROOT, 'node_modules', 'tree-sitter-cli', 'tree-sitter');
  console.log('Regenerating parser from src/grammar.json…');
  execSync(`${cli} generate ${GRAMMAR_JSON}`, { cwd: ROOT, stdio: 'inherit' });

  if (buildWasm) {
    console.log('Building wasm…');
    try {
      execSync(`${cli} build --wasm`, { cwd: ROOT, stdio: 'inherit' });
    } catch {
      console.warn('Warning: wasm build failed (emscripten may not be installed). Skipping.');
    }
  }
}

// ── Platform sources ──────────────────────────────────────────────────────────

async function generatePlatformSources() {
  const entries = await loadStdEntries();
  const lines = [
    '// Generated platform source registry.',
    '// Run `bun run build` to refresh from std/*.utu.',
    '',
    'export const PLATFORM_SOURCES = new Map([',
    ...entries.map(({ key, source }) => `  [${JSON.stringify(key)}, ${JSON.stringify(source)}],`),
    ']);',
    '',
  ];
  await fs.writeFile(OUT_FILE, lines.join('\n'));
}

async function loadStdEntries() {
  let dirents = [];
  try {
    dirents = await fs.readdir(STD_DIR, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const files = dirents
    .filter(dirent => dirent.isFile() && dirent.name.endsWith('.utu'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const entries = [];
  for (const file of files) {
    const name = path.basename(file.name, '.utu');
    const key = `std:${name}`;
    const source = await fs.readFile(path.join(STD_DIR, file.name), 'utf8');
    entries.push({ key, source });
  }
  return entries;
}

// ── Published bundle ─────────────────────────────────────────────────────────

async function bundlePackage() {
  await fs.mkdir(DIST_DIR, { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, 'src', 'index.js')],
    outfile: BUNDLE_FILE,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    charset: 'utf8',
    sourcemap: false,
    legalComments: 'none',
    define: {
      process: 'undefined',
      'globalThis.process': 'undefined',
    },
    plugins: [embeddedWasmPlugin(), hostNeutralDependencyPlugin(), nodeBranchStubPlugin()],
  });
}

function embeddedWasmPlugin() {
  return {
    name: 'utu-embedded-wasm',
    setup(buildApi) {
      buildApi.onResolve({ filter: /\/embedded-wasm\.js$/ }, () => ({
        path: 'embedded-wasm',
        namespace: 'utu-embedded',
      }));
      buildApi.onLoad({ filter: /^embedded-wasm$/, namespace: 'utu-embedded' }, async () => {
        const [treeSitterUtu, webTreeSitter] = await Promise.all([
          fs.readFile(path.join(ROOT, 'tree-sitter-utu.wasm')),
          fs.readFile(path.join(ROOT, 'web-tree-sitter.wasm')),
        ]);
        return {
          loader: 'js',
          contents: [
            `export const TREE_SITTER_UTU_WASM_BASE64 = ${JSON.stringify(treeSitterUtu.toString('base64'))};`,
            `export const WEB_TREE_SITTER_WASM_BASE64 = ${JSON.stringify(webTreeSitter.toString('base64'))};`,
          ].join('\n'),
        };
      });
    },
  };
}

function hostNeutralDependencyPlugin() {
  return {
    name: 'utu-host-neutral-dependencies',
    setup(buildApi) {
      buildApi.onLoad({ filter: /node_modules\/web-tree-sitter\/web-tree-sitter\.js$/ }, async ({ path: file }) => {
        let contents = await fs.readFile(file, 'utf8');
        contents = replaceOnce(
          contents,
          `  var ENVIRONMENT_IS_NODE = typeof process == "object" && process.versions?.node && process.type != "renderer";
  if (ENVIRONMENT_IS_NODE) {
    const { createRequire } = await import("module");
    var require = createRequire(import.meta.url);
  }`,
          '  var ENVIRONMENT_IS_NODE = false;',
          'web-tree-sitter node environment branch',
        );
        contents = replaceOnce(
          contents,
          `    } else if (globalThis.process?.versions.node) {
      const fs2 = await import("fs/promises");
      binary2 = await fs2.readFile(input);
    } else {`,
          `    } else if (false) {
      throw new Error("Language.load file paths are disabled in the utu bundle; pass embedded bytes");
    } else {`,
          'web-tree-sitter Language.load node file branch',
        );
        return { loader: 'js', contents };
      });
    },
  };
}

function nodeBranchStubPlugin() {
  return {
    name: 'utu-node-branch-stubs',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^(module|fs|fs\/promises|path|url)$/ }, ({ path: importPath }) => ({
        path: importPath,
        namespace: 'utu-node-stub',
      }));
      buildApi.onLoad({ filter: /.*/, namespace: 'utu-node-stub' }, ({ path: importPath }) => ({
        loader: 'js',
        contents: importPath === 'module'
          ? 'export function createRequire() { return () => { throw new Error("Node require is not available in the utu bundle"); }; }'
          : nodeStubModule(importPath),
      }));
    },
  };
}

function nodeStubModule(importPath) {
  if (importPath === 'fs/promises') {
    return 'export async function readFile() { throw new Error("fs/promises is not available in the utu bundle"); }';
  }
  if (importPath === 'fs') {
    return 'export function readFileSync() { throw new Error("fs is not available in the utu bundle"); }';
  }
  if (importPath === 'path') {
    return 'export function dirname() { throw new Error("path is not available in the utu bundle"); }';
  }
  return 'export function fileURLToPath() { throw new Error("url is not available in the utu bundle"); }';
}

function replaceOnce(contents, from, to, label) {
  if (!contents.includes(from)) {
    throw new Error(`build: could not patch ${label}`);
  }
  return contents.replace(from, to);
}

await main();
