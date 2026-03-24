export async function instantiate(__wasmOverride, __hostImports = {}) {
  return (await WebAssembly.instantiate(__wasmOverride, {"":{"0":(a) => console.log("hello " + a)}})).instance.exports;
}