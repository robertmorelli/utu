import grammarWasmPath from "../../tree-sitter-utu.wasm" with { type: "file" };
import runtimeWasmPath from "web-tree-sitter/web-tree-sitter.wasm" with { type: "file" };
import * as compiler from "../../../compiler/index.js";

const wasmUrl = grammarWasmPath;
const runtimeWasmUrl = runtimeWasmPath;

export async function compileUtuSource(source, { wat = false, mode = "program" } = {}) {
  await compiler.init({ wasmUrl, runtimeWasmUrl });

  const result = await compiler.compile(source, { wat, mode, wasmUrl, runtimeWasmUrl });
  return { js: result.js, metadata: result.metadata ?? { tests: [], benches: [] }, wasm: bytes(result.wasm), wat: result.wat };
}

function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error("Compiler returned wasm bytes in an unsupported format.");
}
