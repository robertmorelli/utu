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
 * `fun`, which has no environment parameter to prepend.
 *
 * Every `closure_call_*` field is the *same* function — invoking a JS callable.
 * They differ only in wasm signature, since wasm imports are monomorphic, so one
 * shared implementation is aliased under every name the program needs. That
 * makes the cost of an extra arity one property assignment, not one function.
 */
export function closureImports(closureSpec, utu = {}) {
  if (!closureSpec) return utu;
  if (closureSpec.new) {
    utu.closure_new = (fn, env, booleanResult) => {
      const invoke = env == null ? (...args) => fn(...args) : (...args) => fn(env, ...args);
      return booleanResult ? (...args) => !!invoke(...args) : invoke;
    };
  }
  const apply = (closure, ...args) => closure(...args);
  for (const field of closureSpec.calls ?? []) utu[field] = apply;
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
