// scripts/build.mjs — Utu build script
//
// Usage:
//   bun run build           — regenerate platform-sources.generated.js only
//   bun run build --grammar — also regenerate grammar.json + parser.c from
//                             grammar.cjs (requires the tree-sitter CLI)
//   bun run build --wasm    — the above, plus rebuild tree-sitter-utu.wasm
//                             (requires emscripten)
//
// Grammar source of truth — `grammar.cjs` + `grammar/rules/*.cjs`, and nothing
// else.  `tree-sitter generate` reads them through `grammar.js` and emits
// src/grammar.json, src/parser.c, and src/node-types.json; `--wasm` then builds
// tree-sitter-utu.wasm from parser.c.  All four are generated, and all four are
// committed so a clone needs no tree-sitter toolchain.
//
//   grammar.cjs + grammar/rules/*.cjs
//        ↓  (--grammar)  tree-sitter generate
//   src/grammar.json, src/parser.c, src/node-types.json
//        ↓  (--wasm)
//   tree-sitter-utu.wasm
//
// After changing the grammar, run `bun run build --wasm`. Do not hand-edit
// src/grammar.json — it is output, not input.

import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { build } from 'esbuild';

const ROOT = process.cwd();
const STD_DIR = path.join(ROOT, 'std');
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
  await bundleVscodeExtension();
}

// ── Parser (parser.c + wasm) ──────────────────────────────────────────────────

async function generateParser() {
  // Use the project-bundled tree-sitter CLI so the emitted grammar's ABI
  // version matches the `web-tree-sitter` runtime we ship with.  Falling
  // back to a system-wide `tree-sitter` often pins a newer/older ABI and
  // silently produces wasm that the runtime refuses to load.
  const cli = path.join(ROOT, 'node_modules', 'tree-sitter-cli', 'tree-sitter');
  // No argument: the CLI resolves grammar.js → grammar.cjs → grammar/rules/*.
  // Passing src/grammar.json instead would make the generated file its own
  // input, so a rule change in the .cjs sources would be silently ignored.
  console.log('Regenerating parser from grammar.cjs…');
  execSync(`${cli} generate`, { cwd: ROOT, stdio: 'inherit' });

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
  assertPreludeResolves(entries);
  const lines = [
    '// Generated platform source registry.',
    '// Run `bun run build` to refresh from std/*.utu.',
    '',
    "const IR_WASM_PREFIX = 'ir-' + 'wasm-';",
    '',
    'export const PLATFORM_SOURCES = new Map([',
    ...entries.map(({ key, source }) => `  [${JSON.stringify(key)}, ${sourceLiteral(source)}],`),
    ']);',
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
      // Both bare and `node:`-prefixed spellings — binaryen switched to the
      // prefixed form, and an unmatched one fails the bundle outright.
      buildApi.onResolve({ filter: /^(node:)?(module|fs|fs\/promises|path|url)$/ }, ({ path: importPath }) => ({
        path: importPath.replace(/^node:/, ''),
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
