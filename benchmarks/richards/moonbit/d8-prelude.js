// d8 prelude for the MoonBit (wasm-gc) Richards port.
//
// Set globalThis.PORT_DIR to the build output directory (the one holding
// richards.wasm) before loading this script. MoonBit's wasm-gc output for this
// program imports nothing and needs no JS runtime, so the module is compiled
// and instantiated synchronously with an empty import object, and bench(n) is
// defined at once (no PORT_READY). The export returns an i64, which JS sees
// as a BigInt.
(function () {
  const dir = globalThis.PORT_DIR;
  if (typeof dir !== 'string') throw new Error('set globalThis.PORT_DIR first');
  // d8: read(path, 'binary') returns an ArrayBuffer.
  const module = new WebAssembly.Module(read(dir + '/richards.wasm', 'binary'));
  const { exports } = new WebAssembly.Instance(module, {});
  const bench = exports.bench;
  globalThis.bench = (iterations) => bench(iterations);
})();
