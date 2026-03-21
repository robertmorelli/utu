import path from "node:path";
import { pathToFileURL } from "node:url";

const cliRoot = path.basename(import.meta.dir) === "dist"
  ? path.resolve(import.meta.dir, "..")
  : path.resolve(import.meta.dir, "../..");
const wasmUrl = pathToFileURL(path.join(cliRoot, "tree-sitter-utu.wasm"));
const compilerUrl = pathToFileURL(path.join(cliRoot, "..", "compiler", "index.js")).href;
let compilerPromise;

export async function compileUtuSource(source, { wat = false, mode = "program" } = {}) {
  const compiler = await (compilerPromise ??= import(compilerUrl));
  if (typeof compiler.compile !== "function") throw new Error("Shared compiler module does not export compile().");
  if (compiler.init) await compiler.init({ wasmUrl });

  const result = await compiler.compile(source, { optimize: false, wat, mode, wasmUrl });
  return { js: result.js, metadata: result.metadata ?? { tests: [], benches: [] }, wasm: bytes(result.wasm), wat: result.wat };
}

function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error("Compiler returned wasm bytes in an unsupported format.");
}
