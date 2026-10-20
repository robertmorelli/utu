// d8 prelude for the Kotlin/Wasm (wasmJs, WasmGC) nbody port.
//
// Set globalThis.PORT_DIR to the build output directory (the one holding
// nbody.wasm, nbody.mjs, nbody.import-object.mjs and nbody.js-builtins.mjs)
// before loading this script. It import()s the generated nbody.mjs, which
// detects d8, reads nbody.wasm with read(..., 'binary'), instantiates it, and
// exports bench; the prelude then defines bench(iterations), which returns a
// BigInt (Kotlin's Long crosses to JavaScript as a BigInt).
//
// ES modules load asynchronously (on d8's message loop, after all script
// files), so callers wait on globalThis.PORT_READY:
// PORT_READY.then(() => bench(1)).
(function () {
  const dir = globalThis.PORT_DIR;
  if (typeof dir !== 'string') throw new Error('set globalThis.PORT_DIR first');
  globalThis.PORT_READY = import(dir + '/nbody.mjs')
    .then((m) => {
      globalThis.bench = (iterations) => m.bench(iterations);
    })
    .catch((e) => { print('kotlin prelude failed: ' + e + '\n' + e.stack); quit(1); });
})();
