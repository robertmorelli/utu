export function normalizeCompileArtifact(value) {
  return {
    ...value,
    js: value.js ?? value.shim,
    shim: value.shim ?? value.js,
    wasm: toUint8Array(value.wasm),
    metadata: value.metadata ?? {},
  };
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}
