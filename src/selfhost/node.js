// src/selfhost/node.js — the self-hosted compiler in Node (and Bun).
//
// The host for src/selfhost/compiler.js: files from disk, npm:/node:
// declarations through TypeScript (loaded only when a program imports a
// package), and `@es` glue as a real ES module beside the project's
// node_modules, so a body may import packages and await at the top level.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PLATFORM_SOURCES } from '../compiler/platform-sources.generated.js';
import { compile, instantiate, loadCompiler } from './compiler.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Where `bun run build` puts the compiler: built from stage 0, then by itself. */
export const COMPILER_WASM = path.join(ROOT, 'dist', 'utu.wasm');

/**
 * The compiler's exports, from dist/utu.wasm (or the given bytes and spec).
 * In this repository, one built from other sources than selfhost/'s is
 * refused: it is not the compiler they are.
 */
export async function loadNodeCompiler({ wasm, spec } = {}) {
  if (!wasm) {
    const base = COMPILER_WASM.replace(/\.wasm$/, '');
    if (!fs.existsSync(COMPILER_WASM)) throw new Error(`${COMPILER_WASM} is missing: run \`bun run build\``);
    const sources = currentSources();
    if (sources && sources !== readOr(`${base}.sources`, '').trim()) {
      throw new Error(`${COMPILER_WASM} was built from other sources than selfhost/: run \`bun run build\``);
    }
    wasm = fs.readFileSync(COMPILER_WASM);
    spec = JSON.parse(fs.readFileSync(`${base}.host.json`, 'utf8'));
  }
  return loadCompiler(wasm, spec);
}

/** The hash a compiler's sources are known by. */
export function sourcesHash(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** The hash of selfhost/'s sources as they are, when they are here (in the repository). */
function currentSources() {
  const dir = path.join(ROOT, 'selfhost');
  const list = readOr(path.join(dir, 'files.txt'), null);
  if (list == null) return null;
  // As scripts/selfhost.mjs joins them.
  const text = list.split('\n').map(line => line.trim()).filter(Boolean).map(name => {
    const part = fs.readFileSync(path.join(dir, name), 'utf8');
    return part.endsWith('\n') ? part : `${part}\n`;
  }).join('');
  return sourcesHash(text);
}

function readOr(file, fallback) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return fallback; }
}

/** A host for programs under `root` (where packages and the glue resolve). */
export function nodeHost({ root = process.cwd(), stdlib = PLATFORM_SOURCES } = {}) {
  let packages;
  return {
    stdlib,
    readFile: file => fs.promises.readFile(file, 'utf8'),
    readBinaryFile: file => fs.promises.readFile(file),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
    // TypeScript is only needed when a program imports "npm:…" or "node:…".
    resolvePackage: async (specifier, request) => {
      packages ??= (await import('../../tools/dts/packages.mjs')).nodePackageResolver({ root });
      return packages(specifier, request);
    },
    loadGlue: source => importGlue(source, root),
  };
}

/** Build `entry` (see compile in compiler.js), with files from disk. */
export async function compileFile(utu, entry, options = {}) {
  const file = path.resolve(entry);
  return compile(utu, file, { ...nodeHost({ root: options.root ?? path.dirname(file) }), ...options });
}

/** Instantiate a built module in Node, its glue a real ES module. */
export function instantiateNode(wasm, spec, { root = process.cwd() } = {}) {
  return instantiate(wasm, spec, { loadGlue: source => importGlue(source, root) });
}

/**
 * The glue module's exports: written beside the nearest node_modules (as
 * stage 0's loader does) so its imports resolve as the project's would,
 * named by its hash so concurrent builds share it.
 */
async function importGlue(source, root) {
  const modules = findNodeModules(root);
  const dir = modules ? path.join(modules, '.utu') : fs.mkdtempSync(path.join(os.tmpdir(), 'utu-glue-'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `glue-${createHash('sha256').update(source).digest('hex').slice(0, 16)}.mjs`);
  if (!fs.existsSync(file)) {
    const partial = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(partial, source);
    fs.renameSync(partial, file);
  }
  return import(pathToFileURL(file).href);
}

function findNodeModules(from) {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'node_modules'))) return path.join(dir, 'node_modules');
    if (path.dirname(dir) === dir) return fs.existsSync(path.join(ROOT, 'node_modules')) ? path.join(ROOT, 'node_modules') : null;
  }
}
