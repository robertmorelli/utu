// d8 prelude for the MoonBit (wasm-gc) DeltaBlue port.
//
// Set globalThis.PORT_DIR to the build output directory (the one holding
// deltablue.wasm) before loading this script. MoonBit's wasm-gc output for
// this program imports nothing and needs no JS runtime, so the module is
// compiled and instantiated synchronously with an empty import object, and
// chain(iterations) / projection(iterations) are defined at once (no
// PORT_READY). The exports return an i64 failure count, which JS sees as a
// BigInt.
(function () {
  const dir = globalThis.PORT_DIR;
  if (typeof dir !== 'string') throw new Error('set globalThis.PORT_DIR first');
  // d8: read(path, 'binary') returns an ArrayBuffer.
  const module = new WebAssembly.Module(read(dir + '/deltablue.wasm', 'binary'));
  const { exports } = new WebAssembly.Instance(module, {});
  const benchChain = exports.bench_chain;
  const benchProjection = exports.bench_projection;
  globalThis.chain = (iterations) => benchChain(iterations);
  globalThis.projection = (iterations) => benchProjection(iterations);
})();
