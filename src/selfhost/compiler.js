// src/selfhost/compiler.js — the self-hosted compiler, driven from JavaScript.
//
// The compiler is a WasmGC module (selfhost/, built by `bun run build` into
// dist/utu.wasm). It holds the program in its own memories; this driver
// gives it the files (the entry, the standard library, every import, host
// declarations), runs the build, and reads back the module, the spec of what
// the module needs from its host, and the diagnostics.
//
// Nothing here touches a file system: a host gives `readFile`,
// `resolvePath`, and (for npm:/node: imports and @embed) `resolvePackage`
// and `readBinaryFile`, so the same driver runs in Node, in a browser, and in
// the editor.
//
//   const utu = await loadCompiler(compilerWasm, compilerSpec);
//   const { wasm, spec, diagnostics } = await compile(utu, entry, host);
//   const { exports } = await instantiate(wasm, spec);

import {
  awaitImports, closureImports, exceptionImports, glueModuleSource, importObjectFromEval, importObjectFromGlue,
  memoryImports, promiseImports, promisifyExports,
} from '../runtime/host-imports.js';

/** How a file joins the program. */
export const ROLE = { entry: 0, import: 1, prelude: 2 };

/** What a build is for: a module's exports, its tests, or @comptime values. */
export const TARGET = { normal: 0, test: 1, comptime: 2 };

/** How builds are optimized; size (-Oz) is the default, as in stage 0. */
export const OPTIMIZE = { none: 0, size: 1, speed: 2 };

// The engine provides the JS string builtins, and string constants as
// imports from module `'`.
const COMPILE_OPTIONS = Object.freeze({ builtins: ['js-string'], importedStringConstants: "'" });

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const textAt = (memory, start, end) => decoder.decode(new Uint8Array(memory.buffer, start, end - start));

/** The compiler's exports, from its module and spec. */
export async function loadCompiler(wasm, spec = {}) {
  return (await instantiate(wasm, spec)).exports;
}

/**
 * Build `entry` with a loaded compiler. Returns the module's bytes and spec,
 * or none (`wasm: null`) and the diagnostics that stopped it. `host` gives
 * file access (see the top of this file) and `stdlib` (the platform sources,
 * a Map from `std:Name` to text or to an async thunk of a host ABI).
 */
export async function compile(utu, entry, host) {
  const { target = 'normal', optimize = 'size', debugNames = false } = host;
  utu.set_optimize(OPTIMIZE[optimize] ?? OPTIMIZE.size);
  utu.set_debug_names(debugNames ? 1 : 0);
  const files = await loadProgram(utu, entry, host);
  const size = await compileProgram(utu, TARGET[target] ?? TARGET.normal, host);
  const diagnostics = readDiagnostics(utu, files);
  if (size < 0) return { wasm: null, spec: null, diagnostics, files };
  return { ...builtModule(utu, size), diagnostics, files, tests: target === 'test' ? readTests(utu) : [] };
}

/** A test build's tests: each one's export and name. */
function readTests(utu) {
  const tests = [];
  for (let k = 0; k < utu.test_count(); k++) {
    tests.push({ export: `__test_${k}`, name: JSON.parse(textAt(utu.src, utu.test_name_start(k), utu.test_name_end(k))) });
  }
  return tests;
}

/**
 * Give the compiler a program: the entry file, the standard library's
 * prelude, and every file they import; then resolve its names. Host
 * declarations (std:Browser, npm:…) are read here, and @embed files.
 * Returns each file's key (path or `std:` name), text and bytes.
 */
export async function loadProgram(utu, entry, host) {
  const { readFile, resolvePath = defaultResolvePath, stdlib } = host;
  utu.reset();
  const files = [];
  const byKey = new Map();
  const add = (key, text, role) => {
    const bytes = encoder.encode(text);
    const file = utu.file_add(bytes.length, role);
    new Uint8Array(utu.src.buffer).set(bytes, utu.file_offset(file));
    files.push({ key, role, text, offset: utu.file_offset(file), bytes });
    byKey.set(key, file);
    utu.file_parse(file);
    return file;
  };
  const foreign = [];
  add(entry, await readFile(entry), ROLE.entry);
  const prelude = stdlib.get('std:Prelude');
  if (typeof prelude === 'string') add('std:Prelude', prelude, ROLE.prelude);
  for (let i = 0; i < utu.import_count(); i++) {
    const from = files[utu.import_from(i)];
    const raw = textAt(utu.src, utu.import_path_start(i), utu.import_path_end(i));
    const platform = /^[a-z][a-zA-Z0-9_]*:[A-Za-z][a-zA-Z0-9_]*$/.test(raw);
    if (/^"?(npm|node):/.test(raw) || platform && typeof stdlib.get(raw) === 'function') {
      utu.import_foreign(i);
      foreign.push({ i, raw, from: from.key, name: textAt(utu.src, utu.import_name_start(i), utu.import_name_end(i)) });
      continue;
    }
    const key = platform ? raw : resolvePath(from.key, JSON.parse(raw));
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
          text = await readFile(key);
        } catch {
          // A file that cannot be read ends the build, as in stage 0.
          const bytes = encoder.encode(key);
          new Uint8Array(utu.src.buffer).set(bytes, utu.import_missing(i, bytes.length));
          break;
        }
        file = add(key, text, role);
      }
    }
    utu.import_bind(i, file);
  }
  await loadForeign(utu, foreign, host);
  files.diagnostics = utu.resolve();
  await loadEmbeds(utu, entry, host);
  return files;
}

// The JSON of a declaration ABI's types, made once per document: std:JS and
// std:Browser are views of one, and share it.
const typesText = new WeakMap();

/** Each host declaration document once, then each import's view of one. */
async function loadForeign(utu, foreign, { stdlib, resolvePackage }) {
  const write = text => {
    const bytes = encoder.encode(text);
    const at = utu.abi_room(bytes.length);
    new Uint8Array(utu.src.buffer).set(bytes, at);
    return at;
  };
  const docs = new Map();
  for (const { i, raw, from, name } of foreign) {
    let abi;
    try {
      abi = /^"?(npm|node):/.test(raw)
        ? await resolvePackage(JSON.parse(raw), { prefix: name, from })
        : (await stdlib.get(raw)()).abi;
    } catch {
      // Unreadable declarations leave the import unresolved, which is reported.
      continue;
    }
    if (!docs.has(abi.types)) {
      if (!typesText.has(abi.types)) typesText.set(abi.types, JSON.stringify(abi.types));
      docs.set(abi.types, utu.abi_doc(write(typesText.get(abi.types))));
    }
    const { prefix, moduleSpecifier, exports, names, mutableGlobals } = abi;
    utu.abi_view(i, docs.get(abi.types), write(JSON.stringify({ prefix, moduleSpecifier, exports, names, mutableGlobals })));
  }
}

/** @embed: the files' bytes, read relative to the entry file. */
async function loadEmbeds(utu, entry, { resolvePath = defaultResolvePath, readBinaryFile }) {
  for (let k = 0; k < utu.embed_files(); k++) {
    const rel = textAt(utu.src, utu.embed_path_start(k), utu.embed_path_end(k));
    let bytes;
    try { bytes = await readBinaryFile(resolvePath(entry, rel)); } catch { utu.embed_fail(k); continue; }
    const at = utu.embed_set(k, bytes.length);
    new Uint8Array(utu.embed_bytes.buffer).set(bytes, at);
  }
}

/**
 * Compile the loaded program for a target. A program with @comptime mems is
 * first built for evaluating them; that build runs here, and its values go
 * back to the compiler as the mems' contents. Returns the module's size in
 * `out`, or -1 when there are diagnostics.
 */
export async function compileProgram(utu, target, host = {}) {
  const count = utu.comptime_mems();
  if (count > 0) {
    const size = utu.compile_program(TARGET.comptime);
    if (size < 0) return -1;
    const { wasm, spec } = builtModule(utu, size);
    const { exports } = await instantiate(wasm, spec, host);
    for (let k = 0; k < count; k++) {
      const name = utu.comptime_name(k);
      const n = exports[`__comptime_run_${name}`]();
      const bytes = new Uint8Array(exports[`__comptime_${name}`].buffer, 0, n * utu.comptime_value_size(k)).slice();
      const at = utu.comptime_set(k, n);
      new Uint8Array(utu.comptime_bytes.buffer).set(bytes, at);
    }
  }
  return utu.compile_program(target);
}

/**
 * What the last compile built: the module's bytes, and the spec of what it
 * needs from its host (`@es` bodies, closures, promises, hosted mems), which
 * the compiler gives beside the module, as stage 0 does, not in it.
 */
export function builtModule(utu, size) {
  const wasm = new Uint8Array(utu.out.buffer, 0, size).slice();
  const n = utu.host_json_size();
  const spec = n ? JSON.parse(textAt(utu.host_json, 0, n)) : {};
  return { wasm, spec };
}

/**
 * The diagnostics of the last build: kind (stage 0's names), message, file
 * key, and where, as UTF-16 offsets and a 1-based line and column.
 */
export function readDiagnostics(utu, files) {
  const out = [];
  for (let i = 0; i < utu.diagnostic_count(); i++) {
    const f = utu.diagnostic_file(i);
    const file = f >= 0 ? files[f] : null;
    const diagnostic = { kind: utu.diagnostic_kind(i), message: utu.diagnostic_message(i), severity: 'error', file: file?.key ?? null };
    if (file) {
      const start = units(file, utu.diagnostic_start(i));
      const end = units(file, utu.diagnostic_end(i));
      const before = file.text.slice(0, start);
      const line = before.split('\n').length;
      Object.assign(diagnostic, { start, end, line, column: start - before.lastIndexOf('\n') });
    }
    out.push(diagnostic);
  }
  return out;
}

/** A byte offset in `src` as a UTF-16 offset in the file's text. */
function units(file, byte) {
  return decoder.decode(file.bytes.subarray(0, Math.max(0, byte - file.offset))).length;
}

/**
 * Instantiate a module the compiler built, with its spec: the `@es` bodies
 * (through `loadGlue`, which turns the glue module's source into its
 * exports; by default each body is evaluated alone, which serves bodies
 * that neither import nor await), closures, promises, hosted mems, and the
 * engine's JS string builtins.
 */
export async function instantiate(wasm, spec = {}, { loadGlue = null } = {}) {
  const module = await WebAssembly.compile(wasm, COMPILE_OPTIONS);
  const es = spec.es ?? {};
  const source = glueModuleSource(es);
  const imports = !source ? {} : loadGlue ? importObjectFromGlue(es, await loadGlue(source)) : importObjectFromEval(es);
  if (spec.closures) imports.utu = closureImports(spec.closures, imports.utu ?? {});
  if (spec.mems) imports.utu = memoryImports(spec.mems, imports.utu ?? {});
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

/** `../b.utu` from `/a/c.utu`: POSIX paths and URLs alike. */
function defaultResolvePath(from, relative) {
  if (/^[a-z]+:\/\//i.test(from)) return new URL(relative, from).href;
  const parts = from.split('/').slice(0, -1);
  for (const part of relative.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  return parts.join('/');
}
