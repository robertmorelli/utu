import { wasmImports } from './wasm-imports.js';

// runtime/host-imports.js — the host half of utu's runtime contract
//
// The backend plan owns what the runtime needs and compatibility projection
// stamps that plan onto the document; this builds the matching
// import object. Kept dependency-free and separate from the compiler because
// two very different callers need it:
//
//   • `buildImportObject` in src/index.js, for embedders and tests
//   • the standalone launcher `utu build-exe` generates, which is compiled by
//     `bun build --compile` and must not drag the compiler in
//
// Before this module existed the launcher carried its own copy, and adding the
// closure runtime to one did not add it to the other — `build-exe` on any
// program using a closure failed at instantiation with a missing import.

// The runtime is split into independent pieces on purpose. Bundlers cannot
// tree-shake across a runtime branch, so while this was one function with
// `if (closureSpec)` inside it, every program shipped the promise code, the
// JSPI code, and the closure code whether or not it used any of them —
// measured at 949 B gzipped for DeltaBlue, which uses none of the three.
// Importing only the needed piece brings that to ~134 B. Generated loaders
// should call the specific builders; `utuRuntimeImports` remains for callers
// that hold a document and want everything decided for them.

/**
 * Promise subscription. `p` is a real JS promise and `f` a real JS function, so
 * these are the identity — the platform call is written out in full only
 * because wasm cannot name `.then` itself.
 */
export function promiseImports(promiseSpec, utu = {}) {
  for (const op of promiseSpec?.ops ?? []) {
    if (op === 'promise_then') utu.promise_then = (p, f) => { p.then(f); };
    if (op === 'promise_catch') utu.promise_catch = (p, f) => { p.catch(f); };
  }
  return utu;
}

/**
 * `await` — the import is wrapped in WebAssembly.Suspending, which is what
 * actually suspends the wasm stack until the promise settles. There is no
 * compiler-side transform: utu emits an ordinary call and the host does the
 * work. One import per awaited value type, since wasm imports are monomorphic.
 */
export function awaitImports(promiseSpec, utu = {}) {
  for (const type of promiseSpec?.awaits ?? []) {
    if (typeof WebAssembly.Suspending !== 'function') {
      throw new Error(
        'utu: `await` needs JS Promise Integration (WebAssembly.Suspending), ' +
        'which this host does not provide — use `.then` instead, or run on a ' +
        'JSPI-capable host (Chrome 126+, Node 23+, Bun)',
      );
    }
    utu[`await_${type}`] = new WebAssembly.Suspending(async (p) => await p);
  }
  return utu;
}

/**
 * Closure construction and invocation.
 *
 * `closure_new` closes a JS function over a wasm function reference and its
 * environment. The funcref arrives already callable, so there is no table
 * lookup — the result is an ordinary JS function, which is what makes a utu
 * closure usable as a JS callback anywhere. A null environment marks a decayed
 * `fun`, which has no environment parameter to prepend, unless flag 2 says
 * the environment is a capture (which may be null).
 *
 * The closure also keeps `record`, a wasm struct of the funcref and the
 * environment, under a symbol. A call from utu reads it back (`closure_rec`)
 * and calls the body itself with `call_ref`: the import returns at once, so
 * no JS frame stays on the stack and an `await` in the body can suspend. The
 * JS function stays the closure's identity (`===`, removeEventListener).
 *
 * Every `closure_call_*` field is the *same* function — invoking a JS callable,
 * for a JS function utu did not make (`closure_rec` gives null for it).
 * They differ only in wasm signature, since wasm imports are monomorphic, so one
 * shared implementation is aliased under every name the program needs. That
 * makes the cost of an extra arity one property assignment, not one function.
 */
const CLOSURE_REC = Symbol('utu.closure');

export function closureImports(closureSpec, utu = {}) {
  if (!closureSpec) return utu;
  if (closureSpec.new) {
    // flags: 1, the result is a Bool; 2, the environment is there even when
    // null (a closure whose one capture is its environment).
    utu.closure_new = (fn, env, flags, record) => {
      const invoke = env == null && !(flags & 2) ? (...args) => fn(...args) : (...args) => fn(env, ...args);
      const closure = flags & 1 ? (...args) => !!invoke(...args) : invoke;
      closure[CLOSURE_REC] = record;
      return closure;
    };
  }
  utu.closure_rec = closure => closure?.[CLOSURE_REC] ?? null;
  const apply = (closure, ...args) => closure(...args);
  for (const field of closureSpec.calls ?? []) utu[field] = apply;
  return utu;
}

// The typed array each mem kind reads as.
const MEM_ARRAYS = {
  U8: 'Uint8Array', I8: 'Int8Array', U16: 'Uint16Array', I16: 'Int16Array', I32: 'Int32Array',
  U32: 'Uint32Array', I64: 'BigInt64Array', U64: 'BigUint64Array', F32: 'Float32Array', F64: 'Float64Array',
};

/**
 * Mems the host reads and writes (`copy_in`, `view`). Their memories are
 * created here and imported by the module, so these functions hold the memory
 * itself and need no reference to the instance.
 *
 *   copy_in(bytes)    copy an ArrayBuffer, a typed array, or a string (as UTF-8)
 *                     into the mem from element 0; returns the new length
 *   view(start, end)  a typed array over elements [start, end), sharing memory
 *
 * @param {Array<{name: string, kind: string, host?: boolean}>} mems  parsed `data-mems`
 */
export function memoryImports(mems, utu = {}) {
  const PAGE = 65536;
  for (const { name, kind, host, data } of mems ?? []) {
    if (!host) continue;
    // An initialized mem's data segment must fit when the module instantiates.
    const initial = Math.max(1, Math.ceil((data ? (data.length * 3) / 4 : 0) / PAGE));
    const memory = new WebAssembly.Memory({ initial, maximum: 65535 });
    const View = globalThis[MEM_ARRAYS[kind]];
    const size = View.BYTES_PER_ELEMENT;
    const fit = bytes => {
      const pages = Math.ceil(bytes / PAGE) - memory.buffer.byteLength / PAGE;
      if (pages > 0) memory.grow(pages);
    };
    utu[`mem_${name}`] = memory;
    utu[`mem_copy_in_${name}`] = value => {
      if (typeof value === 'string') {
        fit(value.length * 3);
        return Math.floor(new TextEncoder().encodeInto(value, new Uint8Array(memory.buffer)).written / size);
      }
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      fit(bytes.byteLength);
      new Uint8Array(memory.buffer).set(bytes);
      return Math.floor(bytes.byteLength / size);
    };
    utu[`mem_view_${name}`] = (start, end) => new View(memory.buffer, start * size, end - start);
  }
  return utu;
}

/** True when some mem is created by the host. */
export function memoriesAreHosted(mems) {
  return (mems ?? []).some(mem => mem.host);
}

/** `try`/`catch` catches host exceptions through the engine's JS exception tag. */
export function exceptionImports(utu = {}) {
  utu.js_tag = WebAssembly.JSTag;
  return utu;
}

/**
 * Build the whole `utu` import namespace from the stamped specs.
 *
 * Convenience for callers that have a document in hand and are not shipping the
 * result over the wire. Size-sensitive loaders should import the specific
 * builders above so the unused ones can be shaken.
 *
 * @param {object|null} closureSpec  parsed `data-closure-runtime`
 * @returns {Record<string, Function>} the `utu` module's fields
 */
export function utuRuntimeImports(closureSpec, promiseSpec = null) {
  const utu = {};
  promiseImports(promiseSpec, utu);
  awaitImports(promiseSpec, utu);
  closureImports(closureSpec, utu);
  return utu;
}

/** True when a program needs no `utu` runtime namespace at all. */
export function runtimeIsEmpty(closureSpec, promiseSpec) {
  return !closureSpec?.new
    && (closureSpec?.calls ?? []).length === 0
    && (promiseSpec?.ops ?? []).length === 0
    && (promiseSpec?.awaits ?? []).length === 0;
}

/**
 * Wrap every export that can await so calling it returns a promise.
 *
 * JSPI can only suspend a wasm stack that was entered through a `promising`
 * wrapper, so this has to happen before any async entry point is called. The
 * compiler records which exports qualify.
 *
 * @returns {Record<string, Function>} exports, with async ones promisified
 */
export function promisifyExports(instance, promiseSpec) {
  const names = promiseSpec?.asyncExports ?? [];
  if (names.length === 0) return instance.exports;
  const exports = { ...instance.exports };
  for (const name of names) {
    if (typeof exports[name] === 'function') {
      exports[name] = WebAssembly.promising(exports[name]);
    }
  }
  return exports;
}

/**
 * Give exports' results as JavaScript has them, and check their arguments.
 * Wasm returns a Bool as 1 or 0, and a U32 or U64 as signed; the compiler
 * records which exports return one, by name: `{ main: 'U32' }`, or
 * `{ f: { r: ['U32', '', 'Bool'], p: ['Str', '?'] } }` for a tuple result
 * (a kind per element) or checked arguments. Wasm wraps a JS number or
 * BigInt to its bits, and `true` to 1, but takes any value as a reference;
 * safe builds record what each argument must be:
 *   'Str'  a string            '?Str'  a string or null (undefined is null)
 *   'ref'  not null            '?'     anything (undefined is null)
 * A promised result converts when it settles.
 *
 * @returns {Record<string, Function>} exports, with those results converted
 */
export function convertExports(exports, exportSpec) {
  if (!exportSpec) return exports;
  const scalar = { Bool: v => v !== 0, U32: v => v >>> 0, U64: v => BigInt.asUintN(64, v) };
  const same = v => v;
  const fail = (name, i, what, v) => {
    throw new TypeError(`${name}: argument ${i + 1} must be ${what}, not ${v === null ? 'null' : typeof v}`);
  };
  const param = (name, kind, i) => {
    if (kind === 'Str') return v => (typeof v === 'string' ? v : fail(name, i, 'a string', v));
    if (kind === '?Str') return v => (v == null ? null : typeof v === 'string' ? v : fail(name, i, 'a string or null', v));
    if (kind === 'ref') return v => (v == null ? fail(name, i, 'a value', v) : v);
    if (kind === '?') return v => (v === undefined ? null : v);
    return same;
  };
  const out = { ...exports };
  for (const [name, spec] of Object.entries(exportSpec)) {
    const f = exports[name];
    if (typeof f !== 'function') continue;
    const r = typeof spec === 'string' ? spec : spec.r;
    const each = Array.isArray(r) ? r.map(k => scalar[k] ?? same) : null;
    const convert = each ? v => v.map((x, i) => each[i](x)) : scalar[r] ?? same;
    const checks = (typeof spec === 'string' ? [] : spec.p ?? []).map((k, i) => param(name, k, i));
    out[name] = (...args) => {
      for (let i = 0; i < checks.length; i++) args[i] = checks[i](args[i]);
      const result = f(...args);
      return result instanceof Promise ? result.then(convert) : convert(result);
    };
    // Its parameters, as the export's (a caller may count them).
    Object.defineProperty(out[name], 'length', { value: f.length });
  }
  return out;
}

// ---------------------------------------------------------------------------
// `@es` glue
//
// An `@es` body is a JavaScript *expression*. Emitting those expressions as
// exports of a real ES module — rather than evaluating each one through
// `new Function` — is what lets a body reach the npm ecosystem, because module
// scope is the only place `import` and top-level `await` are legal:
//
//     let chunk: fun(Externref, I32) Externref =
//         @es/\(await import('lodash-es')).chunk\/;
//
// `new Function` cannot express that at any level of cleverness: its body is a
// function body, so a static `import` is a syntax error and a dynamic `import()`
// yields a promise rather than the module. Hence the module form, and hence
// every consumer of the import object being async.

// A body may open with `import` declarations, which are hoisted to module
// scope. This is the *preferred* spelling, and not only for looks:
//
//     @es/\ import { valid } from 'semver'; (v) => valid(v) \/
//
// A named import lets the bundler tree-shake inside the package. The
// `(await import('pkg')).member` form pulls in the whole namespace and defeats
// that — measured at 125x more bundled bytes for a package with independent
// exports. See IMPORTANT_MINIFICATION_INFO.md.
const IMPORT_DECL = /^\s*import\s[^;]*;/;

/** Split a body into its hoistable import declarations and its expression. */
function splitBody(body) {
  const imports = [];
  let rest = body;
  for (let m = rest.match(IMPORT_DECL); m; m = rest.match(IMPORT_DECL)) {
    imports.push(m[0].trim());
    rest = rest.slice(m[0].length);
  }
  return { imports, expr: rest.trim() };
}

/**
 * Render the `@es` import spec as ES module source, one export per import.
 *
 * Field names are compiler-generated (`__es_1`, …) and therefore already valid
 * identifiers, so they are used as export names directly. Bodies are wrapped in
 * parentheses to keep them in expression position, and any leading `import`
 * declarations are hoisted above every export and deduplicated.
 *
 * @param {Record<string, Record<string, string>>} importSpec  parsed `data-dsl-imports-js`
 * @param {Set<string>} [live]  if given, only these field names are emitted
 * @returns {string} module source
 */
export function glueModuleSource(importSpec, live = null) {
  const hoisted = new Set();
  const lines = [];
  for (const fields of Object.values(importSpec ?? {})) {
    for (const [field, body] of Object.entries(fields ?? {})) {
      if (live && !live.has(field)) continue;
      const { imports, expr } = splitBody(body);
      for (const decl of imports) hoisted.add(decl);
      lines.push(`export const ${field} = (\n${expr}\n);`);
    }
  }
  if (lines.length === 0) return '';
  const prologue = hoisted.size ? `${[...hoisted].join('\n')}\n\n` : '';
  return `${prologue}${lines.join('\n\n')}\n`;
}

/**
 * Field names the emitted binary actually imports.
 *
 * Codegen already drops unused `@es` bindings from the wasm — a program with
 * 100 declared and 1 used emits a binary byte-identical to declaring 1 — but the
 * stamped spec still lists all 100, so without this filter the glue module
 * carries dead bodies and loads their packages at runtime.
 *
 * @returns {Promise<Set<string>>} live import field names
 */
export async function liveGlueFields(wasm) {
  // Engine-provided strings/builtins need no JS glue. Their names may even
  // coincide with a dead host binding, so do not let them keep wrappers alive.
  return new Set(wasmImports(wasm)
    .filter(entry => entry.module !== "'" && entry.module !== 'wasm:js-string')
    .map(entry => entry.name));
}

/** True when the spec declares no `@es` imports, so no glue module is needed. */
export function glueIsEmpty(importSpec) {
  return Object.values(importSpec ?? {}).every(fields => Object.keys(fields ?? {}).length === 0);
}

/**
 * Assemble wasm import namespaces from an evaluated glue module.
 *
 * A non-function import is a *value* import, which the compiler represents as a
 * zero-arg accessor (see `buildValueWrapper`), so it is wrapped in a thunk here.
 * This rule is shared with the eval path so the two cannot disagree.
 */
export function importObjectFromGlue(importSpec, glue) {
  const imports = {};
  for (const [module, fields] of Object.entries(importSpec ?? {})) {
    imports[module] = {};
    for (const field of Object.keys(fields ?? {})) {
      // Absent means the binding was shaken out of both the wasm and the glue,
      // so there is nothing for the host to supply.
      if (!(field in glue)) continue;
      const value = glue[field];
      imports[module][field] = typeof value === 'function' ? value : () => value;
    }
  }
  return imports;
}

/**
 * Assemble wasm import namespaces by evaluating each body in isolation.
 *
 * The pre-module fallback, kept for hosts with no module loader (the VS Code
 * web extension, sandboxed embedders). Bodies that use `import` or top-level
 * `await` do not work here — that is precisely what the glue module exists for.
 */
export function importObjectFromEval(importSpec) {
  const imports = {};
  for (const [module, fields] of Object.entries(importSpec ?? {})) {
    imports[module] = {};
    for (const [field, body] of Object.entries(fields ?? {})) {
      const value = new Function(`return (${body});`)();
      imports[module][field] = typeof value === 'function' ? value : () => value;
    }
  }
  return imports;
}

/** Read a JSON spec stamped on the document root, tolerating absence. */
export function readRuntimeSpec(root, key) {
  try {
    return JSON.parse(root?.dataset?.[key] || 'null');
  } catch {
    return null;
  }
}
