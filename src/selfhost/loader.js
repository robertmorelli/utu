// src/selfhost/loader.js — the JavaScript that ships beside a built module.
//
// A module the compiler builds imports what its spec says the host gives:
// `@es` bodies (the glue module), closures, promises, hosted mems, and the
// exception tag. The loader is the least JavaScript that gives exactly
// those: each runtime piece (a closure's `closure_new`, an `await_*`, …) is
// imported only when the module imports it, so a bundler leaves the rest out.

import { glueModuleSource, glueName, splitBody } from '../runtime/host-imports.js';

/**
 * The glue module's source: the bodies of the `@es` imports. Empty when there
 * are none. Given the module's bytes, only the bodies its loader imports.
 */
export function glueSource(spec, wasmBytes = null) {
  if (!wasmBytes) return glueModuleSource(spec.es ?? {});
  const { firsts } = esImports(spec, moduleImports(wasmBytes));
  return glueModuleSource(spec.es ?? {}, new Set(firsts.values()));
}

const moduleImports = wasmBytes => WebAssembly.Module.imports(new WebAssembly.Module(wasmBytes, COMPILE_OPTIONS));

/** The module's exported functions' names. */
export const moduleFunctions = wasmBytes => WebAssembly.Module.exports(new WebAssembly.Module(wasmBytes, COMPILE_OPTIONS)).filter(e => e.kind === 'function').map(e => e.name);

/** The `es` fields the module imports, [field, body] in order, and each body's first field. */
function esImports(spec, entries) {
  const imported = new Set(entries.filter(entry => entry.module === 'es').map(entry => entry.name));
  const fields = Object.entries(Object.assign({}, ...Object.values(spec.es ?? {}))).filter(([field]) => imported.has(field));
  const firsts = new Map();
  for (const [field, body] of fields) if (!firsts.has(body)) firsts.set(body, field);
  return { fields, firsts };
}

/**
 * An ES module that instantiates the built module and exports its
 * instance's exports (as `exports`).
 *
 *   runtime  how to import src/runtime/host-imports.js
 *   glue     how to import the glue module, when there is one
 *   wasm     a JS expression for the module's bytes or a Response for them
 *   streaming  whether `wasm` is a Response (WebAssembly.instantiateStreaming)
 *
 * The import object is a literal of what the module imports, and no more:
 * the glue's exports by name (each body once, though imports of several
 * types share it), an array when the fields are numbered (optimized), and
 * the runtime's pieces each by its own import.
 */
export function loaderSource(spec, wasmBytes, { runtime, glue, wasm, streaming = false }) {
  const entries = moduleImports(wasmBytes);
  const runtimeNames = new Set();
  const use = name => { runtimeNames.add(name); return name; };
  const lines = [];
  const modules = [];
  const { fields, firsts } = esImports(spec, entries);
  if (glue && fields.length) {
    // Each body once: imports of several wasm types may share one.
    let thunk = false;
    const values = fields.map(([, body]) => {
      const name = glueName(firsts.get(body));
      // A body not plainly a function may be a value: its accessor.
      if (isFunction(splitBody(body).expr)) return name;
      thunk = true;
      return `$utuValue(${name})`;
    });
    lines.push(`import { ${[...firsts.values()].map(glueName).join(', ')} } from ${JSON.stringify(glue)};`);
    if (thunk) lines.push('const $utuValue = value => typeof value === \'function\' ? value : () => value;');
    const numbered = fields.every(([field], i) => field === String(i));
    modules.push(`es: ${numbered ? `[${values.join(', ')}]` : `{ ${fields.map(([field], i) => `${field}: ${values[i]}`).join(', ')} }`}`);
  }
  const utu = [];
  for (const { module, name } of entries) {
    if (module !== 'utu') continue;
    if (name === 'closure_new') utu.push(`closure_new: ${use('closureNew')}`);
    else if (name === 'closure_rec') utu.push(`closure_rec: ${use('closureRec')}`);
    else if (name.startsWith('closure_call_')) utu.push(`${name}: ${use('closureApply')}`);
    else if (name === 'promise_then') utu.push(`promise_then: ${use('promiseThen')}`);
    else if (name === 'promise_catch') utu.push(`promise_catch: ${use('promiseCatch')}`);
    else if (name.startsWith('await_')) utu.push(`${name}: ${use('awaitImport')}(${name.startsWith('await_null_') ? 'true' : ''})`);
    else if (name === 'js_tag') utu.push('js_tag:WebAssembly.JSTag');
  }
  if (utu.length || spec.mems) {
    const object = `{${utu.join(',')}}`;
    modules.push(`utu: ${spec.mems ? `${use('memoryImports')}(${JSON.stringify(spec.mems)}, ${object})` : object}`);
  }
  const asyncExports = spec.promises?.asyncExports ?? [];
  let exports = 'instance.exports';
  if (asyncExports.length) {
    const each = asyncExports.map(name => `${JSON.stringify(name)}: ${use('promising')}(instance.exports[${JSON.stringify(name)}])`);
    exports = `{ ...instance.exports, ${each.join(', ')} }`;
  }
  if (spec.exports) exports = `${use('convertExports')}(${exports}, ${JSON.stringify(spec.exports)})`;
  if (runtimeNames.size) lines.unshift(`import { ${[...runtimeNames].join(', ')} } from ${JSON.stringify(runtime)};`);
  const instantiate = streaming ? 'instantiateStreaming' : 'instantiate';
  // Compact: written as it is when nothing is bundled (cli/utu.mjs's build).
  lines.push(`export const {instance}=await WebAssembly.${instantiate}(${wasm},{${modules.join(',')}},${JSON.stringify(COMPILE_OPTIONS)});`);
  lines.push(`export const exports=${exports};`);
  return lines.join('\n') + '\n';
}

/**
 * Whether a body's expression is plainly a function: an arrow, `function`,
 * one of host.utu's es_wrap wrappers (which make one of any body), or a
 * body the glue checks is one (`$utuFn`).
 */
function isFunction(expr) {
  return /^(async\s+)?(function\b|[\w$]+\s*=>|\([^()]*\)\s*=>)/.test(expr)
    || /^\((f => \((p\d+(,p\d+)*)?\) => |v => \(\) => v\)\(|v => \(w => \(\) => w\)\()/.test(expr)
    || expr.startsWith('$utuFn(');
}

const COMPILE_OPTIONS = { builtins: ['js-string'], importedStringConstants: "'" };
