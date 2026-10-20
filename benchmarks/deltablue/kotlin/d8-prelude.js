// d8 prelude for the Kotlin/Wasm (wasmJs, WasmGC) DeltaBlue port.
//
// Set globalThis.PORT_DIR to the build output directory (the one holding
// deltablue.wasm, deltablue.mjs, deltablue.import-object.mjs and
// deltablue.js-builtins.mjs) before loading this script. It import()s the
// generated deltablue.mjs, which detects d8, reads deltablue.wasm with
// read(..., 'binary'), instantiates it, and exports benchChain /
// benchProjection; the prelude then defines chain(iterations) and
// projection(iterations).
//
// ES modules load asynchronously (on d8's message loop, after all script
// files), so callers wait on globalThis.PORT_READY:
// PORT_READY.then(() => chain(20)).
(function () {
  const dir = globalThis.PORT_DIR;
  if (typeof dir !== 'string') throw new Error('set globalThis.PORT_DIR first');
  globalThis.PORT_READY = import(dir + '/deltablue.mjs')
    .then((m) => {
      globalThis.chain = (iterations) => m.benchChain(iterations);
      globalThis.projection = (iterations) => m.benchProjection(iterations);
    })
    .catch((e) => { print('kotlin prelude failed: ' + e + '\n' + e.stack); quit(1); });
})();
