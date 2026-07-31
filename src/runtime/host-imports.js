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

/**
 * Build the `utu` import namespace from the specs stamped on the document root.
 *
 * @param {object|null} closureSpec  parsed `data-closure-runtime`
 * @returns {Record<string, Function>} the `utu` module's fields
 */
export function utuRuntimeImports(closureSpec, promiseSpec = null) {
  const utu = {};

  // Promise subscription. `p` is a real JS promise and `f` a real JS function,
  // so these are the identity — the platform call is written out in full only
  // because wasm cannot name `.then` itself.
  for (const op of promiseSpec?.ops ?? []) {
    if (op === 'promise_then') utu.promise_then = (p, f) => { p.then(f); };
    if (op === 'promise_catch') utu.promise_catch = (p, f) => { p.catch(f); };
  }

  // `await` — the import is wrapped in WebAssembly.Suspending, which is what
  // actually suspends the wasm stack until the promise settles. There is no
  // compiler-side transform: utu emits an ordinary call and the host does the
  // work. One import per awaited value type, since wasm imports are
  // monomorphic.
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

  if (!closureSpec) return utu;

  // `closure_new` closes a JS function over a wasm function reference and its
  // environment. The funcref arrives already callable, so there is no table
  // lookup — the result is an ordinary JS function, which is what makes a utu
  // closure usable as a JS callback anywhere. A null environment marks a
  // decayed `fun`, which has no environment parameter to prepend.
  if (closureSpec.new) {
    utu.closure_new = (fn, env) =>
      (env == null ? (...args) => fn(...args) : (...args) => fn(env, ...args));
  }

  // Every `closure_call_*` import is the same function — invoking a JS
  // callable. They differ only in wasm signature, since wasm imports are
  // monomorphic.
  for (const field of closureSpec.calls ?? []) {
    utu[field] = (closure, ...args) => closure(...args);
  }

  return utu;
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

/** Read a JSON spec stamped on the document root, tolerating absence. */
export function readRuntimeSpec(root, key) {
  try {
    return JSON.parse(root?.dataset?.[key] || 'null');
  } catch {
    return null;
  }
}
