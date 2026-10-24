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
  convertExports, memoryImports, promiseImports, promisifyExports, splitBody,
} from '../runtime/host-imports.js';
import { compressedSourceWarnings, unknownIslandWarnings } from '../compiler/source-warnings.js';
import { abiFromJson } from '../bindings/schema.js';

/** How a file joins the program. */
export const ROLE = { entry: 0, import: 1, prelude: 2 };

/** What a build is for: a module's exports, its tests, @comptime values, or its benches. */
export const TARGET = { normal: 0, test: 1, comptime: 2, bench: 3 };

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

/**
 * The compiler's own build grows no body past this many nodes by moving
 * in what is called once (-O small; `moveLimit`, other builds: no limit).
 * V8 optimizes a hot function whole, on another thread, and a process ends
 * only once the function being optimized is: `compile_program` and
 * `check_expr`, 35 KB each so, took 60 to 190 ms, past the end of most
 * builds (and compile_program runs once: its optimized code never ran).
 */
export const SELF_MOVE_LIMIT = 3000;

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
  const { target = 'normal', optimize = 'size', debugNames = false, safe = false, sourceMap = false, blame = false, profile = false, run = false } = { ...host, ...chosen };
  utu.set_optimize(OPTIMIZE[optimize] ?? OPTIMIZE.size);
  utu.set_safe(safe ? 1 : 0);
  utu.set_debug_names(debugNames ? 1 : 0);
  utu.set_move_limit?.(host.moveLimit ?? 0);
  // Blame reads the source map: keeping one changes nothing built.
  utu.set_source_map?.(sourceMap || blame ? 1 : 0);
  utu.set_profile?.(profile ? 1 : 0);
  // utu run's: readers of an array main's result (`run:len:k`, `run:at:k`).
  utu.set_run?.(run ? 1 : 0);
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
  const wrongEs = esSyntax(utu, files);
  const diagnostics = readDiagnostics(utu, files).concat(wrongEs, sourceWarnings(files));
  if (size < 0 || wrongEs.length) return { wasm: null, spec: null, diagnostics, files };
  return {
    ...builtModule(utu, size), diagnostics, files,
    tests: target === 'test' ? readTests(utu) : [], benches: target === 'bench' ? readBenches(utu) : [],
    map: sourceMap && utu.map_count ? readSourceMap(utu, files) : null,
    blame: blame && utu.blame_prepare ? readBlameTables(utu, files) : null,
    ...(profile ? { frames: readFrames(utu, files) } : {}),
    ...(run && utu.run_levels?.() > 0 ? { array: { levels: utu.run_levels(), leaf: utu.run_leaf() } } : {}),
  };
}

/**
 * A profile build's frames (selfhost/profile.utu), by id: each one's name
 * (`Stack[I32].top`, `closure in main`), and the file and line its function
 * starts at.
 */
function readFrames(utu, files) {
  const where = placer(files);
  const frames = [];
  for (let k = 0; k < utu.profile_count(); k++) {
    const at = utu.profile_at(k);
    const place = at >= 0 ? where(at) : null;
    frames.push({ name: utu.profile_name(k), file: place?.file.key ?? null, line: place?.line ?? null });
  }
  return frames;
}

/** A bench build's benches: each one's export (`__bench_k(n)`) and name. */
function readBenches(utu) {
  const benches = [];
  for (let k = 0; k < utu.bench_count(); k++) {
    benches.push({ export: `__bench_${k}`, name: modPrefix(utu, utu.bench_mod_start(k), utu.bench_mod_end(k)) + stringValue(textAt(utu.src, utu.bench_name_start(k), utu.bench_name_end(k))) });
  }
  return benches;
}

/**
 * A byte of the compiler's src as its file, 1-based line and column (a
 * column counts characters, as a terminal shows them; `unit` counts UTF-16
 * units, as editors and source maps do; a line ends at \n, \r\n, or a lone
 * \r), and UTF-16 offset in the file; null outside the files.
 */
export function placer(files) {
  const ordered = files.toSorted((a, b) => a.offset - b.offset);
  const lines = new Map();
  return byte => {
    let lo = 0, hi = ordered.length - 1, file = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (ordered[mid].offset <= byte) { file = ordered[mid]; lo = mid + 1; } else hi = mid - 1; }
    if (!file || byte > file.offset + file.bytes.length) return null;
    // Each line's start, as a byte and as a UTF-16 offset.
    let starts = lines.get(file);
    if (!starts) {
      starts = { bytes: [0], units: [0] };
      const { bytes } = file;
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] !== 10 && (bytes[i] !== 13 || bytes[i + 1] === 10)) continue;
        const from = starts.bytes.at(-1);
        starts.units.push(starts.units.at(-1) + decoder.decode(bytes.subarray(from, i + 1)).length);
        starts.bytes.push(i + 1);
      }
      lines.set(file, starts);
    }
    const local = byte - file.offset;
    lo = 0; hi = starts.bytes.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts.bytes[mid] <= local) lo = mid; else hi = mid - 1; }
    const before = decoder.decode(file.bytes.subarray(starts.bytes[lo], local));
    let column = 1;
    for (let i = 0; i < before.length; i++) { const c = before.charCodeAt(i); if (c < 0xdc00 || c > 0xdfff) column++; }
    return { file, line: lo + 1, column, unit: before.length + 1, offset: starts.units[lo] + before.length };
  };
}

/**
 * The last module's source map (see src/selfhost/sourcemap.js): by entry,
 * in offset order, an instruction's byte offset in the module and the
 * syntax it was made for (file, 1-based line and column, UTF-16 span in the
 * file, node kind), with the function that syntax is in (`owner`, and
 * `ownerAt`, where it starts in the compiler's source) and, for code inlined
 * from it, the call it is at (`site`: file, line, column, span); and by
 * function of the module, where it was declared (as `ownerAt`), or null.
 */
export function readSourceMap(utu, files) {
  const where = placer(files);
  // Entries share syntax: each node's place, kind and owner read once.
  const places = new Map();
  const kinds = new Map();
  const owners = new Map();
  const entries = [];
  for (let k = 0; k < utu.map_count(); k++) {
    const startByte = utu.map_start(k);
    const endByte = utu.map_end(k);
    const key = `${startByte}:${endByte}`;
    let syntax = places.get(key);
    if (!syntax) {
      const at = startByte >= 0 ? where(startByte) : null;
      const kind = utu.map_kind(k);
      if (!kinds.has(kind)) kinds.set(kind, kind >= 0 ? utu.node_kind_name(kind) : null);
      const ownerAt = utu.map_owner_start(k);
      if (ownerAt >= 0 && !owners.has(ownerAt)) owners.set(ownerAt, utu.map_owner_name(k));
      syntax = {
        file: at?.file.key ?? null, line: at?.line ?? null, column: at?.column ?? null, unit: at?.unit ?? null,
        start: at?.offset ?? null, end: at ? where(endByte)?.offset ?? at.offset : null, kind: kinds.get(kind),
        owner: ownerAt >= 0 ? owners.get(ownerAt) : null, ownerAt: ownerAt >= 0 ? ownerAt : null,
      };
      places.set(key, syntax);
    }
    // Code inlined from another function: the call it is at.
    const siteByte = utu.map_site_start?.(k) ?? -1;
    const site = siteByte >= 0 ? where(siteByte) : null;
    entries.push({
      at: utu.map_offset(k), ...syntax,
      site: site && { file: site.file.key, line: site.line, column: site.column, start: site.offset, end: where(utu.map_site_end(k))?.offset ?? site.offset },
    });
  }
  const functions = [];
  for (let i = 0; i < utu.map_function_count(); i++) {
    const at = utu.map_function_start(i);
    functions.push(at >= 0 ? at : null);
  }
  return { entries, functions };
}

/** Function roles, as blame_func_role numbers them (selfhost/blame.utu). */
const ROLES = ['defined', 'import', 'helper', 'wat'];

/**
 * What the last module's entities were made for, for blaming its bytes on
 * them (src/selfhost/blame.js): `places`, each syntax node's (file, line,
 * column, UTF-16 span, kind, and its declaration, an index in `decls`); the
 * source map's `entries` (offset in the module, place, and the call it was
 * inlined at), and by index in the module each function's (with its role
 * and name), type's, global's, memory's and data segment's place; -1 for none.
 */
export function readBlameTables(utu, files) {
  utu.blame_prepare();
  const where = placer(files);
  const places = [], decls = [];
  const placeOf = new Map(), declOf = new Map(), kinds = new Map();
  const kindName = node => {
    const kind = utu.blame_node_kind(node);
    if (!kinds.has(kind)) kinds.set(kind, kind >= 0 ? utu.node_kind_name(kind) : null);
    return kinds.get(kind);
  };
  const span = node => {
    const at = where(utu.blame_node_start(node));
    return at && { file: at.file.key, line: at.line, column: at.column, start: at.offset, end: where(utu.blame_node_end(node))?.offset ?? at.offset };
  };
  const declIndex = node => {
    if (node < 0) return -1;
    if (!declOf.has(node)) {
      const at = span(node);
      declOf.set(node, at ? decls.push({ name: utu.blame_decl_name(node), kind: kindName(node), ...at }) - 1 : -1);
    }
    return declOf.get(node);
  };
  const place = node => {
    if (node < 0) return -1;
    if (!placeOf.has(node)) {
      const at = span(node);
      placeOf.set(node, at ? places.push({ ...at, kind: kindName(node), decl: declIndex(utu.blame_decl(node)) }) - 1 : -1);
    }
    return placeOf.get(node);
  };
  const entries = [];
  for (let k = 0; k < utu.map_count(); k++) entries.push({ at: utu.map_offset(k), place: place(utu.blame_map_node(k)), site: place(utu.blame_map_site(k)) });
  const funcs = [];
  for (let i = 0; i < utu.map_function_count(); i++) {
    // The name's UTF-8 bytes, a code unit each.
    const name = decoder.decode(Uint8Array.from(utu.blame_func_name(i), c => c.charCodeAt(0)));
    funcs.push({ place: place(utu.blame_func_node(i)), role: ROLES[utu.blame_func_role(i)], name: name || null });
  }
  const each = (count, node) => Array.from({ length: count }, (_, i) => place(node(i)));
  return {
    places, decls, entries, funcs,
    types: each(utu.blame_type_count(), i => utu.blame_type_node(i)),
    globals: each(utu.blame_glob_count(), i => utu.blame_glob_node(i)),
    data: each(utu.blame_data_count(), i => utu.blame_data_node(i)),
    memories: each(utu.blame_memory_count(), i => utu.blame_memory_node(i)),
  };
}

/** A test build's tests: each one's export and name. */
function readTests(utu) {
  const tests = [];
  for (let k = 0; k < utu.test_count(); k++) {
    tests.push({ export: `__test_${k}`, name: modPrefix(utu, utu.test_mod_start(k), utu.test_mod_end(k)) + stringValue(textAt(utu.src, utu.test_name_start(k), utu.test_name_end(k))) });
  }
  return tests;
}

/** A test or bench in mod `geo` is `geo: name`. */
const modPrefix = (utu, start, end) => start < 0 ? '' : `${textAt(utu.src, start, end)}: `;

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
    // A linked declaration file (`tools/dts/cli.mjs` writes `Name.abi.json`).
    const abiFile = !platform && /\.abi\.json"$/.test(raw) ? resolvePath(from.key, JSON.parse(raw)) : null;
    if (/^"?(npm|node):/.test(raw) || abiFile || platform && typeof stdlib.get(raw) === 'function') {
      utu.import_foreign(i);
      foreign.push({ i, raw, from: from.key, abiFile, name: textAt(utu.src, utu.import_name_start(i), utu.import_name_end(i)) });
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
  if (!await bindForeign(utu, foreign, host, readFile)) return loadProgram(utu, entry, host, texts);
  files.diagnostics = utu.resolve();
  await loadEmbeds(utu, entry, files, host);
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

/** std:Prelude and the standard library files it imports, added and parsed; and std:JsonRuntime's text. */
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
  // `@json`'s runtime: text the compiler grafts, not a file.
  const runtime = stdlib.get('std:JsonRuntime');
  if (typeof runtime === 'string' && utu.json_runtime_room) {
    const bytes = encoder.encode(runtime);
    const at = utu.json_runtime_room(bytes.length);
    new Uint8Array(utu.src.buffer).set(bytes, at);
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
    const { prefix, moduleSpecifier, exports, names, mutableGlobals, exportAssignment } = abi;
    decl = { document: typesDocument(abi.types), view: encoder.encode(JSON.stringify({ prefix, moduleSpecifier, exports, names, mutableGlobals, exportAssignment })) };
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
async function bindForeign(utu, foreign, { stdlib, resolvePackage }, readFile) {
  const state = residentOf(utu);
  const bindings = [];
  let missing = false;
  for (const { i, raw, from, abiFile, name } of foreign) {
    let decl;
    try {
      // A platform module gives its declarations ready ({ document, view }), or an ABI.
      const given = abiFile ? abiOfFile(await readFile(abiFile))
        : /^"?(npm|node):/.test(raw) ? await resolvePackage(JSON.parse(raw), { prefix: name, from })
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

/** By text: an .abi.json file's ABI, the same object each time it is read (so @prepare's too). */
const abiFiles = new Map();

function abiOfFile(bytes) {
  const text = typeof bytes === 'string' ? bytes : decoder.decode(bytes);
  if (!abiFiles.has(text)) abiFiles.set(text, abiFromJson(text));
  const abi = abiFiles.get(text);
  if (!abi) throw new Error('Invalid declaration ABI');
  return abi;
}

/** @embed: the files' bytes, read relative to the file that declares the mem. */
async function loadEmbeds(utu, entry, files, { resolvePath = defaultResolvePath, readBinaryFile }) {
  for (let k = 0; k < utu.embed_files(); k++) {
    const rel = textAt(utu.src, utu.embed_path_start(k), utu.embed_path_end(k));
    const from = utu.embed_file ? files[utu.embed_file(k)]?.key ?? entry : entry;
    let bytes;
    try { bytes = await readBinaryFile(resolvePath(from, rel)); } catch { utu.embed_fail(k); continue; }
    const at = utu.embed_set(k, bytes.length);
    new Uint8Array(utu.embed_bytes.buffer).set(bytes, at);
  }
}

/**
 * Compile the loaded program for a target. A program with @comptime mems is
 * first built for evaluating them; that build runs here, and its values go
 * back to the compiler as the mems' contents. A mem read by another's
 * expression goes first: each round builds again with the values so far and
 * runs what no waiting mem holds up; a round that can run none reports the
 * rest as cycles. Returns the module's size in `out`, or -1 when there are
 * diagnostics.
 */
export async function compileProgram(utu, target, host = {}) {
  const count = utu.comptime_mems();
  for (let round = 0; round <= count; round++) {
    const waiting = [];
    // (A compiler before these rounds evaluates all in one.)
    for (let k = 0; k < count; k++) if (utu.comptime_waiting ? utu.comptime_waiting(k) : round === 0) waiting.push(k);
    if (waiting.length === 0) break;
    const size = utu.compile_program(TARGET.comptime);
    if (size < 0) return -1;
    const ready = waiting.filter(k => !utu.comptime_can_run || utu.comptime_can_run(k));
    if (ready.length === 0) {
      for (const k of waiting) utu.comptime_cycle(k);
      break;
    }
    const { wasm, spec } = builtModule(utu, size);
    const { exports } = await instantiate(wasm, spec, host);
    for (const k of ready) {
      const name = utu.comptime_name(k);
      let n;
      // (An expression that awaits gives a promise.)
      try { n = await exports[`__comptime_run_${name}`](); } catch (error) {
        // Reported at the mem, as a diagnostic.
        utu.comptime_fail(k, exports.__comptime_fuel?.value === 0 ? 8 : comptimeTrapCode(error));
        continue;
      }
      const bytes = new Uint8Array(exports[`__comptime_${name}`].buffer, 0, n * utu.comptime_value_size(k)).slice();
      const at = utu.comptime_set(k, n);
      new Uint8Array(utu.comptime_bytes.buffer).set(bytes, at);
    }
  }
  return validIr(utu, utu.compile_program(target));
}

/**
 * A program's own @ir is not checked by the compiler: a module with any is
 * compiled once here, and the engine's reason it is not valid Wasm is
 * reported at each such body. Size `size` of the module just built, or -1.
 */
async function validIr(utu, size) {
  if (size < 0 || !utu.user_ir_count?.()) return size;
  try {
    await WebAssembly.compile(new Uint8Array(utu.out.buffer, 0, size).slice(), COMPILE_OPTIONS);
    return size;
  } catch (error) {
    if (!(error instanceof WebAssembly.CompileError)) throw error;
    const bytes = encoder.encode(String(error.message).replace(/^WebAssembly\.\w+(\(\): | doesn't validate: )/, ''));
    const at = utu.ir_invalid_room(bytes.length);
    new Uint8Array(utu.src.buffer).set(bytes, at);
    utu.ir_invalid_report(at, bytes.length);
    return -1;
  }
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

const AsyncFunction = (async () => {}).constructor;

/**
 * Each `@es` body in the program's own files that is not JavaScript, at
 * its block: the host's parser checks it (as the glue module will hold it),
 * where the host has one (`new Function`; a page whose policy forbids it
 * checks nothing). An `import.meta` is a module's alone: left to the load.
 */
function esSyntax(utu, files) {
  if (!utu.dsl_count) return [];
  const ordered = files.toSorted((a, b) => a.offset - b.offset);
  const fileAt = byte => ordered.findLast(f => f.offset <= byte && byte <= f.offset + f.bytes.length) ?? null;
  const out = [];
  for (let k = 0; k < utu.dsl_count(); k++) {
    const at = utu.es_body_start(k);
    if (at < 0) continue;
    const { expr } = splitBody(textAt(utu.src, at, utu.es_body_end(k)));
    const body = `return (\n${expr}\n);`;
    let wrong = null;
    try { new Function(body); } catch (error) {
      if (!(error instanceof SyntaxError)) continue;
      try { new AsyncFunction(body); } catch (again) { if (again instanceof SyntaxError && !/import\.meta/.test(again.message)) wrong = again; }
    }
    const file = wrong && fileAt(utu.dsl_site_start(k));
    if (!file) continue;
    out.push({
      kind: 'es-syntax', code: 'es-syntax', message: `@es body is not JavaScript: ${wrong.message}`, severity: 'error',
      file: file.key, ...place(file, utu.dsl_site_start(k), utu.dsl_site_end(k)), label: 'here',
    });
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
export async function instantiate(wasm, spec = {}, { loadGlue = null, profiler = null } = {}) {
  const module = await WebAssembly.compile(wasm, COMPILE_OPTIONS);
  const es = spec.es ?? {};
  const source = glueModuleSource(es);
  const imports = !source ? {} : loadGlue ? importObjectFromGlue(es, await loadGlue(source)) : importObjectFromEval(es);
  // A profile build's (src/runtime/profile.js): its exports enter and leave its shadow stack.
  if (profiler) imports.profile = profiler.imports;
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
  const exports = convertExports(promisifyExports(instance, spec.promises), spec.exports);
  return { module, instance, exports: profiler ? profiler.attach(instance, exports) : exports };
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
