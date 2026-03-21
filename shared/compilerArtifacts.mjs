export function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error("Compiler returned wasm bytes in an unsupported format.");
}

export function normalizeCompileMetadata(metadata) {
  if (!metadata) return { tests: [], benches: [] };
  return {
    ...metadata,
    tests: metadata.tests ?? [],
    benches: metadata.benches ?? [],
  };
}

export function normalizeCompileArtifact(result) {
  return {
    ...result,
    wasm: toUint8Array(result.wasm),
    metadata: normalizeCompileMetadata(result.metadata),
  };
}
