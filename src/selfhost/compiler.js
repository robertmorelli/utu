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
  convertExports, memoryImports, promiseImports, promisifyExports,
} from '../runtime/host-imports.js';
import { compressedSourceWarnings, unknownIslandWarnings } from '../compiler/source-warnings.js';

/** How a file joins the program. */
export const ROLE = { entry: 0, import: 1, prelude: 2 };

/** What a build is for: a module's exports, its tests, or @comptime values. */
export const TARGET = { normal: 0, test: 1, comptime: 2 };

/** How builds are optimized; size (-Oz) is the default, as in stage 0. */
export const OPTIMIZE = { none: 0, size: 1, speed: 2 };

/**
 * The build modes people choose (`-O mode`, named as Zig names its own):
 * small (the default for people: the smallest module, with the checks Wasm
 * does not make itself), fast (the fastest, inlined, with those checks),
 * each without the checks, and debug (the module as code generation leaves
 * it, checked). `optimize` and `safe` remain for tools that want one
 * without the other.
 */
export const MODES = {
  small: { optimize: 'size', safe: true },
  fast: { optimize: 'speed', safe: true },
  smallUnsafe: { optimize: 'size', safe: false },
  fastUnsafe: { optimize: 'speed', safe: false },
  debug: { optimize: 'none', safe: true },
};

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
  const chosen = host.mode ? MODES[host.mode] : null;
  if (host.mode && !chosen) throw new Error(`no build mode ${host.mode}: ${Object.keys(MODES).join(', ')}`);
  const { target = 'normal', optimize = 'size', debugNames = false, safe = false } = { ...host, ...chosen };
  utu.set_optimize(OPTIMIZE[optimize] ?? OPTIMIZE.size);
  utu.set_safe(safe ? 1 : 0);
  utu.set_debug_names(debugNames ? 1 : 0);
  let files, size;
  try {
    files = await loadProgram(utu, entry, host);
    size = await compileProgram(utu, TARGET[target] ?? TARGET.normal, host);
  } catch (error) {
    if (!isStackOverflow(error)) throw error;
    // The compiler recurses on nesting: a program nested past what its
    // stack bears is a mistake in the program, reported where it is deepest.
    files = loading.get(utu) ?? [];
    return { wasm: null, spec: null, diagnostics: [tooDeep(utu, files, error)], files };
  }
  const diagnostics = readDiagnostics(utu, files).concat(sourceWarnings(files));
  if (size < 0) return { wasm: null, spec: null, diagnostics, files };
  return { ...builtModule(utu, size), diagnostics, files, tests: target === 'test' ? readTests(utu) : [] };
}

/** A test build's tests: each one's export and name. */
function readTests(utu) {
  const tests = [];
  for (let k = 0; k < utu.test_count(); k++) {
    tests.push({ export: `__test_${k}`, name: stringValue(textAt(utu.src, utu.test_name_start(k), utu.test_name_end(k))) });
  }
  return tests;
}

const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

/** A utu string literal's text (quotes included), its escapes read as utu reads them. */
function stringValue(literal) {
  return literal.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e) => e.length > 1 ? String.fromCharCode(parseInt(e.slice(1), 16)) : ESCAPES[e] ?? e);
}

/**
 * Give the compiler a program: the entry file, the standard library's
 * prelude, and every file they import; then resolve its names. Host
 * declarations (std:Browser, npm:…) are read here, and @embed files.
 * Returns each file's key (path or `std:` name), text and bytes.
 */
export async function loadProgram(utu, entry, host, texts = new Map()) {
  const { resolvePath = defaultResolvePath, stdlib } = host;
  // Each file read once, though a program may be started twice.
  const readFile = async file => {
    // Bytes as they are, when the host's readFile can give them: the compiler reports text that is not UTF-8.
    if (!texts.has(file)) texts.set(file, await (host.readFile.bytes ?? host.readFile)(file));
    return texts.get(file);
  };
  const prelude = startProgram(utu, stdlib);
  const files = [...prelude.files];
  loading.set(utu, files);
  const byKey = new Map(prelude.byKey);
  const foreign = [];
  addFile(utu, files, byKey, entry, await readFile(entry), ROLE.entry);
  for (let i = 0; i < utu.import_count(); i++) {
    const from = files[utu.import_from(i)];
    const raw = textAt(utu.src, utu.import_path_start(i), utu.import_path_end(i));
    const platform = PLATFORM_PATH.test(raw);
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
        file = addFile(utu, files, byKey, key, text, role);
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
        file = addFile(utu, files, byKey, key, text, role);
      }
    }
    utu.import_bind(i, file);
  }
  // Host declarations the compiler does not hold yet: start again with them
  // written first, where they stay for the programs after.
  if (!await bindForeign(utu, foreign, host)) return loadProgram(utu, entry, host, texts);
  files.diagnostics = utu.resolve();
  await loadEmbeds(utu, entry, host);
  await assembleWat(utu);
  return files;
}

/**
 * @wat functions: each one's text, assembled (src/wat/assemble.js, loaded
 * only when a program has one) from its parameters and result as written,
 * and given back as its code, or as the mistake that stops it.
 */
async function assembleWat(utu) {
  const count = utu.wat_count();
  if (count === 0) return;
  const { assembleWat: assemble } = await import('../wat/assemble.js');
  const kind = n => utu.node_kind_name(new Uint8Array(utu.node_kind.buffer)[n]);
  const children = n => {
    const child = new Int32Array(utu.node_child.buffer);
    const next = new Int32Array(utu.node_next.buffer);
    const out = [];
    for (let c = child[n]; c >= 0; c = next[c]) out.push(c);
    return out;
  };
  const text = n => {
    const first = new Int32Array(utu.node_first.buffer)[n];
    const last = new Int32Array(utu.node_last.buffer)[n];
    return textAt(utu.src, new Int32Array(utu.tok_start.buffer)[first], new Int32Array(utu.tok_end.buffer)[last - 1]);
  };
  for (let k = 0; k < count; k++) {
    const parts = children(utu.wat_function(k));
    const params = parts.filter(n => kind(n) === 'param_list').flatMap(children)
      .map(param => { const [name, type] = [children(param)[0], children(param).at(-1)]; return { name: text(name), type: text(type) }; });
    const returns = parts.find(n => kind(n) === 'return_type');
    const result = kind(children(returns)[0]) === 'void_type' ? 'void' : text(returns);
    const method = parts.some(n => kind(n) === 'self_param') || kind(children(returns)[0]) === 'yield_type';
    const assembled = assemble({ params, result, method, text: textAt(utu.src, utu.wat_text_start(k), utu.wat_text_end(k)) });
    if (assembled.code) {
      const at = utu.wat_set(k, assembled.code.length);
      new Uint8Array(utu.wat_bytes.buffer).set(assembled.code, at);
    } else {
      const { message, start, end } = assembled.error;
      const bytes = encoder.encode(message);
      const at = utu.wat_fail(k, start ?? -1, end ?? -1, bytes.length);
      new Uint8Array(utu.src.buffer).set(bytes, at);
    }
  }
}

const PLATFORM_PATH = /^[a-z][a-zA-Z0-9_]*:[A-Za-z][a-zA-Z0-9_]*$/;

/** Add a file (its text, or its bytes) to the program, and parse it. Returns its index. */
function addFile(utu, files, byKey, key, source, role) {
  const bytes = typeof source === 'string' ? encoder.encode(source) : new Uint8Array(source);
  const text = typeof source === 'string' ? source : new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  const file = utu.file_add(bytes.length, role);
  if (key.startsWith('std:')) utu.file_mark_std?.(file);
  new Uint8Array(utu.src.buffer).set(bytes, utu.file_offset(file));
  files.push({ key, role, text, offset: utu.file_offset(file), bytes });
  byKey.set(key, file);
  files.parsing = true;
  utu.file_parse(file);
  files.parsing = false;
  return file;
}

/** By compiler: the files of the program it is loading (see @tooDeep). */
const loading = new WeakMap();

/** Whether an error is the engine's stack overflowing (V8 and JavaScriptCore say so alike). */
function isStackOverflow(error) {
  return error instanceof RangeError && /call stack/i.test(error.message);
}

/**
 * A program the compiler's stack could not get through: where the parse
 * was most deeply nested, when it overflowed parsing; else the deepest
 * node of the program's own files (or, when nothing is deep, the node with
 * the most children: a long chain of arms or links).
 */
function tooDeep(utu, files, error) {
  const diagnostic = {
    kind: 'nested-too-deeply', code: 'nested-too-deeply', severity: 'error', file: null,
    message: 'Program nested too deeply', notes: ['The compiler recurses on nesting; split the expression, or the chain, into smaller ones.'],
  };
  let at = files.parsing ? utu.parse_deepest_at?.() ?? -1 : -1;
  if (at < 0) at = deepestNode(utu, files);
  const file = at < 0 ? null : files.findLast(f => f.offset <= at && at <= f.offset + f.bytes.length);
  if (!file) return { ...diagnostic, message: `${diagnostic.message} (${error.message})` };
  const where = place(file, at, at);
  return { ...diagnostic, file: file.key, ...where, end: where.start + 1, label: 'nested too deeply', message: `${diagnostic.message} (at about line ${where.line})` };
}

/** The byte where the program's own files nest deepest (see @tooDeep), or -1. */
function deepestNode(utu, files) {
  let child, next, first, tokStart, n;
  try {
    n = utu.node_count();
    [child, next, first] = ['node_child', 'node_next', 'node_first'].map(name => new Int32Array(utu[name].buffer, 0, n));
    tokStart = new Int32Array(utu.tok_start.buffer);
  } catch { return -1; }
  const own = files.filter(f => f.role === ROLE.entry || f.role === ROLE.import);
  const isOwn = byte => own.some(f => f.offset <= byte && byte < f.offset + f.bytes.length);
  // The roots: nodes no node holds.
  const held = new Uint8Array(n);
  for (let node = 0; node < n; node++) for (let c = child[node]; c >= 0 && c < n && !held[c]; c = next[c]) held[c] = 1;
  const depth = new Int32Array(n);
  let deepest = -1, widest = -1, most = 0;
  for (let root = 0; root < n; root++) {
    if (held[root] || !isOwn(tokStart[first[root]])) continue;
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      let kids = 0;
      for (let c = child[node]; c >= 0 && c < n; c = next[c]) {
        depth[c] = depth[node] + 1;
        stack.push(c);
        kids++;
      }
      if (deepest < 0 || depth[node] > depth[deepest]) deepest = node;
      if (kids > most) { most = kids; widest = node; }
    }
  }
  const node = deepest >= 0 && depth[deepest] >= 200 ? deepest : widest;
  return node < 0 ? -1 : tokStart[first[node]];
}

// A declaration ABI's types as JSON bytes, and where each type starts in
// them, made once per document (std:JS and std:Browser are views of one,
// and share it). The compiler reads only the types a program uses.
const typesJson = new WeakMap();

export function typesDocument(types) {
  let made = typesJson.get(types);
  if (!made) {
    const parts = types.map(type => encoder.encode(JSON.stringify(type)));
    const offsets = new Int32Array(parts.length);
    const bytes = new Uint8Array(parts.reduce((n, part) => n + part.length + 1, 1));
    let at = 0;
    bytes[at++] = 0x5b;  // [
    parts.forEach((part, k) => {
      if (k > 0) bytes[at++] = 0x2c;  // ,
      offsets[k] = at;
      bytes.set(part, at);
      at += part.length;
    });
    bytes[at++] = 0x5d;  // ]
    made = { bytes: bytes.subarray(0, at), offsets };
    typesJson.set(types, made);
  }
  return made;
}

// What each loaded compiler keeps from program to program: the host
// declarations' documents and views (with what it learns of them: where
// their containers end, their large objects' keys), and all those wanted so
// far; and the standard library's prelude, parsed. Both are written at the
// start of its source and sealed.
const resident = new WeakMap();

function residentOf(utu) {
  let state = resident.get(utu);
  if (!state) resident.set(utu, state = { docs: new Map(), views: new Map(), wanted: new Set(), prelude: null, rebuild: false });
  return state;
}

/**
 * Start a program, keeping what the compiler holds; or, when a program
 * wanted host declarations it does not hold (or the prelude is another),
 * writing every one wanted so far and the prelude first, and sealing them.
 * Returns the prelude's files.
 */
function startProgram(utu, stdlib) {
  const state = residentOf(utu);
  if (!state.rebuild && state.prelude?.files.every(file => stdlib.get(file.key) === file.text)) {
    utu.reset_keep();
    return state.prelude;
  }
  utu.reset();
  state.docs.clear();
  state.views.clear();
  for (const decl of state.wanted) {
    const view = writeView(utu, decl, writeDoc(utu, decl, state.docs));
    state.views.set(decl, utu.abi_resident_view(view.doc, view.at));
  }
  state.prelude = seatPrelude(utu, stdlib);
  utu.seal();
  state.rebuild = false;
  return state.prelude;
}

/** std:Prelude and the standard library files it imports, added and parsed. */
function seatPrelude(utu, stdlib) {
  const files = [];
  const byKey = new Map();
  const text = stdlib.get('std:Prelude');
  if (typeof text !== 'string') return { files, byKey };
  addFile(utu, files, byKey, 'std:Prelude', text, ROLE.prelude);
  for (let i = 0; i < utu.import_count(); i++) {
    const key = textAt(utu.src, utu.import_path_start(i), utu.import_path_end(i));
    const text = stdlib.get(key);
    if (!PLATFORM_PATH.test(key) || typeof text !== 'string') continue;
    utu.import_bind(i, byKey.get(key) ?? addFile(utu, files, byKey, key, text, ROLE.prelude));
  }
  return { files, byKey };
}

function writeBytes(utu, bytes) {
  const at = utu.abi_room(bytes.length);
  new Uint8Array(utu.src.buffer).set(bytes, at);
  return at;
}

/**
 * Host declarations as the compiler reads them: a document (the types'
 * JSON bytes and where each type starts, shared by the views of one ABI)
 * and a view's JSON (prefix, module specifier, exports, names, mutable
 * globals). A platform catalog ships them so; a package's ABI object is
 * made so once.
 */
const prepared = new WeakMap();

function prepare(abi) {
  let decl = prepared.get(abi);
  if (!decl) {
    const { prefix, moduleSpecifier, exports, names, mutableGlobals } = abi;
    decl = { document: typesDocument(abi.types), view: encoder.encode(JSON.stringify({ prefix, moduleSpecifier, exports, names, mutableGlobals })) };
    prepared.set(abi, decl);
  }
  return decl;
}

/** A declaration's document, once per compiler state. */
function writeDoc(utu, decl, docs) {
  if (!docs.has(decl.document)) {
    const { bytes, offsets } = decl.document;
    const at = writeBytes(utu, bytes);
    utu.abi_offsets_room(offsets.length);
    new Int32Array(utu.abi_offsets.buffer, 0, offsets.length).set(offsets);
    docs.set(decl.document, utu.abi_doc_at(at, offsets.length));
  }
  return docs.get(decl.document);
}

/** An import's view of its document. */
function writeView(utu, decl, doc) {
  return { doc, at: writeBytes(utu, decl.view) };
}

/**
 * Bind each import to its host declarations, which the compiler holds
 * (written at the program's start). False when some it does not: they are
 * then wanted, and the program must start again.
 */
async function bindForeign(utu, foreign, { stdlib, resolvePackage }) {
  const state = residentOf(utu);
  const bindings = [];
  let missing = false;
  for (const { i, raw, from, name } of foreign) {
    let decl;
    try {
      // A platform module gives its declarations ready ({ document, view }), or an ABI.
      const given = /^"?(npm|node):/.test(raw)
        ? await resolvePackage(JSON.parse(raw), { prefix: name, from })
        : await stdlib.get(raw)();
      decl = given.document ? given : prepare(given.abi ?? given);
    } catch {
      // Unreadable declarations leave the import unresolved, which is reported.
      continue;
    }
    if (!state.views.has(decl)) {
      state.wanted.add(decl);
      state.rebuild = true;
      missing = true;
    }
    bindings.push([i, decl]);
  }
  if (missing) return false;
  for (const [i, decl] of bindings) utu.abi_bind(i, state.views.get(decl));
  return true;
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
      let n;
      try { n = exports[`__comptime_run_${name}`](); } catch (error) {
        // Reported at the mem, as a diagnostic.
        utu.comptime_fail(k, comptimeTrapCode(error));
        continue;
      }
      const bytes = new Uint8Array(exports[`__comptime_${name}`].buffer, 0, n * utu.comptime_value_size(k)).slice();
      const at = utu.comptime_set(k, n);
      new Uint8Array(utu.comptime_bytes.buffer).set(bytes, at);
    }
  }
  return utu.compile_program(target);
}

/** Why a `@comptime` evaluation threw, as the compiler's code for it (comptime_trap_text). */
function comptimeTrapCode(error) {
  const text = String(error?.message ?? error);
  if (!(error instanceof WebAssembly.RuntimeError) && !/call stack|recursion/i.test(text)) return 7;
  if (/out of bounds/i.test(text)) return 1;
  if (/unreachable/i.test(text)) return 2;
  if (/divi.*zero|by zero/i.test(text)) return 3;
  if (/overflow/i.test(text) && !/stack/i.test(text)) return 4;
  if (/null/i.test(text)) return 5;
  if (/call stack|recursion|stack/i.test(text)) return 6;
  return 0;
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
    if (file) Object.assign(diagnostic, place(file, utu.diagnostic_start(i), utu.diagnostic_end(i)));
    // Its own kind's name (`kind` is stage 0's, which several share), and
    // what it says beyond its message: a label on its span, other places,
    // notes, and a fix.
    if (utu.diagnostic_code) {
      diagnostic.code = utu.diagnostic_code(i).replace(/(?<=[a-z0-9])(?=[A-Z])/g, '-').toLowerCase();
      for (let k = 0; k < utu.diagnostic_extras(i); k++) {
        const kind = EXTRA[utu.diagnostic_extra_kind(i, k)];
        const text = utu.diagnostic_extra_text(i, k);
        if (kind === 'note') (diagnostic.notes ??= []).push(text);
        else if (kind === 'label') {
          diagnostic.label = text;
          // A label may narrow the span to show (its focus).
          const start = utu.diagnostic_extra_start(i, k), end = utu.diagnostic_extra_end(i, k);
          if (file && (start !== utu.diagnostic_start(i) || end !== utu.diagnostic_end(i))) diagnostic.focus = place(file, start, end);
        }
        else {
          const at = files[utu.diagnostic_extra_file(i, k)];
          if (!at) continue;
          const where = { file: at.key, ...place(at, utu.diagnostic_extra_start(i, k), utu.diagnostic_extra_end(i, k)) };
          if (kind === 'fix') diagnostic.fix = { ...where, text, label: utu.diagnostic_extra_label(i, k) };
          else (diagnostic.related ??= []).push({ ...where, role: kind, label: text });
        }
      }
    }
    // Every mark has its tag: the report's label, or the kind's own.
    if (utu.diagnostic_default_label && diagnostic.label == null && diagnostic.file) diagnostic.label = utu.diagnostic_default_label(i);
    out.push(diagnostic);
  }
  return out;
}

/**
 * The author-facing checks of the source text (as stage 0 makes them): an
 * over-dense line in the program's own files, and a `wutu.invalidate`
 * naming no `@island`. Warnings: they never stop a build.
 */
function sourceWarnings(files) {
  const own = files.filter(file => !/^(std|node|npm):/.test(file.key));
  const found = [
    ...own.flatMap(file => compressedSourceWarnings(file.text, file.key)),
    ...unknownIslandWarnings(files.map(file => [file.key, file.text])),
  ];
  return found.map(({ kind, message, primary }) => ({
    kind, message, severity: 'warning', file: primary.file, start: primary.start, end: primary.end, line: primary.row, column: primary.col,
  }));
}

/** A diagnostic's extra rows, by kind (`Extra` in selfhost/resolve.utu). */
const EXTRA = ['label', 'expected', 'found', 'related', 'note', 'fix'];

/**
 * Byte offsets into a file, as UTF-16 offsets (what editors count) and a
 * 1-based line and column (what a terminal shows: a column counts
 * characters, and a line ends at \n, \r\n, or a lone \r).
 */
function place(file, startByte, endByte) {
  const { units, lines } = indexOf(file);
  const at = byte => units[Math.min(Math.max(0, byte - file.offset), units.length - 1)];
  const start = at(startByte);
  const end = at(endByte);
  let lo = 0, hi = lines.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lines[mid] <= start) lo = mid; else hi = mid - 1; }
  let column = 1;
  for (let i = lines[lo]; i < start; i++) {
    const c = file.text.charCodeAt(i);
    if (c < 0xdc00 || c > 0xdfff) column++;
  }
  return { start, end, line: lo + 1, column };
}

/**
 * A file's offsets, made once: the UTF-16 offset of each byte, and where
 * each line starts (UTF-16).
 */
const indexes = new WeakMap();

function indexOf(file) {
  let index = indexes.get(file);
  if (!index) {
    const { bytes, text } = file;
    const units = new Uint32Array(bytes.length + 1);
    let u = 0;
    for (let i = 0; i < bytes.length; i++) {
      units[i] = u;
      const b = bytes[i];
      // A sequence's lead byte: four bytes are two UTF-16 units.
      if ((b & 0xc0) !== 0x80) u += b >= 0xf0 ? 2 : 1;
    }
    units[bytes.length] = u;
    const lines = [0];
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10)) lines.push(i + 1);
    }
    index = { units, lines };
    indexes.set(file, index);
  }
  return index;
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
  return { module, instance, exports: convertExports(promisifyExports(instance, spec.promises), spec.exports) };
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
