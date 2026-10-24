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
import { isBuiltin } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PLATFORM_SOURCES } from '../compiler/platform-sources.generated.js';
import { compile, instantiate, loadCompiler } from './compiler.js';
import { catalogStdlib } from './catalog.js';

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
    if (!builtFromCurrentSources(`${base}.sources`)) {
      throw new Error(`${COMPILER_WASM} was built from other sources than selfhost/: run \`bun run build\``);
    }
    wasm = fs.readFileSync(COMPILER_WASM);
    spec = JSON.parse(fs.readFileSync(`${base}.host.json`, 'utf8'));
  }
  return loadCompiler(wasm, spec);
}

/**
 * The hash a compiler's sources are known by: their code, without comments
 * or the spacing between tokens (documenting the compiler does not change it).
 */
export function sourcesHash(text) {
  return createHash('sha256').update(codeOf(text)).digest('hex');
}

// The text, its comments out and each run of space one space. Strings,
// template strings, and DSL bodies are kept as written: when unsure, text is
// kept, so a change is never missed for a comment.
// Linear: pieces joined once (appending a character at a time, and asking
// endsWith of the result, is quadratic in Node).
function codeOf(text) {
  const out = [];
  let spaced = true;  // nothing yet, or a space last: no space to add
  const space = /\s+/y;
  const plain = /[^\s/"`]+|\//y;
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
    } else if (/\s/.test(c)) {
      space.lastIndex = i;
      space.test(text);
      i = space.lastIndex;
      if (!spaced) out.push(' ');
      spaced = true;
    } else if (c === '"' || c === '`' || (c === '/' && text[i + 1] === '\\')) {
      let j;
      if (c === '/') {
        j = text.indexOf('\\/', i + 1);
        j = j < 0 ? text.length + 2 : j + 2;
      } else {
        j = i + 1;
        while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
        j += 1;
      }
      out.push(text.slice(i, j));
      spaced = false;
      i = j;
    } else {
      plain.lastIndex = i;
      plain.test(text);
      out.push(text.slice(i, plain.lastIndex));
      spaced = false;
      i = plain.lastIndex;
    }
  }
  return out.join('').trimEnd();
}

const SELFHOST = path.join(ROOT, 'selfhost');

/** selfhost/'s source files (with files.txt), or null outside the repository. */
function sourceFiles() {
  const list = readOr(path.join(SELFHOST, 'files.txt'), null);
  if (list == null) return null;
  return list.split('\n').map(line => line.trim()).filter(Boolean);
}

/** The hash of selfhost/'s sources as they are, as scripts/selfhost.mjs joins them. */
function currentSources(files) {
  return sourcesHash(files.map(name => {
    const part = fs.readFileSync(path.join(SELFHOST, name), 'utf8');
    return part.endsWith('\n') ? part : `${part}\n`;
  }).join(''));
}

/** Each source's time and size: when all are as recorded, the sources are. */
function sourceStamps(files) {
  return Object.fromEntries([...files, 'files.txt'].map(name => {
    const s = fs.statSync(path.join(SELFHOST, name));
    return [name, [s.mtimeMs, s.size]];
  }));
}

/** What the build records of its sources: their hash, and their stamps. */
export function sourcesRecord(text) {
  const files = sourceFiles();
  return { hash: sourcesHash(text), stamps: files ? sourceStamps(files) : {} };
}

// Whether the compiler at `record` was built from selfhost/ as it is (true
// outside the repository): by the files' stamps, and when one differs (a
// checkout, a touch) by their hash, then recording the new stamps so the
// next run need not hash.
function builtFromCurrentSources(record) {
  const files = sourceFiles();
  if (!files) return true;
  let recorded;
  try { recorded = JSON.parse(fs.readFileSync(record, 'utf8')); } catch { return false; }
  const now = sourceStamps(files);
  if (JSON.stringify(now) === JSON.stringify(recorded.stamps)) return true;
  if (currentSources(files) !== recorded.hash) return false;
  try {
    const partial = `${record}.${process.pid}.tmp`;
    fs.writeFileSync(partial, `${JSON.stringify({ hash: recorded.hash, stamps: now })}\n`);
    fs.renameSync(partial, record);
  } catch {}
  return true;
}

function readOr(file, fallback) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return fallback; }
}

// The platform's declarations ready to read, when `bun run build` has made them.
const CATALOG = path.join(ROOT, 'dist', 'selfhost', 'catalog');
let platform;

/** The standard library, its host declarations from the catalog when there is one. */
export function nodeStdlib() {
  return platform ??= fs.existsSync(path.join(CATALOG, 'catalog.json'))
    ? catalogStdlib(PLATFORM_SOURCES, name => fs.promises.readFile(path.join(CATALOG, name)))
    : PLATFORM_SOURCES;
}

/** A host for programs under `root` (where packages and the glue resolve). */
export function nodeHost({ root = process.cwd(), stdlib = nodeStdlib() } = {}) {
  let packages;
  return {
    stdlib,
    // Files are small and read whole: a sync read costs a fraction of an async one.
    readFile: Object.assign(async file => fs.readFileSync(file, 'utf8'), { bytes: async file => fs.readFileSync(file) }),
    readBinaryFile: async file => fs.readFileSync(file),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
    // TypeScript is only needed when a program imports "npm:…" or "node:…".
    resolvePackage: async (specifier, request) => {
      // `node:fss`: no module of Node's (the compiler says so), and nothing to load or cache.
      if (specifier.startsWith('node:') && !isBuiltin(specifier)) throw new Error(`No Node module ${specifier}`);
      packages ??= (await import('../../tools/dts/packages.mjs')).nodePackageResolver({ root, ready: true });
      return packages(specifier, request);
    },
    loadGlue: source => importGlue(source, root),
  };
}

/**
 * The .utu files under folders `dirs` (not in node_modules or a hidden
 * folder), following links to folders (each folder once, by its real path);
 * `unlisted`: the folders that cannot be listed. A link leading nowhere is
 * no file.
 */
export function utuFiles(dirs) {
  const files = new Set(), unlisted = [], seen = new Set();
  const walk = dir => {
    let real, entries;
    try { real = fs.realpathSync(dir); entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { unlisted.push(dir); return; }
    if (seen.has(real)) return;
    seen.add(real);
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const utu = e.name.endsWith('.utu');
      let folder = e.isDirectory(), file = e.isFile();
      if (e.isSymbolicLink()) {
        try { const stat = fs.statSync(full); folder = stat.isDirectory(); file = stat.isFile(); } catch { continue; }
      }
      if (folder) { if (!e.name.startsWith('.') && e.name !== 'node_modules') walk(full); }
      else if (file && utu && !files.has(full)) files.add(full);
    }
  };
  for (const dir of dirs) walk(dir);
  return { files: [...files], unlisted };
}

/** Build `entry` (see compile in compiler.js), with files from disk. */
export async function compileFile(utu, entry, options = {}) {
  const file = path.resolve(entry);
  return compile(utu, file, { ...nodeHost({ root: options.root ?? path.dirname(file) }), ...options });
}

/** Instantiate a built module in Node, its glue a real ES module. */
export function instantiateNode(wasm, spec, { root = process.cwd(), profiler = null, wrap = null } = {}) {
  return instantiate(wasm, spec, { loadGlue: source => importGlue(source, root), profiler, wrap });
}

/**
 * The glue module's exports: written beside the nearest node_modules (as
 * stage 0's loader does) so its imports resolve as the project's would,
 * named by its hash so concurrent builds share it.
 */
async function importGlue(written, root) {
  // A relative import (`--module ./api.js` in an .abi.json) is from the
  // program's directory, as `utu build` bundles it.
  const source = written.replace(/(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.\.?\/[^"']*)\2/g,
    (_, lead, quote, specifier) => lead + JSON.stringify(pathToFileURL(path.resolve(root, specifier)).href));
  const modules = findNodeModules(root);
  const dir = modules ? path.join(modules, '.utu') : fs.mkdtempSync(path.join(os.tmpdir(), 'utu-glue-'));
  fs.mkdirSync(dir, { recursive: true });
  // Its real path: Bun resolves a module's imports from a symlinked
  // node_modules (a worktree's, a linked install's) differently from Node.
  const file = path.join(fs.realpathSync(dir), `glue-${createHash('sha256').update(source).digest('hex').slice(0, 16)}.mjs`);
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
