// d8 prelude for the Dart (dart2wasm) DeltaBlue port.
//
// Set globalThis.PORT_DIR to the build output directory (the one holding
// deltablue.wasm and deltablue.mjs) before loading this script. It imports
// dart2wasm's generated JS runtime, compiles and instantiates the module, runs
// Dart's main() (which sets globalThis.bench_chain / bench_projection), and
// defines chain(iterations) / projection(iterations).
//
// Loading is asynchronous (the .mjs API is promise-based and WebAssembly.compile
// completes on d8's message loop, which runs only after all script files), so
// callers wait on globalThis.PORT_READY: PORT_READY.then(() => chain(20)).
(function () {
  const dir = globalThis.PORT_DIR;
  if (typeof dir !== 'string') throw new Error('set globalThis.PORT_DIR first');
  // d8: read(path, 'binary') returns an ArrayBuffer.
  const bytes = read(dir + '/deltablue.wasm', 'binary');
  globalThis.PORT_READY = import(dir + '/deltablue.mjs')
    .then((runtime) => runtime.compile(bytes))
    .then((compiled) => compiled.instantiate({}))
    .then((app) => {
      app.invokeMain();
      const benchChain = globalThis.bench_chain;
      const benchProjection = globalThis.bench_projection;
      globalThis.chain = (iterations) => benchChain(iterations);
      globalThis.projection = (iterations) => benchProjection(iterations);
    })
    .catch((e) => { print('dart prelude failed: ' + e + '\n' + e.stack); quit(1); });
})();
