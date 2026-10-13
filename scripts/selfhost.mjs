// Build the self-hosted compiler (selfhost/).
//
//   node scripts/selfhost.mjs [--out=file.wasm]
//
// Its mems are top-level declarations of one program, so the files listed in
// selfhost/files.txt are joined, in order, into one source and compiled as
// one file. Errors point at the file and line they came from.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { collectAnalysisDiagnostics, createCompiler, emitBinary, initParser, instantiateLowered, buildImportObject, PLATFORM_SOURCES, JS_STRING_BUILTINS_COMPILE_OPTIONS } from '../src/index.js';
import { importObjectFromEval, importObjectFromGlue, glueModuleSource, exceptionImports, closureImports, promiseImports, awaitImports, promisifyExports } from '../src/runtime/host-imports.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'selfhost');
// The joined source's name; it is never written.
const JOINED = path.join(DIR, 'utu.utu');

/** The joined source, and where each file begins in it (1-based lines). */
export function joinSelfhost() {
  const names = fs.readFileSync(path.join(DIR, 'files.txt'), 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
  const parts = [];
  let line = 1;
  for (const name of names) {
    let text = fs.readFileSync(path.join(DIR, name), 'utf8');
    if (!text.endsWith('\n')) text += '\n';
    parts.push({ name: `selfhost/${name}`, line, text });
    line += text.split('\n').length - 1;
  }
  return { text: parts.map(part => part.text).join(''), parts };
}

/** `selfhost/parse.utu:12` for line `line` of the joined source. */
function placeOf(parts, line) {
  const part = parts.findLast(entry => entry.line <= line) ?? parts[0];
  return `${part.name}:${line - part.line + 1}`;
}

/** The compiled module's bytes; throws with every error, placed in its file. */
export async function buildSelfhost() {
  const { text, parts } = joinSelfhost();
  const relocate = message => message
    .replace(/\(line (\d+)\)/g, (_, line) => `(${placeOf(parts, Number(line))})`)
    .replace(/ at (\d+):(\d+)/g, (_, line, col) => ` at ${placeOf(parts, Number(line))}:${col}`);
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const compiler = createCompiler({
    parser, target: 'normal', optimize: 'speed',
    readFile: file => file === JOINED ? Promise.resolve(text) : fs.promises.readFile(file, 'utf8'),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
  });
  let doc;
  try {
    doc = await compiler.compileFile(JOINED);
  } catch (error) {
    const row = error.diagnostic?.primary?.row;
    if (!row) throw error;
    throw new Error(`${placeOf(parts, row)}: ${relocate(error.message)}`);
  }
  const errors = collectAnalysisDiagnostics(doc).filter(diagnostic => diagnostic.severity === 'error').map(({ message, primary }) =>
    primary?.row ? `${placeOf(parts, primary.row)}: ${relocate(message)}` : relocate(message));
  if (errors.length) throw new Error(errors.join('\n'));
  // With a source map, the binary also names its functions, so a trap in
  // the compiler says where it happened.
  return { doc, wasm: emitBinary(doc, { sourceMap: true }).binary };
}

const ROLE = { entry: 0, import: 1, prelude: 2 };

/**
 * Give the self-hosted compiler a program: the entry file, the standard
 * library's prelude, and every file they import, then resolve its names.
 * Returns each file's key (path or `std:` name), and the decoder for byte
 * offsets in `src`.
 */
export function loadProgram(utu, entry, { readFile = file => fs.readFileSync(file, 'utf8'), stdlib = PLATFORM_SOURCES } = {}) {
  utu.reset();
  const files = [];
  const byKey = new Map();
  const add = (key, text, role) => {
    const bytes = new TextEncoder().encode(text);
    const file = utu.file_add(bytes.length, role);
    new Uint8Array(utu.src.buffer).set(bytes, utu.file_offset(file));
    files.push({ key, role, text, offset: utu.file_offset(file), bytes });
    byKey.set(key, file);
    utu.file_parse(file);
    return file;
  };
  add(entry, readFile(entry), ROLE.entry);
  const prelude = stdlib.get('std:Prelude');
  if (typeof prelude === 'string') add('std:Prelude', prelude, ROLE.prelude);
  for (let i = 0; i < utu.import_count(); i++) {
    const from = files[utu.import_from(i)];
    const raw = new TextDecoder().decode(new Uint8Array(utu.src.buffer, utu.import_path_start(i), utu.import_path_end(i) - utu.import_path_start(i)));
    const platform = /^[a-z][a-zA-Z0-9_]*:[A-Za-z][a-zA-Z0-9_]*$/.test(raw);
    if (/^"?(npm|node):/.test(raw) || platform && typeof stdlib.get(raw) === 'function') {
      utu.import_foreign(i);
      continue;
    }
    const key = platform ? raw : path.resolve(path.dirname(from.key), JSON.parse(raw));
    let file = byKey.get(key);
    if (file === undefined) {
      const role = from.role === ROLE.prelude ? ROLE.prelude : ROLE.import;
      if (platform) {
        const text = stdlib.get(key);
        if (typeof text !== 'string') continue;
        file = add(key, text, role);
      } else {
        let text;
        try {
          text = readFile(key);
        } catch {
          // A file that cannot be read ends the build, as in stage 0.
          const bytes = new TextEncoder().encode(key);
          new Uint8Array(utu.src.buffer).set(bytes, utu.import_missing(i, bytes.length));
          break;
        }
        file = add(key, text, role);
      }
    }
    utu.import_bind(i, file);
  }
  files.diagnostics = utu.resolve();
  // @embed: the files' bytes, read relative to the entry file.
  for (let k = 0; k < utu.embed_files(); k++) {
    const rel = new TextDecoder().decode(new Uint8Array(utu.src.buffer, utu.embed_path_start(k), utu.embed_path_end(k) - utu.embed_path_start(k)));
    let bytes;
    try { bytes = fs.readFileSync(path.resolve(path.dirname(entry), rel)); } catch { utu.embed_fail(k); continue; }
    const at = utu.embed_set(k, bytes.length);
    new Uint8Array(utu.embed_bytes.buffer).set(bytes, at);
  }
  return files;
}

/**
 * Compile the loaded program for a target (0: exports, 1: tests). A program
 * with @comptime mems is first built for evaluating them; that build runs
 * here, and its values go back to the compiler as the mems' contents.
 * Returns the module's size in `out`, or -1 when there are diagnostics.
 */
export async function compileProgram(utu, target) {
  const count = utu.comptime_mems();
  if (count > 0) {
    const size = utu.compile_program(2);
    if (size < 0) return -1;
    const { instance } = await instantiateBuilt(new Uint8Array(utu.out.buffer, 0, size).slice());
    for (let k = 0; k < count; k++) {
      const name = utu.comptime_name(k);
      const n = instance.exports[`__comptime_run_${name}`]();
      const bytes = new Uint8Array(instance.exports[`__comptime_${name}`].buffer, 0, n * utu.comptime_value_size(k)).slice();
      const at = utu.comptime_set(k, n);
      new Uint8Array(utu.comptime_bytes.buffer).set(bytes, at);
    }
  }
  return utu.compile_program(target);
}

/**
 * Instantiate a module the self-hosted compiler built: its imports come from
 * its `utu` custom section (what the host provides) and the engine's JS
 * string builtins.
 */
export async function instantiateBuilt(wasm) {
  const module = await WebAssembly.compile(wasm, JS_STRING_BUILTINS_COMPILE_OPTIONS);
  const [section] = WebAssembly.Module.customSections(module, 'utu');
  const spec = section ? JSON.parse(new TextDecoder().decode(section)) : {};
  const imports = await esImports(spec.es ?? {});
  if (spec.closures) imports.utu = closureImports(spec.closures, imports.utu ?? {});
  if (spec.promises) {
    imports.utu = promiseImports(spec.promises, imports.utu ?? {});
    imports.utu = awaitImports(spec.promises, imports.utu);
  }
  if (WebAssembly.Module.imports(module).some(entry => entry.module === 'utu' && entry.name === 'js_tag')) {
    imports.utu = exceptionImports(imports.utu ?? {});
  }
  const instance = await WebAssembly.instantiate(module, imports);
  return { module, instance, exports: promisifyExports(instance, spec.promises) };
}

/**
 * The `@es` imports: their bodies as the exports of an ES module, written
 * beside the project's node_modules (as stage 0's loader does), so a body
 * may import packages and await at the top level.
 */
async function esImports(spec) {
  const source = glueModuleSource(spec);
  if (!source) return {};
  const dir = fs.existsSync(path.join(ROOT, 'node_modules')) ? path.join(ROOT, 'node_modules', '.utu') : fs.mkdtempSync(path.join(os.tmpdir(), 'utu-glue-'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `glue-${createHash('sha256').update(source).digest('hex').slice(0, 16)}.mjs`);
  if (!fs.existsSync(file)) {
    const partial = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(partial, source);
    fs.renameSync(partial, file);
  }
  return importObjectFromGlue(spec, await import(pathToFileURL(file).href));
}

/**
 * The self-hosted compiler's exports. Stage 1 is the compiler as stage 0
 * builds it; stage 2, as stage 1 builds it (the compiler built by itself).
 */
export async function loadSelfhost({ stage = Number(process.env.UTU_STAGE ?? 1) } = {}) {
  const { doc, wasm } = await buildSelfhost();
  const { instance } = await instantiateLowered(wasm, await buildImportObject(doc, { wasm, projectRoot: ROOT }));
  if (stage === 1) return instance.exports;
  let compiler = instance.exports;
  for (let s = 2; s <= stage; s++) {
    const bytes = await buildWith(compiler);
    compiler = (await instantiateBuilt(bytes)).instance.exports;
  }
  return compiler;
}

/** The self-hosted compiler's bytes, built by a loaded self-hosted compiler. */
export async function buildWith(compiler) {
  const { text } = joinSelfhost();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utu-stage-'));
  const file = path.join(dir, 'utu.utu');
  fs.writeFileSync(file, text);
  try {
    const files = loadProgram(compiler, file);
    const size = await compileProgram(compiler, 0);
    if (size < 0) throw new Error(`the self-hosted compiler does not build itself: ${files.diagnostics} diagnostics`);
    return new Uint8Array(compiler.out.buffer, 0, size).slice();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
  try {
    const { wasm } = await buildSelfhost();
    if (out) fs.writeFileSync(out, wasm);
    console.log(`selfhost: ${wasm.length} bytes${out ? ` → ${out}` : ''}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
