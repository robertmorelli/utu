// src/selfhost/loader.js — the JavaScript that ships beside a built module.
//
// A module the compiler builds imports what its spec says the host gives:
// `@es` bodies (the glue module), closures, promises, hosted mems, and the
// exception tag. The loader is the least JavaScript that gives exactly
// those: each runtime piece is imported only when the module uses it, so a
// bundler leaves the rest out.

import { glueModuleSource } from '../runtime/host-imports.js';

/** The glue module's source: the bodies of the `@es` imports. Empty when there are none. */
export function glueSource(spec) {
  return glueModuleSource(spec.es ?? {});
}

/**
 * An ES module that instantiates the built module and exports its
 * instance's exports (as `exports`, and each by name when `named`).
 *
 *   runtime  how to import src/runtime/host-imports.js
 *   glue     how to import the glue module, when there is one
 *   wasm     a JS expression for the module's bytes or a Response for them
 *   streaming  whether `wasm` is a Response (WebAssembly.compileStreaming)
 */
export function loaderSource(spec, wasmBytes, { runtime, glue, wasm, streaming = false }) {
  const imported = new Set(WebAssembly.Module.imports(new WebAssembly.Module(wasmBytes, COMPILE_OPTIONS)).map(entry => `${entry.module}.${entry.name}`));
  const runtimeNames = [];
  const lines = [];
  const body = [];
  const es = spec.es ?? {};
  // Only the fields' names: the glue module holds the bodies.
  const fields = Object.fromEntries(Object.entries(es).map(([module, bindings]) => [module, Object.fromEntries(Object.keys(bindings).map(name => [name, '']))]));
  if (glue && Object.values(fields).some(bindings => Object.keys(bindings).length)) {
    runtimeNames.push('importObjectFromGlue');
    lines.push(`import * as glue from ${JSON.stringify(glue)};`);
    body.push(`const imports = importObjectFromGlue(${JSON.stringify(fields)}, glue);`);
  } else {
    body.push('const imports = {};');
  }
  if (spec.closures) {
    runtimeNames.push('closureImports');
    body.push(`imports.utu = closureImports(${JSON.stringify(spec.closures)}, imports.utu);`);
  }
  if (spec.mems) {
    runtimeNames.push('memoryImports');
    body.push(`imports.utu = memoryImports(${JSON.stringify(spec.mems)}, imports.utu);`);
  }
  if (spec.promises) {
    runtimeNames.push('promiseImports', 'awaitImports', 'promisifyExports');
    body.push(`imports.utu = awaitImports(${JSON.stringify(spec.promises)}, promiseImports(${JSON.stringify(spec.promises)}, imports.utu));`);
  }
  if (imported.has('utu.js_tag')) {
    runtimeNames.push('exceptionImports');
    body.push('imports.utu = exceptionImports(imports.utu);');
  }
  if (runtimeNames.length) lines.unshift(`import { ${runtimeNames.join(', ')} } from ${JSON.stringify(runtime)};`);
  const compile = streaming ? 'compileStreaming' : 'compile';
  body.push(`const module = await WebAssembly.${compile}(${wasm}, ${JSON.stringify(COMPILE_OPTIONS)});`);
  body.push('export const instance = await WebAssembly.instantiate(module, imports);');
  body.push(spec.promises
    ? `export const exports = promisifyExports(instance, ${JSON.stringify(spec.promises)});`
    : 'export const exports = instance.exports;');
  return [...lines, ...body].join('\n') + '\n';
}

const COMPILE_OPTIONS = { builtins: ['js-string'], importedStringConstants: "'" };
